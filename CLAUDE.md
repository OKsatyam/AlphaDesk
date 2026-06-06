# AlphaDesk — Claude Context

## Project
AI-powered financial document intelligence. RAG system — upload or auto-fetch financial docs (annual reports, 10-Ks, BSE/NSE filings), ask questions in natural language, get grounded answers with page citations.

**Renamed from FolioAI → AlphaDesk (2026-05-05)**

**Target users:** Indian retail investors + finance students (Zerodha/Groww users). Secondary: US investors.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, Tailwind CSS, shadcn/ui, Framer Motion |
| Auth | NextAuth.js (Google + Email; GitHub + Twitter wired, need credentials) |
| Backend | FastAPI (Python 3.12) |
| LLM | Groq (default) / Gemini / Claude — switchable per request |
| Embeddings | sentence-transformers all-MiniLM-L6-v2 (local, free) |
| Vector DB | ChromaDB (file-based) |
| PDF parsing | PyMuPDF (fitz) + pdfplumber |
| HTML parsing | BeautifulSoup4 (SEC EDGAR 10-K files are HTML) |
| HTTP client | httpx |
| Database | PostgreSQL via asyncpg (Neon free tier — chat sync) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Dev Setup

### Backend
```bash
cd backend
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                    # runs on http://localhost:3000
```

### Environment variables
Backend — `backend/.env`:
```
APP_NAME=FolioAI
APP_VERSION=0.1.0
DEBUG=True
GROQ_API_KEY=...               # https://console.groq.com — free
ANTHROPIC_API_KEY=...          # optional, paid — console.anthropic.com
GEMINI_API_KEY=...             # free — aistudio.google.com → "Create API key in new project"
GEMINI_MODEL=gemini-flash-latest
DEFAULT_LLM_PROVIDER=groq
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHROMA_COLLECTION_NAME=folioai_documents
CHUNK_SIZE=400
CHUNK_OVERLAP=80
TOP_K_RESULTS=8
UPLOAD_DIR=storage/uploads
CHROMA_DB_PATH=storage/chroma_db
TAVILY_API_KEY=...             # free 1000/mo — tavily.com
DATABASE_URL=postgresql+asyncpg://user:pass@host/db?ssl=require   # Neon free tier
```

**Gemini key note:** Must be created via "Create API key in **new project**" at aistudio.google.com — NOT inside an existing GCP project. Keys created in existing GCP projects have `limit: 0` on free tier. Working model: `gemini-flash-latest` (gemini-2.0-flash and gemini-1.5-flash deprecated on free tier).

Frontend — `frontend/.env.local`:
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...           # optional — GitHub Dev Settings → OAuth Apps
GITHUB_CLIENT_SECRET=...
TWITTER_CLIENT_ID=...          # optional — developer.twitter.com, OAuth 2.0
TWITTER_CLIENT_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## File Structure

