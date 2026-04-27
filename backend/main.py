import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.config import settings
from app.core.pipeline import ingest_document, query_document
from app.core.retriever import retrieve_relevant_chunks
from app.core.generator import generate_answer_stream, MODELS
from app.core.web_search import search_web
from app.core.metrics_explainer import detect_metrics
from app.core.india_formatter import reformat_numbers_in_text
from app.models.document import QueryRequest, QueryResponse
from app.db.chroma import get_collection_stats, cleanup_old_chunks
from app.api.documents import router as documents_router
from app.api.fetch import router as fetch_router
from app.api.export import router as export_router
from app.api.share import router as share_router
from app.api.chats import router as chats_router
from app.db.database import init_db
from app.fetchers.nse_fo import fetch_option_chain, FoDataError
from app.core.risk_tagger import tag_risks_from_citations
from app.core.trends import get_company_trends, get_available_companies
import shutil
import json
import os
import asyncio


# ===================================
# FastAPI app instance
# ===================================
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered financial document intelligence"
)


# ===================================
# CORS — allows frontend to talk
# to backend (needed in Phase 3)
# ===================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================================
# Phase 2 routers
# ===================================
app.include_router(documents_router)
app.include_router(fetch_router)
app.include_router(export_router)
app.include_router(share_router)
app.include_router(chats_router)


# ===================================
# Startup — run cleanup on boot + schedule periodic
# ===================================
async def _periodic_cleanup(interval_hours: int = 6):
    """Background task: run cleanup every interval_hours."""
    while True:
        await asyncio.sleep(interval_hours * 3600)
        removed = cleanup_old_chunks(max_age_hours=24)
        if removed:
            print(f"[cleanup] Removed {removed} stale document(s) older than 24h")

@app.on_event("startup")
async def startup_cleanup():
    """Delete guest documents older than 24h on every server start, then schedule periodic cleanup."""
    from app.config import settings
    if settings.DATABASE_URL:
        init_db()
        from app.db.database import engine
        from app.db.pg_models import Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[startup] PostgreSQL connected and tables ensured")

    removed = cleanup_old_chunks(max_age_hours=24)
    if removed:
        print(f"[startup] Cleaned up {removed} stale document(s) older than 24h")
    asyncio.create_task(_periodic_cleanup(interval_hours=6))


# ===================================
# Routes
# ===================================

@app.get("/")
def root():
    """Health check — confirms server is running"""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


@app.get("/models")
def get_models():
    """List all available LLM providers and their models."""
    return {
        "default": settings.DEFAULT_LLM_PROVIDER,
        "providers": MODELS,
        "configured": {
            "groq":   bool(settings.GROQ_API_KEY),
            "gemini": bool(settings.GEMINI_API_KEY),
            "claude": bool(settings.ANTHROPIC_API_KEY),
        },
    }


@app.get("/stats")
def get_stats():
    """Returns ChromaDB stats — how many chunks stored"""
    return get_collection_stats()


@app.delete("/cleanup")
def run_cleanup(max_age_hours: int = 24):
    """
    Manually trigger cleanup of documents older than max_age_hours.
    Default: 24 hours. Useful for production maintenance.
    """
    removed = cleanup_old_chunks(max_age_hours=max_age_hours)
    return {
        "documents_removed": removed,
        "max_age_hours": max_age_hours,
    }


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    company_name: str = "",
    filing_type: str = "annual_report",
    market: str = "IN"
):
    """
    Upload a PDF and ingest it into FolioAI.
    This triggers the full pipeline:
    parse → chunk → embed → store
    """

    # validate file is a PDF
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # enforce size cap — read into memory to measure, then write
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed: {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    # save uploaded file to storage/uploads/
    upload_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    with open(upload_path, "wb") as buffer:
        buffer.write(content)

    # run ingestion pipeline off the event loop — it's CPU-bound sync code
    document = await asyncio.to_thread(
        ingest_document,
        upload_path,
        company_name,
        filing_type,
        market,
    )

    return {
        "message": "Document ingested successfully",
        "document_id": document.id,
        "filename": document.filename,
        "total_pages": document.total_pages,
        "total_chunks": document.total_chunks
    }


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """
    Ask a question about uploaded documents.
    Returns a grounded answer with citations.
    """

    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty"
        )

    response = query_document(
        question=request.question,
        document_id=request.document_id,
        top_k=request.top_k,
        language=request.language
    )

    return response


@app.post("/query/stream")
async def query_stream(request: QueryRequest):
    """
    Streaming version of /query using Server-Sent Events (SSE).

    The frontend connects and receives two types of SSE events:
      - data: {"type": "citations", "citations": [...]}   — sent first
      - data: {"type": "token", "text": "..."}            — one per word
      - data: {"type": "done"}                            — signals end

    The frontend renders citations immediately, then appends each token
    to the chat bubble as it arrives (typewriter effect).
    """

    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    async def event_stream():
        # Step 1: retrieve relevant chunks — run in thread pool (sync+CPU)
        citations = await asyncio.to_thread(
            retrieve_relevant_chunks,
            request.question,
            request.document_id,
            request.top_k,
        )

        # Step 1b: if no citations found, decide fallback mode
        web_context = ""
        if not citations:
            if request.document_id:
                # Doc was specified but answer not found in it — try web search
                web_context = await asyncio.to_thread(search_web, request.question)
                answer_source = "web" if web_context else "llm"
            else:
                # No doc — general knowledge question
                answer_source = "llm"
        else:
            answer_source = "document"

        # Step 2: send citations first so the frontend can show them immediately
        citations_data = [
            {
                "chunk_id": c.chunk_id,
                "document_id": c.document_id,
                "page_number": c.page_number,
                "section": c.section,
                "relevance_score": c.relevance_score,
                "text_snippet": c.text_snippet,
            }
            for c in citations
        ]
        yield f"data: {json.dumps({'type': 'citations', 'citations': citations_data})}\n\n"

        # Step 2b: tell the frontend where this answer comes from
        yield f"data: {json.dumps({'type': 'source', 'source': answer_source})}\n\n"

        # Step 3: stream answer tokens, accumulate for post-processing
        full_answer = ""
        for token in generate_answer_stream(
            request.question, citations, request.language,
            provider=request.provider, model=request.model,
            web_context=web_context,
        ):
            full_answer += token
            yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"

        # Step 4: send detected Indian financial metrics as tooltips
        metrics = detect_metrics(full_answer)
        if metrics:
            yield f"data: {json.dumps({'type': 'metrics', 'metrics': metrics})}\n\n"

        # Step 5: send risk tags extracted from the retrieved citations
        risks = tag_risks_from_citations(citations_data)
        if risks:
            yield f"data: {json.dumps({'type': 'risks', 'risks': risks})}\n\n"

        # Step 6: signal end of stream
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/fo/{symbol}")
async def get_fo_data(symbol: str):
    """Fetch F&O data for a symbol from NSE."""
    try:
        return fetch_option_chain(symbol)
    except FoDataError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/trends/{company_name}")
async def get_trends(company_name: str):
    """
    Compare financial metrics across multiple uploaded documents for a company.
    Returns period-wise Revenue, PAT, EBITDA, Net Debt, Capex.
    """
    return get_company_trends(company_name)


@app.get("/trends")
async def list_companies_with_trends():
    """List all companies that have ingested documents."""
    return {"companies": get_available_companies()}
