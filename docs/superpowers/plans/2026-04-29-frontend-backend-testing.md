# FolioAI Frontend–Backend Integration Testing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every frontend page and API call works correctly against the local backend, and produce a complete list of errors.

**Architecture:** Static analysis (TypeScript + lint) first, then live endpoint contract checks against running backend, then full feature flow tests using the `/debug` dashboard and direct API calls.

**Tech Stack:** Next.js 14, FastAPI, Python 3.12, curl/Python for API tests

---

## Task 1: Backend startup + health

**Files:** `backend/main.py`, `backend/.env`

- [ ] **Step 1: Start backend**

```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```
Expected output: `INFO: Application startup complete.`
Watch for errors — missing imports, DB errors, etc.

- [ ] **Step 2: Verify startup log — no import errors**

Expected lines:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```
**Flag any:** `ImportError`, `ModuleNotFoundError`, `KeyError`, `AttributeError`

- [ ] **Step 3: Hit health endpoint**

```bash
curl http://localhost:8000/
```
Expected:
```json
{"app":"FolioAI","version":"0.1.0","status":"running"}
```

- [ ] **Step 4: Hit /stats**

```bash
curl http://localhost:8000/stats
```
Expected: `{"collection_name":"folioai_documents","total_chunks":...,"db_path":"..."}`

- [ ] **Step 5: Hit /models**

```bash
curl http://localhost:8000/models
```
Expected: `configured.groq`, `configured.gemini`, `configured.claude` all `true`

---

## Task 2: Validate all 3 security fixes

**Files:** `backend/main.py`, `backend/app/models/document.py`

- [ ] **Step 1: top_k > 20 rejected**

```bash
curl -s -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"test\",\"top_k\":99999}"
```
Expected: HTTP 422, body contains `"less_than_equal"` or `"le"`

- [ ] **Step 2: Empty question rejected**

```bash
curl -s -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"\",\"top_k\":5}"
```
Expected: HTTP 422

- [ ] **Step 3: Question > 2000 chars rejected**

```bash
python -c "
import urllib.request, json
body = json.dumps({'question': 'x'*2001, 'top_k': 5}).encode()
req = urllib.request.Request('http://localhost:8000/query', data=body, headers={'Content-Type':'application/json'}, method='POST')
try:
    urllib.request.urlopen(req, timeout=5)
    print('FAIL — expected 422')
except urllib.error.HTTPError as e:
    print('PASS' if e.code == 422 else f'FAIL got {e.code}')
"
```
Expected: `PASS`

- [ ] **Step 4: top_k < 1 rejected**

```bash
curl -s -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"test\",\"top_k\":0}"
```
Expected: HTTP 422

---

## Task 3: Frontend TypeScript check

**Files:** `frontend/tsconfig.json`, all `.tsx`/`.ts` files

- [ ] **Step 1: Run TypeScript type check**

```bash
cd frontend
npm run build 2>&1 | head -60
```
Expected: `Route (app)` table, no red type errors. **Log every error line starting with `Error:`**

- [ ] **Step 2: Run lint**

```bash
cd frontend
npm run lint 2>&1
```
Expected: `✔ No ESLint warnings or errors`. **Log every warning/error.**

- [ ] **Step 3: Check .env.local has required vars**

```bash
cat frontend/.env.local
```
Must have:
- `NEXTAUTH_URL=http://localhost:3000`
- `NEXTAUTH_SECRET=` (non-empty)
- `NEXT_PUBLIC_API_URL=http://localhost:8000`
- `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`

Flag any missing values.

---

## Task 4: Frontend startup

**Files:** `frontend/app/layout.tsx`, `frontend/app/page.tsx`

- [ ] **Step 1: Start frontend dev server**

```bash
cd frontend
npm run dev
```
Expected: `Ready in Xs` on port 3000. No compile errors.

- [ ] **Step 2: Check root page loads**

Visit `http://localhost:3000` in browser.
Expected: Landing page renders — HeroSection, FeatureStrip, HowItWorks, CompanyShowcase visible.
**Flag:** blank page, 500 error, hydration errors in console.

