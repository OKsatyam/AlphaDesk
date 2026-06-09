# AlphaDesk

AI-powered financial document intelligence. Upload or auto-fetch annual reports, 10-Ks, and BSE/NSE filings — ask questions in natural language, get grounded answers with page citations.

**Live:** [alpha-desk-eight.vercel.app](https://alpha-desk-eight.vercel.app) · **Backend:** [alphadesk-c5fa.onrender.com](https://alphadesk-c5fa.onrender.com)

---

## What it does

- **RAG pipeline** — upload PDFs or auto-fetch from BSE India / NSE India / SEC EDGAR; ask questions; get answers grounded in the document with exact page citations
- **Web + Document mode** — toggle live web search (Tavily) alongside document RAG; answers cite both sources
- **Citation PDF viewer** — click any citation pill to see the exact page rendered inline; drag-resizable panel; fullscreen mode
- **Multi-LLM** — switch between Groq (free/fast), Gemini (free), Claude (paid) per request
- **India-first** — INR/crore formatting, Hinglish prompts, Indian financial metric tooltips (ROCE, DII/FII, etc.)
- **Chat history** — auto-saved to localStorage; synced to PostgreSQL for logged-in users
- **Export & Share** — download chat as PDF; create read-only share link

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, Tailwind CSS, shadcn/ui, Framer Motion |
| Auth | NextAuth.js (Google + Email) |
| Backend | FastAPI (Python 3.11) |
| LLM | Groq / Gemini / Claude — switchable per request |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local, free) |
| Vector DB | ChromaDB (file-based) |
| PDF parsing | PyMuPDF + pdfplumber |
| Database | PostgreSQL via asyncpg (Neon free tier) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Local Development

### Prerequisites
- Python 3.11
- Node.js 18+
- [Groq API key](https://console.groq.com) (free)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here          # optional — aistudio.google.com
ANTHROPIC_API_KEY=your_key_here       # optional — paid
DEFAULT_LLM_PROVIDER=groq
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHROMA_COLLECTION_NAME=folioai_documents
CHUNK_SIZE=400
CHUNK_OVERLAP=80
TOP_K_RESULTS=8
UPLOAD_DIR=storage/uploads
CHROMA_DB_PATH=storage/chroma_db
TAVILY_API_KEY=your_key_here          # optional — tavily.com, 1000 free/mo
DATABASE_URL=postgresql+asyncpg://user:pass@host/db?ssl=require  # optional — Neon
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

Create `frontend/.env.local`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=any_random_string
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Document Sources

| Source | How to use |
|--------|------------|
| **BSE India** | Enter company name or 6-digit scrip code (e.g. `532540` for TCS) |
| **NSE India** | Enter company name or NSE symbol |
| **SEC EDGAR** | Enter US ticker (e.g. `AAPL`, `TSLA`) |
| **Upload** | PDF up to 50MB |

**Preloaded companies** (one-click fetch via BSE scrip codes):
Reliance Industries · TCS · HDFC Bank · Infosys · ICICI Bank · Bajaj Finance · Wipro

---

## API

Backend runs at `http://localhost:8000`. Key endpoints:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| POST | `/upload` | Upload PDF → ingest |
| POST | `/query/stream` | SSE streaming query with citations |
| GET | `/documents` | List ingested documents |
| POST | `/fetch/bse` | Fetch BSE annual report (SSE) |
| POST | `/fetch/nse` | Fetch NSE annual report (SSE) |
| POST | `/fetch/sec` | Fetch SEC 10-K (SSE) |
| POST | `/export/chat` | Export chat as PDF |
| GET | `/models` | Available LLM providers |

---

## Project Structure

```
AlphaDesk/
├── backend/
│   ├── main.py                  # FastAPI app + all routes
│   ├── requirements.txt
│   └── app/
│       ├── config.py
│       ├── core/
│       │   ├── pipeline.py      # ingest + query orchestrators
│       │   ├── embedder.py      # sentence-transformers
│       │   ├── retriever.py     # ChromaDB store + search
│       │   ├── generator.py     # Groq / Gemini / Claude
│       │   └── web_search.py    # Tavily + DuckDuckGo fallback
│       ├── fetchers/
│       │   ├── bse.py           # BSE India scrip code lookup
│       │   ├── nse.py           # NSE India session + download
│       │   └── sec_edgar.py     # SEC EDGAR ticker → 10-K
│       └── api/
│           ├── documents.py
│           ├── fetch.py
│           ├── chats.py
│           ├── export.py
│           └── share.py
└── frontend/
    ├── app/
    │   ├── page.tsx             # Landing page
    │   ├── chat/page.tsx        # 3-panel chat UI
    │   ├── companies/page.tsx   # Company library
    │   └── auth/page.tsx        # Sign in
    └── components/
        └── chat/
            ├── ChatPanel.tsx    # Main chat + streaming
            ├── Sidebar.tsx      # Chat history
            └── RightPanel.tsx   # PDF citation viewer
```

---

## Demo Login

Email auth accepts any email + password ≥ 6 chars (no verification). Use `demo@test.com` / `demo123` to try without Google OAuth.

---

## License

MIT