```
FolioAi/
├── backend/
│   ├── main.py                        # FastAPI app, all routes registered here
│   ├── requirements.txt
│   ├── storage/
│   │   ├── uploads/                   # downloaded + uploaded PDFs/HTMLs
│   │   └── chroma_db/                 # ChromaDB vector store (file-based)
│   └── app/
│       ├── config.py                  # pydantic-settings, loads .env
│       ├── models/document.py         # Pydantic models: Document, Chunk, QueryRequest, QueryResponse, Citation
│       ├── db/
│       │   ├── chroma.py              # ChromaDB singleton; auto-resets on corruption
│       │   ├── database.py            # SQLAlchemy async engine; raises HTTP 503 if no DATABASE_URL
│       │   └── pg_models.py           # PostgreSQL ORM models (Chat, Message)
│       ├── core/
│       │   ├── parser.py              # PDF + HTML → page chunks (parse_document dispatcher)
│       │   ├── chunker.py             # split pages → 400-word chunks, 80-word overlap
│       │   ├── embedder.py            # sentence-transformers → 384-dim vectors
│       │   ├── retriever.py           # ChromaDB store + cosine similarity search
│       │   ├── generator.py           # Groq/Gemini/Claude → grounded answer with citations
│       │   ├── pipeline.py            # ingest_document() + query_document() orchestrators
│       │   ├── web_search.py          # Tavily web search fallback (fires when RAG returns 0 chunks)
│       │   ├── india_formatter.py     # INR crore formatter (₹ lakhs/crores)
│       │   ├── metrics_explainer.py   # detect Indian financial metrics (ROCE, DII/FII, etc.)
│       │   ├── risk_tagger.py         # extract risk factors from citations
│       │   └── trends.py              # cross-quarter trend detection
│       ├── api/
│       │   ├── documents.py           # GET /documents, DELETE /documents/{id}, GET /documents/{id}/page/{n}
│       │   ├── fetch.py               # POST /fetch/bse, /fetch/nse, /fetch/sec — SSE streaming
│       │   ├── chats.py               # GET/POST /chats — PostgreSQL chat sync
│       │   ├── export.py              # POST /export/chat → PDF download
│       │   └── share.py               # POST /share → read-only share link
│       ├── fetchers/
│       │   ├── bse.py                 # BSE India — scored fuzzy match → scrip code → annual report PDF
│       │   ├── nse.py                 # NSE India — session warm-up + annual report download
│       │   └── sec_edgar.py           # SEC EDGAR — ticker → CIK → 10-K HTML download
│       └── prompts/
│           ├── __init__.py
│           └── hinglish.py            # Hinglish/English prompt templates
└── frontend/
    ├── app/
    │   ├── page.tsx                   # Landing page
    │   ├── chat/page.tsx              # 3-panel chat (Sidebar + ChatPanel + RightPanel)
    │   ├── companies/page.tsx         # Company library — fetch/upload/library
    │   ├── auth/page.tsx              # Auth page (Google + Email)
    │   ├── onboarding/page.tsx        # Onboarding (3 option cards)
    │   ├── share/[id]/page.tsx        # Read-only shared chat view
    │   ├── debug/page.tsx             # Debug dashboard — 7 check sections
    │   └── api/auth/[...nextauth]/    # NextAuth route handler
    ├── components/
    │   ├── chat/
    │   │   ├── ChatPanel.tsx          # Main chat UI, streaming SSE, upload, export, share, auto-save
    │   │   ├── Sidebar.tsx            # Chat history (localStorage + DB sync), History + Quick ask tabs
    │   │   ├── RightPanel.tsx         # Document/Sources/Risks/Notes tabs + citation PDF viewer
    │   │   ├── ModelSelector.tsx      # Switch Groq/Gemini/Claude + model
    │   │   └── MetricsPill.tsx        # Indian financial metric tooltips
    │   └── landing/
    │       ├── HeroSection.tsx
    │       ├── FeatureStrip.tsx
    │       ├── HowItWorks.tsx
    │       └── CompanyShowcase.tsx
    └── lib/
        ├── chat-storage.ts            # localStorage chat history (save/restore/delete/group)
        ├── db-sync.ts                 # PostgreSQL chat sync (used by Sidebar + ChatPanel)
        └── utils.ts                   # shadcn utility
```

---

## RAG Pipeline

### Ingest flow
```
file (PDF or HTML)
  → parse_document()     parser.py    extract text + tables page-by-page
  → chunk_document()     chunker.py   400-word chunks, 80-word overlap
  → embed_chunks()       embedder.py  384-dim vectors via sentence-transformers
  → store_chunks_in_chroma()          save vectors + metadata in ChromaDB
```

### Query flow
```
question
  → embed_query()                     question → vector
  → retrieve_relevant_chunks()        top-K cosine similarity from ChromaDB
  → if 0 results + doc_id → Tavily web search fallback
  → generate_answer() / stream        build prompt with citations → LLM
  → QueryResponse                     answer + citations (page numbers, snippets)
```

### Streaming (SSE events from /query/stream)
```
{ type: "citations",   citations: [...] }   # sent first
{ type: "source",      source: "document"|"web"|"combined"|"llm"|"not_found" }
{ type: "token",       text: "..." }        # one per token
{ type: "metrics",     metrics: [...] }     # Indian financial term tooltips
{ type: "risks",       risks: [...] }       # risk factors extracted
{ type: "search_limit", message: "..." }    # Tavily quota exhausted
{ type: "done" }                            # stream end
```

