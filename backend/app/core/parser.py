import fitz  # PyMuPDF
import pdfplumber
from pathlib import Path
from app.models.document import Document, Chunk
from app.config import settings
import uuid
import re
from bs4 import BeautifulSoup


# ===================================
# Financial section keywords
# We use these to detect which section
# of the document a chunk belongs to
# ===================================
FINANCIAL_SECTIONS = [
    "management discussion",
    "risk factors",
    "balance sheet",
    "profit and loss",
    "cash flow",
    "notes to accounts",
    "auditor report",
    "directors report",
    "corporate governance",
    "financial highlights",
    "earnings",
    "revenue",
    "income statement",
    "MD&A",
    "outlook",
    "segment",
]


def detect_section(text: str) -> str:
    """
    Looks at a piece of text and tries to figure out
    which financial section it belongs to.

    For example if the text contains 'risk factors'
    we label this chunk as 'Risk Factors' section.

    This is used later for citations — so we can tell
    the user exactly which section the answer came from.
    """
    text_lower = text.lower()
    for section in FINANCIAL_SECTIONS:
        if section.lower() in text_lower:
            # capitalize nicely — "risk factors" → "Risk Factors"
            return section.title()
    return "General"


def clean_text(text: str) -> str:
    """
    Cleans up raw text extracted from PDF.

    PDFs often have messy text — extra spaces,
    weird line breaks, garbage characters.
    This function normalizes it all.
    """
    if not text:
        return ""

    # replace multiple spaces with single space
    text = re.sub(r' +', ' ', text)

    # replace multiple newlines with double newline
    text = re.sub(r'\n{3,}', '\n\n', text)

    # remove weird unicode characters that PDFs sometimes have
    text = text.encode('utf-8', errors='ignore').decode('utf-8')

    return text.strip()


def extract_tables_from_page(pdf_path: str, page_number: int) -> str:
    """
    Uses pdfplumber to extract tables from a specific page.
    Returns the table data as plain text so it can be
    chunked and embedded just like regular text.

    Example table output:
    'Revenue | Q1 2024 | Q2 2024\n12000 | 13500 | 14200'
    """
    table_text = ""

    try:
        with pdfplumber.open(pdf_path) as pdf:
            # pdfplumber pages are 0-indexed
            if page_number < len(pdf.pages):
                page = pdf.pages[page_number]
                tables = page.extract_tables()

                for table in tables:
                    if table:
                        for row in table:
                            # filter out None cells and join with |
                            clean_row = [
                                str(cell).strip()
                                if cell is not None
                                else ""
                                for cell in row
                            ]
                            table_text += " | ".join(clean_row) + "\n"
                        table_text += "\n"
    except Exception as e:
        # if table extraction fails for a page, just skip it
        # we don't want one bad page to break everything
        print(f"Table extraction warning on page {page_number}: {e}")

    return table_text


def parse_pdf(file_path: str, company_name: str = "",
              filing_type: str = "annual_report",
              market: str = "IN",
              max_pages: int = 0,
              extract_tables: bool = True) -> tuple[Document, list[Chunk]]:
    """
    Main function — takes a PDF file path and returns:
    1. A Document object with metadata about the file
    2. A list of Chunk objects — one per page (roughly)

    This is what gets called when a user uploads a PDF.

    Returns: (document, chunks)
    """

    file_path = str(file_path)
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")

    if not file_path.lower().endswith('.pdf'):
        raise ValueError(f"File must be a PDF: {file_path}")

    # create the Document object
    document = Document(
        id=str(uuid.uuid4()),
        filename=path.name,
        company_name=company_name or path.stem,
        filing_type=filing_type,
        market=market,
    )

    chunks = []
    chunk_index = 0
    current_section = "General"

    # open the PDF with PyMuPDF
    pdf_doc = fitz.open(file_path)
    document.total_pages = len(pdf_doc)

    # cap pages to keep ingest time reasonable on CPU
    page_limit = max_pages if max_pages > 0 else len(pdf_doc)
    pages_to_parse = min(len(pdf_doc), page_limit)

    print(f"Parsing: {path.name} — {pages_to_parse}/{len(pdf_doc)} pages (tables={'on' if extract_tables else 'off'})")

    # open pdfplumber once for the whole document (not per-page — that's catastrophically slow)
    plumber_pdf = None
    if extract_tables:
        try:
            plumber_pdf = pdfplumber.open(file_path)
        except Exception:
            plumber_pdf = None

    try:
        for page_num in range(pages_to_parse):
            page = pdf_doc[page_num]

            # extract text from this page via PyMuPDF (fast)
            page_text = clean_text(page.get_text())

            # optionally extract tables via pdfplumber (slow but structured)
            table_text = ""
            if plumber_pdf and page_num < len(plumber_pdf.pages):
                try:
                    tables = plumber_pdf.pages[page_num].extract_tables()
                    for table in (tables or []):
                        if table:
                            for row in table:
                                clean_row = [str(c).strip() if c else "" for c in row]
                                table_text += " | ".join(clean_row) + "\n"
                            table_text += "\n"
                except Exception:
                    pass

            combined_text = page_text
            if table_text:
                combined_text += "\n\nTABLES:\n" + table_text

            # skip pages with very little text (image-only or blank)
            if len(combined_text.strip()) < 50:
                continue

            detected = detect_section(combined_text)
            if detected != "General":
                current_section = detected

            chunks.append(Chunk(
                id=str(uuid.uuid4()),
                document_id=document.id,
                text=combined_text,
                page_number=page_num + 1,
                section=current_section,
                chunk_index=chunk_index,
            ))
            chunk_index += 1
    finally:
        pdf_doc.close()
        if plumber_pdf:
            plumber_pdf.close()

    # update document with final chunk count
    document.total_chunks = len(chunks)

    print(f"Done — extracted {len(chunks)} page chunks from {path.name}")

    return document, chunks


