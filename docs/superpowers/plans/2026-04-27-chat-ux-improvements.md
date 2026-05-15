# Chat UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three UX improvements to the chat — a dismissable document summary card, financial metric pill cards above AI answers, and a multi-step ingest progress toast.

**Architecture:** All changes are contained in `frontend/components/chat/ChatPanel.tsx`. No new files, no backend changes. The `uploadedDoc` state type is extended to carry page/chunk counts. Two pure utility functions (`extractMetricCards`, `inferLabel`) are added at the top of the file.

**Tech Stack:** Next.js 14, React, Framer Motion, Tailwind CSS, Sonner (toasts), Lucide icons.

---

## File Map

| File | What changes |
|------|-------------|
| `frontend/components/chat/ChatPanel.tsx` | Extend `uploadedDoc` type, add `summaryDismissed` state, add `DocSummaryCard` component, add `extractMetricCards` + `inferLabel` helpers, add metric row in AI bubble, replace upload toast with step sequence |

---

## Task 1: Extend `uploadedDoc` state type

**Files:**
- Modify: `frontend/components/chat/ChatPanel.tsx:95`

- [ ] **Step 1: Update the inline type on `uploadedDoc` state**

Replace the existing `uploadedDoc` useState declaration (line ~95) with:

```tsx
const [uploadedDoc, setUploadedDoc] = useState<{
  document_id: string;
  filename: string;
  total_pages?: number;
  total_chunks?: number;
  company_name?: string;
  market?: string;
} | null>(() => {
  if (restoredChat?.document_id && restoredChat?.document_name) {
    return { document_id: restoredChat.document_id, filename: restoredChat.document_name };
  }
  if (initialDocId && initialDocName) {
    return { document_id: initialDocId, filename: initialDocName };
  }
  return null;
});
```

- [ ] **Step 2: Populate new fields in `handleUpload` on success**

Find the line inside `handleUpload` that calls `setUploadedDoc` (currently line ~169):
```tsx
setUploadedDoc({ document_id: data.document_id, filename: data.filename });
```
Replace with:
```tsx
setUploadedDoc({
  document_id: data.document_id,
  filename: data.filename,
  total_pages: data.total_pages,
  total_chunks: data.total_chunks,
  company_name: data.company_name ?? data.filename.replace('.pdf', ''),
  market: data.market ?? 'IN',
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/chat/ChatPanel.tsx
git commit -m "feat(chat): extend uploadedDoc state with pages/chunks/market"
```

---

## Task 2: Add `summaryDismissed` state + DocSummaryCard