### Fetch SSE events (from /fetch/bse|nse|sec)
```
{ type: "progress", message: "Processing…" }   # heartbeat every 3s
{ type: "error",    detail: "..." }            # on failure
{ type: "done",     result: {...} }            # final result with document metadata
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | / | Health check |
| GET | /stats | ChromaDB chunk count |
| GET | /models | Available LLM providers + configured status |
| POST | /upload | Upload PDF → ingest |
| POST | /query | Ask question → grounded answer |
| POST | /query/stream | Streaming SSE version of /query |
| GET | /documents | List all ingested documents |
| DELETE | /documents/{id} | Remove document from ChromaDB |
| GET | /documents/{id}/page/{n} | Render PDF page as PNG (citation viewer) |
| POST | /fetch/bse | Fetch annual report from BSE India (SSE) |
| POST | /fetch/nse | Fetch annual report from NSE India (SSE) |
| POST | /fetch/sec | Fetch 10-K from SEC EDGAR (SSE) |
| POST | /export/chat | Export chat as PDF |
| POST | /share | Create read-only share link |
| GET | /trends/{company} | Cross-quarter financial trends |
| GET | /trends | List companies with ingested documents |
| GET /POST /DELETE | /chats/* | PostgreSQL chat sync (logged-in users only) |

---

## Document Sources

| Source | File | Key detail |
|--------|------|------------|
| BSE India | fetchers/bse.py | No auth. Accepts company name OR 6-digit scrip code (e.g. 532454). Scored fuzzy match for names. Short names like "TCS" may miss — use full name or code. |
| NSE India | fetchers/nse.py | 3-step Akamai warm-up (home → filings page × 2). Guards against list response on empty query. |
| SEC EDGAR | fetchers/sec_edgar.py | ticker→CIK→submissions API→10-K HTML. No API key. User-Agent header required. |
| Upload | main.py /upload | PDF only. Max 50MB. Saved to storage/uploads/ |

---

## LLM Providers

| Provider | Models | Notes |
|----------|--------|-------|
| Groq | llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it | Free, fast. Default. |
| Gemini | gemini-flash-latest, gemini-2.5-flash | Free. Key must be from AI Studio new project. gemini-1.5-x deprecated. |
| Claude | claude-haiku-4-5-20251001, claude-sonnet-4-6 | Paid. Needs credits at console.anthropic.com. |

---

## Design System

```
Primary:    #4F46E5  (deep indigo)
Accent:     #0EA5E9  (electric teal)
Success:    #10B981  (green — positive returns)
Warning:    #F59E0B  (amber — alerts)
Danger:     #EF4444  (red — negative returns)