# ===================================
# HTML parser (SEC EDGAR 10-K files)
# ===================================

# Words per simulated "page" — keeps chunk sizes comparable to PDF pages
_HTML_WORDS_PER_PAGE = 400

# Tags whose content we skip entirely
_SKIP_TAGS = {"script", "style", "meta", "head", "noscript", "iframe"}

# Tags that signal a new section / page break
_HEADING_TAGS = {"h1", "h2", "h3", "h4"}


def _extract_text_blocks(soup: BeautifulSoup) -> list[str]:
    """
    Walk the parsed HTML tree and extract meaningful text blocks.
    Returns one string per logical block (paragraph, table row, heading).
    Skips boilerplate tags (script, style, etc.).
    """
    blocks: list[str] = []

    for tag in soup.find_all(True):
        if tag.name in _SKIP_TAGS:
            tag.decompose()

    for tag in soup.find_all(["p", "td", "th", "li", "h1", "h2", "h3", "h4", "div"]):
        # Only leaf-ish nodes — skip divs that contain block children
        if tag.name == "div" and tag.find(["p", "table", "ul", "ol"]):
            continue
        text = tag.get_text(separator=" ", strip=True)
        text = clean_text(text)
        if len(text) > 30:  # skip tiny snippets
            blocks.append(text)

    return blocks


def parse_html(
    file_path: str,
    company_name: str = "",
    filing_type: str = "10-K",
    market: str = "US",
) -> tuple[Document, list[Chunk]]:
    """
    Parse an HTML file (SEC EDGAR 10-K format) into Document + Chunks.

    HTML has no concept of "pages" — we simulate pages by grouping
    blocks into fixed word-count windows (_HTML_WORDS_PER_PAGE words each).
    Section headings force a new simulated page, matching how a reader
    would navigate the document.

    Args:
        file_path:    Path to the .htm/.html file.
        company_name: Company name for metadata.
        filing_type:  Filing type string (e.g. "10-K").
        market:       Market string (e.g. "US").

    Returns:
        (Document, list[Chunk]) — same shape as parse_pdf().
    """
    file_path = str(file_path)
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"HTML file not found: {file_path}")

    document = Document(
        id=str(uuid.uuid4()),
        filename=path.name,
        company_name=company_name or path.stem,
        filing_type=filing_type,
        market=market,
    )

    print(f"Parsing HTML: {path.name}")

    # Read with encoding fallback — SEC files are sometimes latin-1
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        raw = path.read_bytes().decode("latin-1", errors="replace")

    soup = BeautifulSoup(raw, "html.parser")

    # Remove boilerplate navigation / header / footer elements
    for tag in soup.find_all(["nav", "header", "footer"]):
        tag.decompose()

    blocks = _extract_text_blocks(soup)

    # Group blocks into simulated pages
    chunks: list[Chunk] = []
    chunk_index = 0
    current_section = "General"
    simulated_page = 1
    page_words: list[str] = []
    page_text_parts: list[str] = []

    def flush_page() -> None:
        nonlocal simulated_page, chunk_index, page_words, page_text_parts, current_section
        combined = "\n".join(page_text_parts).strip()
        if len(combined) < 50:
            return
        detected = detect_section(combined)
        if detected != "General":
            current_section = detected
        chunks.append(Chunk(
            id=str(uuid.uuid4()),
            document_id=document.id,
            text=combined,
            page_number=simulated_page,
            section=current_section,
            chunk_index=chunk_index,
        ))
        simulated_page += 1
        chunk_index += 1
        page_words = []
        page_text_parts = []

    for block in blocks:
        words = block.split()
        page_words.extend(words)
        page_text_parts.append(block)

        if len(page_words) >= _HTML_WORDS_PER_PAGE:
            flush_page()

    # Flush remaining content
    flush_page()

    document.total_pages = simulated_page - 1
    document.total_chunks = len(chunks)

    print(f"Done — extracted {len(chunks)} simulated pages from {path.name}")

    return document, chunks


# ===================================
# Unified dispatcher
# ===================================

def parse_document(
    file_path: str,
    company_name: str = "",
    filing_type: str = "annual_report",
    market: str = "IN",
    max_pages: int = 0,
    extract_tables: bool = True,
) -> tuple[Document, list[Chunk]]:
    """
    Route to the correct parser based on file extension.
    PDF → parse_pdf(), HTML → parse_html().
    max_pages=0 means no cap. extract_tables=False skips pdfplumber (much faster).
    """
    ext = Path(file_path).suffix.lower()
    if ext in {".htm", ".html"}:
        return parse_html(
            file_path=file_path,
            company_name=company_name,
            filing_type=filing_type,
            market=market,
        )
    return parse_pdf(
        file_path=file_path,
        company_name=company_name,
        filing_type=filing_type,
        market=market,
        max_pages=max_pages,
        extract_tables=extract_tables,
    )