- [ ] **Step 3: Check browser console for errors**

Open DevTools → Console. Reload page.
**Flag any:** `Error:`, `TypeError:`, `Failed to fetch`, `CORS`, `Unhandled`

---

## Task 5: Backend API contract — all routes frontend calls

**Files:** `backend/main.py`, `backend/app/api/*.py`

Run each curl. Note: backend must be running.

- [ ] **Step 1: GET /documents**

```bash
curl -s http://localhost:8000/documents
```
Expected: JSON array (may be empty). Each item has `id`, `filename`, `total_chunks`.

- [ ] **Step 2: POST /upload — valid PDF**

```bash
cd backend
curl -s -X POST http://localhost:8000/upload \
  -F "file=@test_report.pdf" \
  -F "company_name=TestCorp"
```
Expected: `{"message":"Document ingested successfully","document_id":"...","filename":"...","total_pages":...,"total_chunks":...}`
**Flag:** 422, 500, timeout.

- [ ] **Step 3: POST /query/stream — with doc**

After upload, copy `document_id` from Step 2, then:
```bash
curl -s -N -X POST http://localhost:8000/query/stream \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What is the revenue?\",\"document_id\":\"<ID>\",\"top_k\":5}"
```
Expected SSE events in order:
```
data: {"type":"citations","citations":[...]}
data: {"type":"source","source":"document"}
data: {"type":"token","text":"..."}
...
data: {"type":"done"}
```
**Flag:** `source: web` or `source: llm` when doc was provided (means RAG missed).

- [ ] **Step 4: POST /query/stream — no doc (general knowledge)**

```bash
curl -s -N -X POST http://localhost:8000/query/stream \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What is ROCE?\",\"top_k\":5}"
```
Expected: `source: llm`, answer tokens stream, `done` event.

- [ ] **Step 5: GET /documents/{id}/page/1 — citation PDF viewer**

```bash
curl -s -o page.png "http://localhost:8000/documents/<ID>/page/1"
file page.png
```
Expected: `PNG image data`. **Flag:** 404, 500, empty file.

- [ ] **Step 6: POST /export/chat**

```bash
curl -s -X POST http://localhost:8000/export/chat \
  -H "Content-Type: application/json" \
  -d "{\"company_name\":\"Test\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\",\"citations\":[]}]}" \
  -o export_test.pdf
file export_test.pdf
```
Expected: `PDF document`. **Flag:** error JSON, empty file.

- [ ] **Step 7: POST /share**

```bash
curl -s -X POST http://localhost:8000/share \
  -H "Content-Type: application/json" \
  -d "{\"company_name\":\"Test\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\",\"citations\":[],\"metrics\":[]}]}"
```
Expected: `{"url":"/share/..."}`. **Flag:** 500, missing `url`.

- [ ] **Step 8: DELETE /documents/{id} — cleanup**

```bash
curl -s -X DELETE http://localhost:8000/documents/<ID>
```
Expected: `{"message":"Document deleted","document_id":"..."}` or 204.

---

## Task 6: Frontend pages — route smoke test

- [ ] **Step 1: /auth page**

Visit `http://localhost:3000/auth`
Expected: Google sign-in button + Email sign-in form visible.
**Flag:** blank, 404, console errors.

- [ ] **Step 2: /companies page**

Visit `http://localhost:3000/companies`
Expected: Fetch panel (BSE/NSE/SEC tabs) + upload section + library list.
**Flag:** blank, `Cannot read properties of undefined`, network error toast.

- [ ] **Step 3: /chat page**

Visit `http://localhost:3000/chat`
Expected: 3-panel layout — Sidebar + ChatPanel + RightPanel (collapsed).
Check: ModelSelector shows Groq as default. Quick chips visible.
**Flag:** blank, missing panels, console errors.

- [ ] **Step 4: /debug page**

Visit `http://localhost:3000/debug`
Expected: Debug dashboard loads, "Run All Checks" button visible.
Click "Run All Checks". Watch results.
**Expected pass:** Health, Stats, Models, Documents, RAG+Streaming, Citation viewer.
**Log every FAIL section.**

---

