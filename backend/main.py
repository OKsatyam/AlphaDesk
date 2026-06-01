# AlphaDesk

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.config import settings
from app.core.pipeline import ingest_document, query_document
from app.core.retriever import retrieve_relevant_chunks
from app.core.generator import generate_answer_stream, MODELS
from app.core.web_search import search_web, SEARCH_LIMIT_SENTINEL
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
_origins = (
    [settings.FRONTEND_URL, "http://localhost:3000"]
    if settings.FRONTEND_URL
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
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

    # Warm embedding model in background — eliminates cold start on first query
    import threading
    from app.core.embedder import get_embedding_model
    threading.Thread(target=get_embedding_model, daemon=True).start()
    print("[startup] Embedding model warming up in background...")


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
    Upload a PDF and ingest it into AlphaDesk.
    This triggers the full pipeline:
    parse → chunk → embed → store
    """

    # validate file is a PDF
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # sanitize filename — strip path traversal (../../evil.py → evil.py)
    safe_name = os.path.basename(file.filename).replace("..", "").strip()
    if not safe_name or not safe_name.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid filename")

    # enforce size cap — read into memory to measure, then write
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed: {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    # save uploaded file to storage/uploads/
    upload_path = os.path.join(settings.UPLOAD_DIR, safe_name)
    with open(upload_path, "wb") as buffer:
        buffer.write(content)

    # run ingestion pipeline off the event loop — it's CPU-bound sync code
    document = await asyncio.to_thread(
        ingest_document,
        upload_path,
        company_name or safe_name.replace(".pdf", ""),
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

    import re as _re

    # Devanagari Unicode block U+0900–U+097F
    _DEVANAGARI_RE = _re.compile(r'[ऀ-ॿ]')

    # Romanized Hindi keyword sets — used when query is in Latin script.
    _BROAD_KEYWORDS = {
        "risk", "risks", "risk factor", "risk factors", "jokhim",
        "debt", "karza", "borrow", "borrowing", "liability", "liabilities", "obligation",
        "invest", "investment", "capital", "capex",
    }
    _PROFIT_KEYWORDS = {
        "profit", "pat", "earnings", "net income", "labh", "munafa", "faida", "kamai",
        "bottom line", "net profit",
    }

    # Hindi (Devanagari) → English retrieval query map.
    # all-MiniLM-L6-v2 is English-trained; pure Devanagari embeddings are weak.
    # Translate key financial terms so the secondary retrieval pass can match
    # English document chunks properly.
    _DEVA_TO_EN: list[tuple[str, str]] = [
        ("मुनाफ", "profit net profit PAT"),
        ("लाभ",   "profit earnings"),
        ("फायदा", "profit earnings"),
        ("कमाई",  "revenue income earnings"),
        ("जोखिम", "risk risk factors"),
        ("खतरा",  "risk"),
        ("कर्ज",  "debt borrowings loan"),
        ("उधार",  "debt loan"),
        ("आय",    "revenue income"),
        ("आमदनी", "revenue income"),
        ("निवेश",  "investment capital"),
        ("खर्च",  "expenses cost"),
        ("बिक्री", "sales revenue"),
        ("विकास",  "growth"),
        ("लाभांश", "dividend"),
        ("संपत्ति", "assets"),
        ("देनदारी", "liabilities"),
    ]

    _q_lower = request.question.lower()
    _has_devanagari = bool(_DEVANAGARI_RE.search(request.question))
    _is_broad  = any(kw in _q_lower for kw in _BROAD_KEYWORDS)
    _is_profit = any(kw in _q_lower for kw in _PROFIT_KEYWORDS)

    # Devanagari → threshold must be very low (embedding model is English-trained).
    # Broad/profit romanized queries → relaxed threshold (sections always exist in annual reports).
    if _has_devanagari:
        _threshold = 0.18
    elif _is_broad or _is_profit:
        _threshold = 0.30
    else:
        _threshold = 0.42

    async def event_stream():
        # Step 1: retrieve relevant chunks — only when a document is specified.
        # Without document_id, skip ChromaDB entirely (avoid leaking other users' docs).
        # document_id scoping is NEVER affected by query language or script.
        if request.document_id:
            citations = await asyncio.to_thread(
                retrieve_relevant_chunks,
                request.question,
                request.document_id,
                request.top_k,
                _threshold,
            )

            # Step 1a: Devanagari supplementary pass — translate Hindi terms to English
            # and re-retrieve so English-trained embeddings can match document chunks.
            if _has_devanagari:
                en_terms: list[str] = []
                for deva_fragment, en_query in _DEVA_TO_EN:
                    if deva_fragment in request.question:
                        en_terms.append(en_query)
                if en_terms:
                    en_retrieval_query = " ".join(en_terms)
                    extra = await asyncio.to_thread(
                        retrieve_relevant_chunks,
                        en_retrieval_query,
                        request.document_id,
                        request.top_k,
                        0.30,
                    )
                    seen = {c.chunk_id for c in citations}
                    for c in extra:
                        if c.chunk_id not in seen:
                            citations.append(c)
                            seen.add(c.chunk_id)

            # Step 1b: second-pass for profit queries — if retrieved chunks don't
            # contain explicit PAT/net-profit text, re-query with PAT keywords so
            # the LLM gets the right data instead of confusing Revenue for PAT.
            if _is_profit or _has_devanagari:
                _pat_kws = {"profit after tax", "pat", "net profit", "earnings", "profit for the year"}
                _has_pat = any(
                    any(kw in c.text_snippet.lower() for kw in _pat_kws)
                    for c in citations
                )
                if not _has_pat:
                    extra = await asyncio.to_thread(
                        retrieve_relevant_chunks,
                        "profit after tax PAT net profit earnings",
                        request.document_id,
                        request.top_k,
                        0.28,
                    )
                    seen = {c.chunk_id for c in citations}
                    for c in extra:
                        if c.chunk_id not in seen:
                            citations.append(c)
                            seen.add(c.chunk_id)
        else:
            citations = []

        # Step 1b: decide answer source and whether to fetch web
        web_context = ""
        search_limit_hit = False
        not_found_in_doc = False

        if citations and request.use_web:
            # RAG found results but user also wants live web — combine both
            _web_q = f"{request.company_name} {request.question}".strip() if request.company_name else request.question
            raw = await asyncio.to_thread(search_web, _web_q)
            if raw == SEARCH_LIMIT_SENTINEL:
                search_limit_hit = True
                answer_source = "document"   # fall back to doc-only
            elif raw:
                web_context = raw
                answer_source = "combined"
            else:
                answer_source = "document"

        elif citations:
            answer_source = "document"

        else:
            # No RAG results — try web if doc was specified OR user forced web
            if request.document_id or request.use_web:
                _web_q = f"{request.company_name} {request.question}".strip() if request.company_name else request.question
                raw = await asyncio.to_thread(search_web, _web_q)
                if raw == SEARCH_LIMIT_SENTINEL:
                    search_limit_hit = True
                    not_found_in_doc = bool(request.document_id)
                    answer_source = "not_found"
                elif raw:
                    web_context = raw
                    answer_source = "web"
                else:
                    not_found_in_doc = bool(request.document_id)
                    answer_source = "not_found" if request.document_id else "llm"
            else:
                answer_source = "llm"

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

        # Step 2c: if web search quota exhausted, notify frontend
        if search_limit_hit:
            yield f"data: {json.dumps({'type': 'search_limit', 'message': 'Web search quota exhausted. Tavily free tier: 1000 searches/month. Resets monthly. Answering from general knowledge instead.'})}\n\n"

        # Step 2d: if doc was provided but no relevant content found anywhere, say so
        if not_found_in_doc:
            yield f"data: {json.dumps({'type': 'token', 'text': 'This topic doesn’t appear to be covered in the uploaded document. Try rephrasing your question, or ask about a topic that is discussed in the report.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

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



if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
