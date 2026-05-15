"""
SEC EDGAR Auto-Fetcher
======================
Auto-fetches 10-K annual reports from the US SEC EDGAR system.

Flow:
    1. ticker_to_cik(ticker)              — ticker symbol → SEC CIK number
    2. fetch_10k_filings(cik)             — CIK → list of 10-K filing accessions
    3. find_pdf_in_filing(cik, accession) — accession → direct PDF URL
    4. download_sec_report(url, filename) — download PDF → local path
    5. fetch_sec_document(ticker, year)   — orchestrates 1→2→3→4

Usage:
    from app.fetchers.sec_edgar import fetch_sec_document

    result = fetch_sec_document("AAPL")
    # result = {
    #     "file_path": "storage/uploads/sec_AAPL_10-K_2024.pdf",
    #     "company_name": "Apple Inc.",
    #     "ticker": "AAPL",
    #     "cik": "320193",
    #     "year": 2024,
    #     "filing_type": "10-K",
    #     "market": "US"
    # }

    from app.core.pipeline import ingest_document
    document = ingest_document(
        file_path=result["file_path"],
        company_name=result["company_name"],
        filing_type=result["filing_type"],
        market=result["market"]
    )
"""

import os
import re
from typing import Optional

import httpx
from loguru import logger

from app.config import settings


# ===================================
# Custom exceptions
# ===================================

class CompanyNotFoundError(Exception):
    """Raised when ticker does not match any SEC listing."""
    pass


class NoFilingsFoundError(Exception):
    """Raised when the company has no 10-K filings on EDGAR."""
    pass


class DownloadError(Exception):
    """Raised when the PDF download from SEC EDGAR fails."""
    pass


# ===================================
# Constants
# ===================================

# SEC requires a descriptive User-Agent with contact info — bots without this get blocked
SEC_HEADERS = {
    "User-Agent": "AlphaDesk financial-research-tool sk921353@gmail.com",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Full list of all SEC-registered companies with their tickers and CIKs
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# Submissions endpoint: returns all filings for a company by CIK
# CIK must be zero-padded to 10 digits
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik_padded}.json"

# EDGAR filing index: lists all files in a specific filing
SEC_FILING_INDEX_URL = (
    "https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/"
    "{accession_nodash}-index.json"
)

# Base URL for EDGAR file downloads
SEC_ARCHIVE_BASE = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/"

REQUEST_TIMEOUT = httpx.Timeout(connect=15.0, read=90.0, write=10.0, pool=5.0)


# ===================================
# Step 1: Ticker → CIK
# ===================================

def ticker_to_cik(ticker: str) -> tuple[str, str]:
    """
    Resolve a stock ticker to its SEC CIK number and company name.

    Uses the full company tickers JSON published by SEC (updated daily).
    This file maps every SEC-registered ticker to its CIK and company name.

    Args:
        ticker: Stock ticker symbol, e.g. "AAPL", "TSLA", "MSFT"

    Returns:
        Tuple of (cik_string, company_name)
        CIK is returned as a plain integer string (not zero-padded).

    Raises:
        CompanyNotFoundError: Ticker not found in SEC database.
        httpx.HTTPError: Network failure fetching the tickers file.
    """
    ticker_upper = ticker.strip().upper()
    logger.info(f"Resolving SEC CIK for ticker: {ticker_upper}")

    with httpx.Client(headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT) as client:
        response = client.get(SEC_TICKERS_URL)

    if response.status_code != 200:
        raise CompanyNotFoundError(
            f"SEC tickers list returned HTTP {response.status_code}"
        )

    # Response is a dict keyed by integer index:
    # { "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ... }
    data = response.json()

    for entry in data.values():
        if entry.get("ticker", "").upper() == ticker_upper:
            cik = str(entry["cik_str"])
            company_name = entry.get("title", ticker_upper)
            logger.success(f"Resolved {ticker_upper} → CIK {cik} ({company_name})")
            return cik, company_name

    raise CompanyNotFoundError(
        f"Ticker '{ticker}' not found in SEC EDGAR. "
        "Use the official NYSE/NASDAQ ticker symbol (e.g. 'AAPL', 'TSLA', 'GOOGL')."
    )


# ===================================
# Step 2: CIK → 10-K filings list
# ===================================