## Task 7: Frontend–backend CORS + connectivity

- [ ] **Step 1: Check CORS headers from frontend origin**

```bash
curl -s -I -X OPTIONS http://localhost:8000/query/stream \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"
```
Expected headers:
```
access-control-allow-origin: *
access-control-allow-methods: *
```

- [ ] **Step 2: Check NEXT_PUBLIC_API_URL is read correctly**

In browser DevTools → Network tab. Submit a query in chat.
Check the request URL — must be `http://localhost:8000/query/stream` not `undefined/query/stream`.
**Flag:** `undefined` in URL = `NEXT_PUBLIC_API_URL` not set in `.env.local`.

- [ ] **Step 3: Check SSE streaming in browser**

In chat page, ask "What is PE ratio?".
Expected: typing animation appears, answer streams token by token, `🤖 General knowledge` badge appears.
**Flag:** spinner hangs forever, no text, CORS error in console.

---

## Task 8: Key feature flows

- [ ] **Step 1: Upload + Query flow**

In `/chat`: click paperclip → upload `backend/test_report.pdf`.
Expected: toast "✓ Ready — X chunks indexed". DocSummaryCard appears.
Ask: "What is the revenue?"
Expected: citations appear (p.X pills), answer streams, source is `document`.

- [ ] **Step 2: RightPanel citation viewer**

Click a citation pill. RightPanel should open to Document tab.
Expected: PDF page image renders (from `/documents/{id}/page/{n}`).
**Flag:** blank tab, "Failed to load page", 404 in network.

- [ ] **Step 3: Model switch — Gemini**

In ModelSelector, switch to Gemini 1.5 Flash.
Ask "What is EBITDA?"
Expected: answer streams with Gemini, no error message in response.
**Flag:** `[GEMINI error]` text in answer.

- [ ] **Step 4: Chat history save + restore**

After asking 2 questions, refresh page (`http://localhost:3000/chat`).
Open Sidebar → History tab.
Expected: previous chat appears with title from first question.
Click it → messages restore.
**Flag:** empty sidebar, messages lost.

- [ ] **Step 5: Hinglish toggle**

Click `EN` button in chat top bar (switches to Hinglish).
Ask "revenue kya hai?"
Expected: answer in Hindi/Hinglish mix.

- [ ] **Step 6: Export chat PDF**

After a query, click Download icon.
Expected: `FolioAI_<timestamp>.pdf` downloads.
**Flag:** 500 error toast, no download.

- [ ] **Step 7: Share chat**

Click Share icon.
Expected: toast "Share link copied to clipboard!"
Visit the copied URL (`/share/<id>`).
Expected: read-only chat view renders.

---

## Task 9: Error state verification

- [ ] **Step 1: Web search fallback — no doc query**

Ask "What is Reliance Industries FY24 revenue?" without uploading any doc.
Expected: Tavily hits → real web results OR `🤖 General knowledge` badge.
**Flag:** `[GROQ error]`, blank response.

- [ ] **Step 2: Invalid model — should show error in chat**

Use browser DevTools to intercept a query and send `provider: "groq", model: "fake-model-999"`.
Or: temporarily edit ModelSelector to add a fake model.
Expected: error text in chat bubble, not a crash.

- [ ] **Step 3: Fetch from BSE — known company**

In `/companies`, BSE tab, enter "Reliance Industries", click Fetch.
Expected: progress toast → success → doc appears in library.
**Flag:** 502, 403, timeout.

---

## Error Log Template

After all tasks, compile errors found:

```
BACKEND ERRORS:
- [ ] Task N, Step M: <description>

FRONTEND BUILD ERRORS:
- [ ] <file>:<line>: <error>

FRONTEND RUNTIME ERRORS:
- [ ] <page>: <console error>

FEATURE FAILURES:
- [ ] <feature>: <what broke>

CORS / CONNECTIVITY:
- [ ] <description>
```

---

## Execution note

Run Tasks 1–3 first (no browser needed). Then start both servers (Tasks 4–5). Then browser tasks (Tasks 6–9). Log every failure — don't fix during testing. Fix pass comes after full audit.
