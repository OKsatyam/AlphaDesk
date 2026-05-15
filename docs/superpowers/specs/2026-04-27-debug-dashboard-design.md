# FolioAI Debug Dashboard — Design Spec

**Goal:** A `/debug` page that runs live checks against the backend, shows pass/fail + error message + response time for every major integration point, and surfaces likely fixes for common failures.

**Scope:** Frontend only. Single file: `frontend/app/debug/page.tsx`. No new backend endpoints.

---

## Architecture

- `'use client'` Next.js page at `/app/debug/page.tsx`
- Calls backend directly via `NEXT_PUBLIC_API_URL || 'http://localhost:8000'`
- No auth required — dev tool, shown with a warning banner
- All checks share a `CheckResult` state type: `idle | running | pass | fail`
- "Run All Checks" executes checks sequentially; each check updates its own result state as it runs
- Individual "Re-run" button per check for targeted re-testing

---

## Check Result Type

```ts
interface CheckResult {
  status: 'idle' | 'running' | 'pass' | 'fail';
  message?: string;   // error detail on fail, summary on pass
  ms?: number;        // response time in ms
  fix?: string;       // hardcoded likely fix shown on fail
}
```

---

## Sections & Checks

### 1. Backend Health
| Check | Method | Endpoint | Pass condition |
|-------|--------|----------|----------------|
| Server ping | GET | `/` | 200 + `status === "running"` |
| ChromaDB stats | GET | `/stats` | 200 + `total_chunks >= 0` |
| LLM models | GET | `/models` | 200 + at least one provider listed |

Likely fixes:
- `ECONNREFUSED` → "Backend not running. Start: `uvicorn main:app --reload --port 8000`"
- Non-200 → "Check backend logs for startup errors"

---

### 2. Documents
| Check | Method | Endpoint | Pass condition |
|-------|--------|----------|----------------|
| List documents | GET | `/documents` | 200 + returns `documents` array |

Shows: document count + table of name / market / chunk count.

---

### 3. Upload — Small PDF
Programmatically generates a minimal valid 1-page PDF (hardcoded base64 ~2 KB) and POSTs it to `/upload`.

| Check | Pass condition |
|-------|----------------|
| Upload small PDF | 200 + `document_id` present + `total_chunks >= 1` |

Shows: response time, pages parsed, chunks created.

Likely fixes:
- 413 → "File too large (shouldn't happen for test PDF — check MAX_UPLOAD_SIZE_MB)"
- 500 → "Check backend logs — likely a pipeline/embedding error"

Stores the returned `document_id` for use in checks 5 and 6.

---

### 4. Upload — Large PDF (user-provided)
File picker input. User selects any PDF (e.g. Reliance AR, TCS AR).

| Check | Pass condition |
|-------|----------------|
| Upload large PDF | 200 + `document_id` present + `total_chunks > 100` |

Shows: file size, response time, pages, chunks.

Likely fixes:
- 413 → "File exceeds 50 MB limit"
- Timeout → "Embedding is slow on CPU — expected for large docs (2-5 min)"
- `ECONNRESET` → "Backend event loop blocked — verify asyncio.to_thread fix is applied"

---

### 5. RAG Query + Streaming
Uses `document_id` from check 3 (small PDF). Sends a fixed question: `"Summarise this document"` to `/query/stream`.

| Check | Pass condition |
|-------|----------------|
| Citations received | SSE event `type: "citations"` arrives within 10s |
| Tokens stream | At least one `type: "token"` event received |
| Stream completes | `type: "done"` event received within 60s |

Shows: time-to-first-token, total tokens, citation count.

Likely fixes:
- No citations → "Check TOP_K_RESULTS and relevance threshold in config.py"
- Timeout on done → "LLM provider may be down or API key invalid"
- Stream error → "Check GROQ_API_KEY in backend/.env"

---

### 6. Citation Viewer
Uses `document_id` from check 3. Calls `GET /documents/{id}/page/1`.

| Check | Pass condition |
|-------|----------------|
| Page renders | 200 + `image` field present (non-empty base64) |

Shows: thumbnail of rendered page (64px height preview), total_pages.

Likely fixes:
- 404 `File not found on disk` → "PDF was deleted from storage/uploads/ — re-upload"
- 422 → "HTML document (SEC filing) — no page images available"

---

### 7. UX Features (visual smoke test, no network)
Renders components inline with mock data — no backend call needed.

| Feature | What renders |
|---------|-------------|
| DocSummaryCard | Card with mock `{ filename: "test.pdf", total_pages: 42, total_chunks: 312, market: "IN" }` |
| Metric pills | Runs `extractMetricCards` on a sample string with bold numbers, shows extracted pills |
| Progress toast | Button that triggers the 4-step toast sequence |

Pass = component renders without throwing. Fail = JS error caught during render.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  ⚠ Debug Dashboard — Dev only                  [×]  │
│                                        [Run All]     │
├─────────────────────────────────────────────────────┤
│  ⬤ Backend Health          3/3 passed   [Re-run]    │
│  ⬤ Documents               1/1 passed   [Re-run]    │
│  ⬤ Upload (small)          1/1 passed   [Re-run]    │
│  ⬤ Upload (large)          [Drop PDF here]          │
│  ⬤ RAG Query + Streaming   3/3 passed   [Re-run]    │
│  ⬤ Citation Viewer         1/1 passed   [Re-run]    │
│  ⬤ UX Features             3/3 passed   [Re-run]    │
└─────────────────────────────────────────────────────┘
```

Badge colors: gray = idle, blue spinner = running, green = pass, red = fail.

On fail: expand row to show error message + "Likely fix:" hint.

---

## Files

| File | Change |
|------|--------|
| `frontend/app/debug/page.tsx` | New — entire debug dashboard |

No backend changes. No new dependencies.

---

## Out of scope
- Auth checks (NextAuth flow requires browser interaction)
- NSE/BSE/SEC fetch checks (trigger real 5-min operations — too slow for a debug page)
- Automated CI integration