def fetch_10k_filings(cik: str) -> list[dict]:
    """
    Get all 10-K annual report filings for a company from EDGAR.

    The submissions API returns a paginated list of all filings.
    We extract only 10-K forms (not 10-K/A amendments) sorted newest first.

    Args:
        cik: SEC CIK number as string (not padded), e.g. "320193"

    Returns:
        List of dicts, each with: accession, year, date_filed
        Sorted newest-first.

    Raises:
        NoFilingsFoundError: No 10-K filings found for this CIK.
    """
    cik_padded = cik.zfill(10)
    url = SEC_SUBMISSIONS_URL.format(cik_padded=cik_padded)

    logger.info(f"Fetching 10-K filing list for CIK {cik}")

    with httpx.Client(headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT) as client:
        response = client.get(url)

    if response.status_code != 200:
        raise NoFilingsFoundError(
            f"SEC submissions API returned HTTP {response.status_code} for CIK {cik}"
        )

    data = response.json()

    # filings.recent contains parallel arrays for each filing field
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])

    primary_docs = recent.get("primaryDocument", [])

    filings = []
    for i, (form, accession, date) in enumerate(zip(forms, accessions, dates)):
        # Only 10-K (not 10-K/A amendments, 10-KT transition reports)
        if form != "10-K":
            continue

        # Extract fiscal year from filing date (e.g. "2024-09-28" → 2024)
        year = None
        try:
            year = int(date[:4]) if date else None
        except (ValueError, IndexError):
            pass

        primary_doc = primary_docs[i] if i < len(primary_docs) else None

        filings.append({
            "accession": accession,            # e.g. "0000320193-24-000123"
            "year": year,
            "date_filed": date,
            "primary_doc": primary_doc,        # e.g. "aapl-20250927.htm"
        })

    if not filings:
        raise NoFilingsFoundError(
            f"No 10-K filings found for CIK {cik}. "
            "The company may not file annual reports with the SEC."
        )

    # Already returned newest-first by EDGAR API, but sort explicitly to be safe
    filings.sort(key=lambda f: f["date_filed"] or "", reverse=True)

    logger.info(f"Found {len(filings)} 10-K filing(s) for CIK {cik}")
    return filings


# ===================================
# Step 3: Find PDF in filing index
# ===================================

def find_pdf_in_filing(cik: str, accession: str) -> Optional[str]:
    """
    Find the main 10-K PDF URL within a specific EDGAR filing.

    Each EDGAR filing is a folder of documents. We fetch the filing index
    (a JSON list of all documents) and look for the primary 10-K document.

    Priority:
        1. A file explicitly marked as primary document type "10-K"
        2. Any .htm/.html file with "10k" or "10-k" in the name
        3. Any .pdf file in the filing

    Args:
        cik:       CIK string (not padded), e.g. "320193"
        accession: Accession number with dashes, e.g. "0000320193-24-000123"

    Returns:
        Full URL to the best PDF/HTML document, or None if nothing found.
    """
    accession_nodash = accession.replace("-", "")
    index_url = SEC_FILING_INDEX_URL.format(
        cik=cik,
        accession_nodash=accession_nodash
    )

    try:
        with httpx.Client(headers=SEC_HEADERS, timeout=REQUEST_TIMEOUT) as client:
            response = client.get(index_url)

        if response.status_code != 200:
            logger.warning(f"Filing index returned HTTP {response.status_code}: {index_url}")
            return None

        data = response.json()
        documents = data.get("documents", [])

        base_url = SEC_ARCHIVE_BASE.format(cik=cik, accession_nodash=accession_nodash)

        # Pass 1: primary document with type 10-K and .htm extension
        for doc in documents:
            if doc.get("type") == "10-K":
                filename = doc.get("filename", "")
                if filename.lower().endswith((".htm", ".html", ".pdf")):
                    return base_url + filename

        # Pass 2: any file with "10k" or "annual" in name
        for doc in documents:
            filename = doc.get("filename", "").lower()
            if any(kw in filename for kw in ["10k", "10-k", "annual"]):
                if filename.endswith((".htm", ".html", ".pdf")):
                    return base_url + doc["filename"]

        # Pass 3: first .htm file (most 10-Ks are HTML on EDGAR)
        for doc in documents:
            filename = doc.get("filename", "")
            if filename.lower().endswith((".htm", ".html")):
                return base_url + filename

        # Pass 4: first .pdf file
        for doc in documents:
            filename = doc.get("filename", "")
            if filename.lower().endswith(".pdf"):
                return base_url + filename

    except Exception as exc:
        logger.warning(f"Error fetching filing index for {accession}: {exc}")

    return None


# ===================================
# Step 4: Download file
# ===================================