Dark bg:    #0A0A0F / #111118 / #16161F
Light bg:   #FAFAFA / #F1F0FF / #FFFFFF
Font:       Inter
```

---

## Chat History

Key: `folioai_chats` — array of SavedChat, max 50, newest first.
Auto-saved after each completed AI response. Survives page refresh.
Logged-in users: chats synced to PostgreSQL via `/chats/*` API. Set `DATABASE_URL` in `backend/.env` to enable. Falls back to localStorage silently if DB not configured (returns HTTP 503, not 500).

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — RAG Core | ✅ Done | Full pipeline working |
| 2 — Document Sources | ✅ Done | BSE, NSE, SEC, upload all working |
| 3 — Frontend + Auth | ✅ Done | All pages, streaming, Google+Email auth |
| 4 — India-First | ✅ Done | Hinglish, INR formatter, metrics |
| 5 — Analytics | ✅ Done | Risk tagger, trends, export, share |
| 6 — Persistence + Polish | ✅ Done | PostgreSQL sync, guest TTL cleanup, citation PDF viewer, web search fallback, debug dashboard |
| 7 — Bug Fixes + Infra | ✅ Done | See below |
| 8 — Testing + Internet Toggle | ✅ Done | BSE code search, toast fix, new chat fix, web toggle, combined mode |
| 9 — Rename + Bug fixes | ✅ Done | FolioAI → AlphaDesk, active chat highlight, no-doc RAG leak |

---

## Completed Post-Phase 6 (Session 2 fixes)

- **ChromaDB auto-reset** — `get_chroma_client()` in `app/db/chroma.py` catches corruption, wipes and recreates clean DB
- **Pipeline error handling** — `store_chunks_in_chroma` wrapped in try/except in `pipeline.py`; ChromaDB failure raises `RuntimeError` (caught by SSE error handler) instead of crashing server
- **`fetchLibraryCard` SSE fix** — `frontend/app/companies/page.tsx` was calling `res.json()` on SSE stream; rewrote to use SSE reader matching `fetchAndOpen` pattern; refreshes document list after successful fetch
- **DB 503 not 500** — `app/db/database.py` raises `HTTPException(503)` when no DATABASE_URL; frontend `db-sync.ts` silently falls back to localStorage
- **BSE input validation** — `app/api/fetch.py` rejects empty/whitespace company names before HTTP call; `bse.py` rejects queries < 2 chars
- **BSE fuzzy match fix** — replaced first-match scan with scored best-match: `score = len(query)/len(company_name)`; "Infosys" now correctly matches "INFOSYS LTD" not "HCL INFOSYSTEMS LTD"
- **NSE input validation** — `app/api/fetch.py` rejects empty company names; `nse.py` guards against bare list response from NSE API on empty/garbage queries
- **NSE F&O removed** — `nse_fo.py` deleted, `/fo/{symbol}` route removed, `FoCard.tsx` deleted; NSE blocks server IPs with Akamai JS challenge, cannot fix without Playwright
- **Gemini models updated** — `gemini-1.5-x` deprecated; default now `gemini-flash-latest`; models manifest updated in `generator.py`
- **PostgreSQL connected** — Neon free tier; `ssl=require` in asyncpg URL; tables auto-created on startup

---

## Completed Post-Phase 7 (Session 3 — 2026-05-04/05)

- **BSE scrip code search** — `search_company_bse()` accepts pure numeric input (e.g. `532454`, `500180`); direct `SCRIP_CD` match, bypasses name search
- **Toast position** — `frontend/app/layout.tsx` changed `position="bottom-right"` → `position="top-right"`; was blocking SEC input
- **New Chat clears doc state** — `frontend/app/chat/page.tsx` moved `initialDocId`/`initialDocName` from raw `searchParams` into `useState`; `handleNewChat` resets both to `undefined`
- **Input clear on success** — `companies/page.tsx` `fetchAndOpen()` clears BSE/NSE/SEC input after successful fetch; failed fetches keep text for editing
- **Internet toggle (Web ON/OFF)** — Globe button in ChatPanel toolbar. `use_web: bool` field on `QueryRequest`. When ON: runs Tavily web search even when RAG has chunks, passes both to LLM via `build_combined_prompt()`. Source badge: `🌐+📄 Document + Web` (green). Files changed: `document.py`, `main.py`, `generator.py`, `hinglish.py`, `ChatPanel.tsx`

---

## Completed Post-Phase 8 (Session 4 — 2026-05-05/06)

- **Rename FolioAI → AlphaDesk** — 20+ source files updated; `backend/.env` keeps `CHROMA_COLLECTION_NAME=folioai_documents` for backward compat with existing ChromaDB data; localStorage key: `alphadesk_chats`
- **Active chat highlight** — `ChatPanel` now has `onChatCreated?: (id: string) => void` prop; called on first auto-save; parent sets `activeChatId` so sidebar highlights both new and restored chats
- **No-doc RAG leak** — `main.py` skips `retrieve_relevant_chunks` entirely when `request.document_id` is None; fresh chats without a document go straight to `source: "llm"` — no cross-contamination from other ingested docs

---

## Completed Post-Phase 9 (Session 5 — 2026-05-18: Deployment)

- **Git setup** — `.gitignore` added (excludes `.env`, `frontend/.env.local`, `storage/`, `.claude/`, `node_modules`); full codebase committed (91 files); pushed to `https://github.com/OKsatyam/AlphaDesk`
- **Monorepo structure** — single repo, Vercel points to `frontend/`, Render points to `backend/`
- **Railway → Render migration** — Railway trial expired; switched to Render free tier + $0.25/mo persistent disk
- **render.yaml** — at repo root; `rootDir: backend`, `startCommand: python main.py`, 1GB disk at `/var/data`
- **Python 3.11.9 pinned** — `runtime.txt` + `.python-version` at root and backend/; Render was defaulting to 3.14 (pydantic-core/asyncpg had no wheels)
- **CPU-only torch** — removed CUDA torch (2GB+); build cmd: `pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt`; prevents OOM on 512MB free tier
- **Embedding model pre-warm removed from blocking path** — lazy load on first request (Render timeout); background thread warm-up added in Session 6 for local dev cold-start fix
- **Missing deps added** — `reportlab>=4.0.0` added to requirements.txt
- **CORS locked** — `FRONTEND_URL` env var controls allowed origins; `*` only in dev
- **Backend live** — `https://alphadesk-c5fa.onrender.com` — health ✅, all 3 LLM providers ✅
- **Frontend live** — `https://alpha-desk-eight.vercel.app` — landing page ✅, Google auth ✅
- **Google OAuth config** — production domain added to authorized origins + redirect URIs in Google Console (auth flow not yet verified manually)

## Completed Post-Phase 9 (Session 6 — 2026-06-01/02: Bug Fixes + UX)

- **Preloaded companies → all BSE scrip codes** — switched all 8 from NSE (Akamai blocks search API) to BSE with exact scrip codes; no fuzzy matching; Tata Motors removed (BSE listing unreliable — code 500570 was demerged passenger vehicles spinoff, 544569 is parent but annual reports sparse)
- **Web search company context** — added `company_name: Optional[str]` to `QueryRequest`; both `search_web` call sites in `main.py` prefix company name to Tavily query; ChatPanel sends `uploadedDoc.company_name ?? uploadedDoc.filename`; fixes S&P 500/NVDA results appearing for Indian company stock queries
- **activeDoc ReferenceError fix** — `ChatPanel.tsx` query body used `activeDoc` (doesn't exist); correct var is `uploadedDoc`; was breaking all chat queries
- **Draggable right panel** — width drag-resizable 280–700px (default 420px) via handle at left edge; state in `chat/page.tsx`
- **Fullscreen PDF modal** — ⤢ button on citation header opens page in full-screen dark overlay with navigation; click outside to close
- **PDF fit-width** — image `width: 100%` at zoom=1 fills panel cleanly; zoom >1 enables horizontal scroll; "fit" button resets zoom; max zoom raised to 4x
- **Auto-grow textarea** — chat input grows up to 160px (≈5 lines) as user types; resets to 1 line after send
- **Embedding model warm-up** — `get_embedding_model()` called in background thread on startup; eliminates 10–20s cold-start delay on first query
- **Branding fix** — Navbar, Footer, auth page (2 instances) updated FolioAI → AlphaDesk
- **feat/deployment-config merged to master** — all above shipped to `https://alpha-desk-eight.vercel.app`

## Remaining Work

- **ChromaDB disk not mounted** — Render reports path `/opt/render/project/src/backend/storage/chroma_db` not `/var/data/chroma_db`; disk env vars (`CHROMA_DB_PATH`, `UPLOAD_DIR`) not taking effect; documents wipe on redeploy — needs fix
- GitHub + Twitter OAuth — NextAuth already wired (`route.ts`); just need env vars
- NSE annual report Akamai — warm-up works on local IPs; brittle on cloud IPs; would need Playwright for production reliability
- Alembic migrations — local dev uses `create_all`; production needs proper migration files
- **Chunking improvements (planned, not urgent):**
  - #1 Sentence-boundary overlap — never split mid-sentence (easy, ~30 min)
  - #2 Structure-aware chunking — split on headings, keep tables intact (medium, big win for financials)
  - #3 Semantic chunking — split on topic shift using embedding similarity (medium, best retrieval)
  - #4 Parent-child chunking — retrieve small chunks, send large context to LLM (hard)
  - Current: fixed 400-word / 80-word overlap word chunking (config.py:53-55)

---

## Rules for This Project

- Always run backend with `uvicorn main:app --reload` from `backend/` dir
- Always activate venv before running Python: `venv\Scripts\activate`
- If port 8000 already in use after restart: `netstat -ano | findstr :8000` → `taskkill /PID <pid> /F`
- Frontend runs on port 3000, backend on port 8000
- CORS locked to `FRONTEND_URL` env var in production; `*` only when `FRONTEND_URL` is empty (dev)
- SEC 10-K files are HTML not PDF — pipeline handles both via `parse_document()`
- NSE annual report fetcher needs 3-step warm-up (home → filings page × 2) for Akamai cookies
- BSE headers must include Referer + Origin or get 403
- ChromaDB is file-based — data lives in `storage/chroma_db/` — delete folder to reset
- DATABASE_URL format: `postgresql+asyncpg://user:pass@host/db?ssl=require` (not `ssl=true`, not `sslmode=require`)
- Gemini key: create at aistudio.google.com → "Create API key in new project" — existing GCP projects give `limit: 0`