**Files:**
- Modify: `frontend/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Add `summaryDismissed` state and `FileText` import**

At the top of the file, add `FileText` to the lucide import:
```tsx
import { Send, Paperclip, ChevronRight, Loader2, X, Languages, Download, Share2, FileText } from 'lucide-react';
```

Add this state directly below the `uploading` state declaration (~line 104):
```tsx
const [summaryDismissed, setSummaryDismissed] = useState(false);
```

- [ ] **Step 2: Reset `summaryDismissed` when a new doc is set**

Inside `handleUpload`, immediately after the `setUploadedDoc(...)` call add:
```tsx
setSummaryDismissed(false);
```

- [ ] **Step 3: Dismiss on first send**

At the very top of the `handleSend` callback (before the early-return guard), add:
```tsx
setSummaryDismissed(true);
```

So the start of `handleSend` looks like:
```tsx
const handleSend = useCallback(async () => {
  setSummaryDismissed(true);
  if (!input.trim() || isStreaming) return;
  // ... rest unchanged
```

- [ ] **Step 4: Add `DocSummaryCard` component at bottom of file (before closing brace)**

Add this after the closing `}` of `ChatPanel` (before the end of the file):

```tsx
function DocSummaryCard({
  doc,
  onDismiss,
}: {
  doc: { filename: string; total_pages?: number; total_chunks?: number; company_name?: string; market?: string };
  onDismiss: () => void;
}) {
  const marketColor = doc.market === 'US' ? '#60A5FA' : '#1FD4A0';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative flex items-start gap-3 p-4 rounded-2xl mx-1 mb-2"
      style={{
        backgroundColor: 'rgba(232,160,32,0.06)',
        border: '1px solid rgba(232,160,32,0.30)',
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgba(232,160,32,0.12)', border: '1px solid rgba(232,160,32,0.25)' }}
      >
        <FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {doc.filename}
          </span>
          {doc.market && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-semibold"
              style={{
                fontFamily: 'var(--font-mono)',
                backgroundColor: `${marketColor}14`,
                color: marketColor,
                border: `1px solid ${marketColor}28`,
                fontSize: '10px',
              }}
            >
              {doc.market === 'US' ? 'SEC' : 'NSE/BSE'}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {[
            doc.company_name,
            doc.total_pages ? `${doc.total_pages} pages` : null,
            doc.total_chunks ? `${doc.total_chunks} chunks indexed` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {' '}
          <span style={{ color: 'var(--accent)' }}>● Ready</span>
        </p>
      </div>

      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-lg hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 5: Render DocSummaryCard in the messages area**

Inside the messages `<div>` (the `flex-1 overflow-y-auto` div, ~line 387), add the card right before the `{messages.length === 0 && (...)}` empty-state block:

```tsx
{/* Document summary card */}
<AnimatePresence>
  {uploadedDoc && !summaryDismissed && (
    <DocSummaryCard
      doc={uploadedDoc}
      onDismiss={() => setSummaryDismissed(true)}
    />
  )}
</AnimatePresence>
```

- [ ] **Step 6: Verify in browser**

Start dev server (`npm run dev` in `frontend/`). Upload a PDF. Confirm:
- Card appears with filename, pages, chunks
- × button dismisses it
- Sending a message also dismisses it
- Uploading a second PDF shows the card again

- [ ] **Step 7: Commit**

```bash
git add frontend/components/chat/ChatPanel.tsx
git commit -m "feat(chat): add dismissable document summary card"
```

---

## Task 3: Metric card renderer

**Files:**
- Modify: `frontend/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Add `inferLabel` helper function**

Add this above the `ChatPanel` function definition (after the `QUICK_CHIPS` constant):

```tsx
const FINANCIAL_KEYWORDS = [
  'revenue', 'pat', 'profit', 'ebitda', 'margin', 'eps', 'dividend',
  'employees', 'growth', 'debt', 'cash', 'sales', 'income', 'loss',
  'return', 'yield', 'ratio', 'turnover', 'assets', 'equity',
];

function inferLabel(text: string, matchIndex: number): string {
  const before = text.slice(Math.max(0, matchIndex - 60), matchIndex).toLowerCase();
  for (const kw of FINANCIAL_KEYWORDS) {
    if (before.includes(kw)) {
      return kw.charAt(0).toUpperCase() + kw.slice(1);
    }
  }
  return 'Key Figure';
}
```

- [ ] **Step 2: Add `extractMetricCards` helper function**

Add this directly after `inferLabel`:

```tsx
interface MetricCard {
  label: string;
  value: string;
}

function extractMetricCards(text: string): MetricCard[] {
  // Match bold numbers: **₹2,55,324 Cr** or **24.2%** or **6.36 Lakh**
  const pattern = /\*\*([₹$]?[\d,]+(?:\.\d+)?(?:\s?[A-Za-z][\w\s]{0,12})?)\*\*/g;
  const cards: MetricCard[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].trim();
    // Skip very short matches that are likely formatting not numbers
    if (value.length < 2) continue;
    cards.push({
      label: inferLabel(text, match.index),
      value,
    });
    if (cards.length >= 6) break;
  }
  return cards;
}
```

- [ ] **Step 3: Render metric cards inside the AI message bubble**

Find the AI message bubble in the return JSX (~line 414). Currently it looks like:

```tsx
<div className="max-w-[85%] flex flex-col gap-2">
  <div
    className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
    style={{ ... }}
  >
    {msg.content}
    {msg.streaming && (...)}
  </div>
  {/* Metrics tooltips */}
  ...
```

Add the metric cards row **inside** the bubble div, before `{msg.content}`:

```tsx
<div
  className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderLeftColor: '#4F46E5', borderLeftWidth: '2px' }}
>
  {/* Metric cards — only when streaming is done and cards exist */}
  {!msg.streaming && (() => {
    const cards = extractMetricCards(msg.content);
    return cards.length > 0 ? (
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {cards.map((card, i) => (
          <div
            key={i}
            className="shrink-0 px-3 py-2 rounded-xl"
            style={{
              backgroundColor: 'rgba(232,160,32,0.07)',
              border: '1px solid rgba(232,160,32,0.22)',
              minWidth: '90px',
            }}
          >
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
              {card.label}
            </div>
            <div
              className="text-sm font-semibold leading-tight"
              style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    ) : null;
  })()}
  {msg.content}
  {msg.streaming && (
    <span className="inline-block w-0.5 h-4 ml-0.5 bg-primary animate-pulse align-middle" />
  )}
</div>
```

- [ ] **Step 4: Verify in browser**

Ask the chat "What was TCS revenue and PAT?" with the TCS doc loaded. Confirm:
- Metric cards appear above the answer text when numbers are present in bold
- No cards appear for messages without bold numbers
- Cards scroll horizontally if there are 4+
- Nothing renders during streaming (cards only show when `!msg.streaming`)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/chat/ChatPanel.tsx
git commit -m "feat(chat): add financial metric card renderer above AI answers"
```

---

## Task 4: Ingest progress steps

**Files:**
- Modify: `frontend/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Replace `handleUpload` toast logic**

Find `handleUpload`. Currently:
```tsx
setUploading(true);
const formData = new FormData();
formData.append('file', file);
formData.append('company_name', file.name.replace('.pdf', ''));

try {
  const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
  const data = await res.json();
  setUploadedDoc({ ... });
  toast.success(`Ingested ${data.filename} — ${data.total_chunks} chunks ready`);
} catch (err: any) {
  toast.error(err.message || 'Upload failed');
} finally {
  setUploading(false);
}
```

Replace the entire function body with:

```tsx
async function handleUpload(file: File) {
  if (!file.name.endsWith('.pdf')) {
    toast.error('Only PDF files are supported');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`);
    return;
  }

  setUploading(true);
  const toastId = 'upload-progress';
  const timers: ReturnType<typeof setTimeout>[] = [];

  toast.loading('⬆  Uploading file…', { id: toastId });

  timers.push(setTimeout(() => {
    toast.loading(`📄  Parsing pages…`, { id: toastId });
  }, 1500));

  timers.push(setTimeout(() => {
    toast.loading('🔢  Embedding chunks…', { id: toastId });
  }, 3500));

  const formData = new FormData();
  formData.append('file', file);
  formData.append('company_name', file.name.replace('.pdf', ''));

  try {
    const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
    const data = await res.json();
    timers.forEach(clearTimeout);
    setUploadedDoc({
      document_id: data.document_id,
      filename: data.filename,
      total_pages: data.total_pages,
      total_chunks: data.total_chunks,
      company_name: data.company_name ?? data.filename.replace('.pdf', ''),
      market: data.market ?? 'IN',
    });
    setSummaryDismissed(false);
    toast.success(`✓  Ready — ${data.total_chunks} chunks indexed`, { id: toastId });
  } catch (err: any) {
    timers.forEach(clearTimeout);
    toast.error(err.message || 'Upload failed', { id: toastId });
  } finally {
    setUploading(false);
  }
}
```

- [ ] **Step 2: Verify in browser**

Upload the TCS PDF. Confirm:
- Toast shows "⬆ Uploading file…" immediately
- After ~1.5s: updates to "📄 Parsing pages…"
- After ~3.5s: updates to "🔢 Embedding chunks…"
- On completion: shows "✓ Ready — 694 chunks indexed"
- On error (e.g. backend down): shows error message, no lingering loading toast

- [ ] **Step 3: Commit**

```bash
git add frontend/components/chat/ChatPanel.tsx
git commit -m "feat(chat): add multi-step ingest progress toast"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: `uploadedDoc` type extended
- ✅ Task 2: `DocSummaryCard` with dismiss, amber style, framer-motion
- ✅ Task 3: `extractMetricCards` + `inferLabel`, pill cards above prose
- ✅ Task 4: 4-step toast sequence, timers cleared on success/error

**Placeholder scan:** None found.

**Type consistency:**
- `uploadedDoc` extended type used consistently across Tasks 1, 2, 4
- `MetricCard` interface defined in Task 3 Step 2, used in Step 3
- `toastId` constant string `'upload-progress'` used for all toast updates in Task 4
