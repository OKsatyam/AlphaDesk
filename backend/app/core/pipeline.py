from app.core.parser import parse_document
from app.core.chunker import chunk_document
from app.core.embedder import embed_chunks, embed_query
from app.core.retriever import store_chunks_in_chroma, retrieve_relevant_chunks
from app.core.generator import generate_answer
from app.models.document import Document, QueryResponse
from app.config import settings
from loguru import logger


def ingest_document(
    file_path: str,
    company_name: str = "",
    filing_type: str = "annual_report",
    market: str = "IN",
    max_pages: int = 0,
    extract_tables: bool = True,
) -> Document:
    """
    Full ingestion pipeline — takes a PDF file path
    and stores everything in ChromaDB ready to be queried.

    Step 1: Parse   — extract text + tables from PDF
    Step 2: Chunk   — split pages into perfect sized pieces
    Step 3: Embed   — convert chunks to vectors
    Step 4: Store   — save vectors in ChromaDB

    Returns the Document object with metadata.
    """

    print(f"\n{'='*50}")
    print(f"Starting ingestion: {file_path}")
    print(f"{'='*50}\n")

    # step 1 — parse document (PDF or HTML) into page chunks
    print("[1/4] Parsing document...")
    document, page_chunks = parse_document(
        file_path=file_path,
        company_name=company_name,
        filing_type=filing_type,
        market=market,
        max_pages=max_pages,
        extract_tables=extract_tables,
    )
    print(f"      {document.total_pages} pages extracted\n")

    # step 2 — chunk pages into smaller pieces
    print("[2/4] Chunking pages...")
    chunks = chunk_document(page_chunks)
    document.total_chunks = len(chunks)
    print(f"      {len(chunks)} chunks created\n")

    # step 3 — embed chunks into vectors
    print("[3/4] Embedding chunks...")
    chunks, embeddings = embed_chunks(chunks)
    print(f"      {len(embeddings)} vectors created\n")

    # step 4 — store in ChromaDB
    print("[4/4] Storing in ChromaDB...")
    try:
        store_chunks_in_chroma(chunks, embeddings, document=document)
    except Exception as e:
        logger.error(f"ChromaDB store failed: {e}")
        raise RuntimeError(f"Failed to store document in vector database: {e}") from e
    print(f"      Stored successfully\n")

    print(f"{'='*50}")
    print(f"Ingestion complete: {document.filename}")
    print(f"Total chunks stored: {document.total_chunks}")
    print(f"{'='*50}\n")

    return document


def query_document(
    question: str,
    document_id: str = None,
    top_k: int = None,
    language: str = "en"
) -> QueryResponse:
    """
    Full query pipeline — takes a question and returns
    a grounded answer with citations.

    Step 1: Retrieve — find most relevant chunks from ChromaDB
    Step 2: Generate — send chunks + question to Gemini

    Returns QueryResponse with answer + citations.
    """

    top_k = top_k or settings.TOP_K_RESULTS

    print(f"\nQuery: {question}")
    print(f"Language: {language}\n")

    # step 1 — retrieve relevant chunks
    print("[1/2] Retrieving relevant chunks...")
    citations = retrieve_relevant_chunks(
        question=question,
        document_id=document_id,
        top_k=top_k
    )
    print(f"      Found {len(citations)} relevant chunks\n")

    # step 2 — generate answer with Gemini
    print("[2/2] Generating answer with Gemini...")
    response = generate_answer(
        question=question,
        citations=citations,
        language=language
    )
    print(f"      Answer generated\n")

    return response