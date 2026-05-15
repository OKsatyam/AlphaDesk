"""
Documents API
=============
Endpoints for listing and deleting documents stored in ChromaDB.

Routes:
    GET  /documents                          — list all ingested documents with metadata
    DELETE /documents/{id}                   — remove all chunks for a document from ChromaDB
    GET  /documents/{id}/page/{page_number}  — render PDF page as base64 PNG image
"""

import os
import base64
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException
from app.db.chroma import get_collection, delete_document_chunks
from app.config import settings
from loguru import logger

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents():
    """
    List all documents currently stored in ChromaDB.

    Returns one entry per unique document_id, with metadata like
    company name, filing type, market, and chunk count.
    """
    collection = get_collection()

    # Fetch all stored chunks with their metadata
    result = collection.get(include=["metadatas"])

    metadatas = result.get("metadatas", [])
    ids = result.get("ids", [])

    if not metadatas:
        return {"documents": [], "total": 0}

    # Group chunks by document_id to build one entry per document
    docs: dict[str, dict] = {}
    for chunk_id, meta in zip(ids, metadatas):
        doc_id = meta.get("document_id", "unknown")
        if doc_id not in docs:
            docs[doc_id] = {
                "document_id": doc_id,
                "company_name": meta.get("company_name", ""),
                "filing_type": meta.get("filing_type", ""),
                "market": meta.get("market", ""),
                "filename": meta.get("filename", ""),
                "chunk_count": 0,
            }
        docs[doc_id]["chunk_count"] += 1

    return {
        "documents": list(docs.values()),
        "total": len(docs),
    }


@router.get("/{document_id}/page/{page_number}")
def get_document_page(document_id: str, page_number: int):
    """
    Render a single PDF page as a base64-encoded PNG image.

    Used by the frontend citation viewer to show the actual document page
    instead of just the text snippet.

    Returns:
        { image: "<base64 png>", page_number: int, total_pages: int }

    Raises 404 if document or file not found.
    Raises 400 if page number is out of range.
    Raises 422 if document is HTML (no renderable pages).
    """
    collection = get_collection()

    # look up any chunk from this document to get the filename
    result = collection.get(
        where={"document_id": document_id},
        include=["metadatas"],
        limit=1,
    )
    metadatas = result.get("metadatas", [])
    if not metadatas:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    filename = metadatas[0].get("filename", "")
    if not filename:
        raise HTTPException(
            status_code=404,
            detail="Filename not stored for this document — re-ingest to enable page viewer"
        )

    # HTML documents can't be rendered as images
    if filename.lower().endswith((".htm", ".html")):
        raise HTTPException(
            status_code=422,
            detail="Page images are not available for HTML documents (SEC EDGAR filings). Use the text snippet instead."
        )

    file_path = os.path.join(settings.UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found on disk")

    # render with PyMuPDF at 2× zoom for crisp display
    pdf_doc = fitz.open(file_path)
    total_pages = len(pdf_doc)

    if page_number < 1 or page_number > total_pages:
        pdf_doc.close()
        raise HTTPException(
            status_code=400,
            detail=f"Page {page_number} out of range — document has {total_pages} pages"
        )

    page = pdf_doc[page_number - 1]          # fitz is 0-indexed
    matrix = fitz.Matrix(2.0, 2.0)           # 2× zoom → ~150 DPI
    pixmap = page.get_pixmap(matrix=matrix)
    img_bytes = pixmap.tobytes("png")
    pdf_doc.close()

    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    logger.info(f"Rendered page {page_number}/{total_pages} for document '{document_id}'")

    return {
        "image": img_b64,
        "page_number": page_number,
        "total_pages": total_pages,
        "format": "png",
    }


@router.delete("/{document_id}")
def delete_document(document_id: str):
    """
    Delete all chunks belonging to a document from ChromaDB.

    This removes the document from the vector store so it won't appear
    in future query results. It does NOT delete the source PDF file.

    Args:
        document_id: The document UUID assigned during ingestion.
    """
    # First verify the document exists
    collection = get_collection()
    result = collection.get(
        where={"document_id": document_id},
        include=["metadatas"],
    )
    chunk_ids = result.get("ids", [])

    if not chunk_ids:
        raise HTTPException(
            status_code=404,
            detail=f"No document found with id '{document_id}'"
        )

    # Use the existing helper which handles deletion
    delete_document_chunks(document_id)

    logger.info(f"Deleted document '{document_id}' ({len(chunk_ids)} chunks removed)")

    return {
        "message": "Document deleted",
        "document_id": document_id,
        "chunks_removed": len(chunk_ids),
    }

    return {
        "message": "Document deleted successfully",
        "document_id": document_id,
        "chunks_removed": len(chunk_ids),
    }