def download_sec_report(url: str, filename: str) -> str:
    """
    Download a 10-K document from SEC EDGAR.

    Handles both PDF and HTML documents. For HTML files (most EDGAR 10-Ks),
    the file is downloaded as-is — PyMuPDF cannot parse HTML, so the pipeline
    will need to handle this. We convert the extension to .html so the parser
    can detect and handle it appropriately.

    Uses streaming download for large files.

    Args:
        url:      Full URL to the document on SEC EDGAR.
        filename: Base filename for local storage.

    Returns:
        Absolute path to the saved file.

    Raises:
        DownloadError: If the download fails.
    """
    safe_filename = "sec_" + re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    local_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    if os.path.exists(local_path):
        logger.info(f"Using cached file: {local_path}")
        return local_path

    logger.info(f"Downloading: {url}")

    try:
        with httpx.Client(
            headers=SEC_HEADERS,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        ) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise DownloadError(
                        f"Download failed: HTTP {response.status_code} for {url}"
                    )

                os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

                with open(local_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)

    except DownloadError:
        raise
    except httpx.TimeoutException as exc:
        raise DownloadError(
            f"Download timed out for {url}"
        ) from exc
    except httpx.HTTPError as exc:
        raise DownloadError(
            f"Network error downloading {url}: {exc}"
        ) from exc
    except OSError as exc:
        raise DownloadError(
            f"Failed to write file to {local_path}: {exc}"
        ) from exc

    file_size_kb = os.path.getsize(local_path) / 1024
    logger.success(f"Downloaded '{safe_filename}' ({file_size_kb:.1f} KB) → {local_path}")
    return local_path


# ===================================
# Step 5: Main entry point
# ===================================

def fetch_sec_document(
    ticker: str,
    year: Optional[int] = None
) -> dict:
    """
    Auto-fetch a 10-K annual report from SEC EDGAR for a given US ticker.

    Orchestrates: ticker → CIK → filings list → PDF URL → download

    Args:
        ticker: NYSE/NASDAQ ticker symbol, e.g. "AAPL", "TSLA", "MSFT"
        year:   Filing year to fetch (e.g. 2024). If None, fetches the
                most recent 10-K.

    Returns:
        dict with these keys (directly usable with ingest_document()):
            file_path     — local path to downloaded file
            company_name  — official SEC company name
            ticker        — ticker symbol (uppercased)
            cik           — SEC CIK number
            year          — fiscal year of the filing (int or None)
            filing_type   — always "10-K"
            market        — always "US"

    Raises:
        CompanyNotFoundError: Ticker not found in SEC EDGAR.
        NoFilingsFoundError:  Company found but no 10-K filings available.
        DownloadError:        Document download failed.
    """
    ticker = ticker.strip().upper()

    # Step 1: resolve ticker → CIK
    cik, company_name = ticker_to_cik(ticker)

    # Step 2: get list of 10-K filings
    filings = fetch_10k_filings(cik)

    # Select target year or most recent
    if year is not None:
        matching = [f for f in filings if f["year"] == year]
        if not matching:
            available = [f["year"] for f in filings if f["year"]]
            raise NoFilingsFoundError(
                f"No 10-K found for {company_name} in {year}. "
                f"Available years: {available}"
            )
        target = matching[0]
    else:
        target = filings[0]

    logger.info(
        f"Selected 10-K: accession={target['accession']} "
        f"date={target['date_filed']} year={target['year']}"
    )

    # Step 3: find the actual document URL inside the filing
    # Prefer primaryDocument from submissions API (no extra HTTP call needed)
    accession_nodash = target["accession"].replace("-", "")
    primary_doc = target.get("primary_doc")
    if primary_doc:
        doc_url = SEC_ARCHIVE_BASE.format(cik=cik, accession_nodash=accession_nodash) + primary_doc
    else:
        doc_url = find_pdf_in_filing(cik, target["accession"])
    if not doc_url:
        raise DownloadError(
            f"Could not locate a document in SEC filing {target['accession']} "
            f"for {company_name}. Try a different year."
        )

    # Build a clean local filename
    accession_clean = target["accession"].replace("-", "")
    extension = ".html" if doc_url.lower().endswith((".htm", ".html")) else ".pdf"
    local_filename = f"{ticker}_10-K_{target['year'] or 'latest'}{extension}"

    # Step 4: download
    local_path = download_sec_report(doc_url, local_filename)

    return {
        "file_path": local_path,
        "company_name": company_name,
        "ticker": ticker,
        "cik": cik,
        "year": target["year"],
        "filing_type": "10-K",
        "market": "US",
    }
