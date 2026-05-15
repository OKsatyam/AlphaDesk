# Chat UX Improvements — Design Spec

**Goal:** Improve the chat experience for financial document analysis without backend changes — document summary card, metric card renderer, and ingest progress feedback.

**Scope:** Frontend only. Single file: `frontend/components/chat/ChatPanel.tsx`.

---

## 1. Document Summary Card

### What
A dismissable info card shown at the top of the chat message area when a document is loaded, before the user sends their first message.

### Behaviour
- Add `const [summaryDismissed, setSummaryDismissed] = useState(false)` to ChatPanel
- Visible when: `uploadedDoc !== null && !summaryDismissed`
- Dismissed by: user clicking ×, or automatically when user sends first message (call `setSummaryDismissed(true)` at start of `handleSend`)
- Reset to `false` when a new document is uploaded (`setUploadedDoc` call)

### Content
```
┌──────────────────────────────────────────────────┐
│  [PDF icon]  tcs.pdf                       [×]   │
│  TCS  ·  Annual Report  ·  IN              │
│  336 pages  ·  694 chunks indexed  ·  Ready      │
└──────────────────────────────────────────────────┘
```

### State change
`uploadedDoc` currently: `{ document_id: string; filename: string }`
Extend to: `{ document_id: string; filename: string; total_pages?: number; total_chunks?: number; company_name?: string; market?: string }`

Update `handleUpload()` and the `initialDocId`/`restoredChat` init path to populate these fields from the API response.

### Style
- Amber border (`rgba(232,160,32,0.3)`), subtle amber background (`rgba(232,160,32,0.06)`)
- Rounded-2xl, padding 4, animate in with framer-motion `fadeUp`
- Dismiss (×) top-right, `var(--text-tertiary)` color

---

## 2. Metric Card Renderer

### What
After each AI response, extract bold financial figures from the answer text and render them as a horizontal-scroll row of pill cards above the prose.

### Extraction logic
Regex on the rendered answer string:
```
/\*\*([\₹\$]?[\d,]+(?:\.\d+)?(?:\s?[LCBKMTlcbkmt][\s\w]*)?)\*\*/g
```
For each match, look back up to 40 characters in the text to infer a label (the last noun phrase before the number). Cap at 6 cards. If 0 matches, render nothing.

### Label inference
Scan backwards from the match for common financial keywords:
`revenue, pat, profit, ebitda, margin, eps, dividend, employees, growth, debt, cash`
Use the nearest keyword as the label, title-cased. Fall back to "Key Figure" if none found.

### Card design
```
┌──────────────┐
│  Revenue     │
│ ₹2,55,324 Cr │  ← amber, monospace
└──────────────┘
```
- Small pill: `px-3 py-2`, rounded-xl
- Label: `10px`, `var(--text-secondary)`
- Value: `13px`, `var(--primary)`, `var(--font-mono)`
- Row: `flex gap-2 overflow-x-auto pb-1` above the answer prose
- Only rendered for `role === 'ai'` messages, not user messages

### Placement
Inside the existing AI message bubble, above the markdown-rendered answer text.

---

## 3. Ingest Progress Steps

### What
Replace the static `toast.loading('Uploading…')` with a 4-step animated progress sequence.

### Steps
```
Step 1 (0s):    ⬆  Uploading file…
Step 2 (+1.5s): 📄  Parsing 336 pages…   ← uses actual filename context
Step 3 (+3.5s): 🔢  Embedding chunks…
Step 4 (on API response): ✓  Ready — 694 chunks indexed
```

### Implementation
- Steps 1–3: `setTimeout` updates to the same `toastId` via `toast.loading(..., { id: toastId })`
- Step 4: `toast.success(...)` on API success, `toast.error(...)` on failure
- Timers cleared on component unmount / if upload finishes early

---

## Files

| File | Change |
|------|--------|
| `frontend/components/chat/ChatPanel.tsx` | All three features |

No new files. No backend changes.

---

## Out of scope
- Citation click actions (kept as-is per user decision)
- Model accuracy / embedding improvements (separate spec)
- Auto-generated starter questions (deferred)
