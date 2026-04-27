'use client';
import { useState, useRef } from 'react';
import { CheckCircle, XCircle, Loader2, Play, ChevronDown } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────────
type Status = 'idle' | 'running' | 'pass' | 'fail';

interface CheckResult {
  status: Status;
  message?: string;
  ms?: number;
  fix?: string;
}

interface State {
  ping:           CheckResult;
  stats:          CheckResult;
  models:         CheckResult;
  documents:      CheckResult & { docs?: { company_name: string; chunk_count: number; document_id: string }[] };
  uploadSmall:    CheckResult & { docId?: string; pages?: number; chunks?: number };
  uploadLarge:    CheckResult;
  ragCitations:   CheckResult;
  ragTokens:      CheckResult;
  ragDone:        CheckResult;
  citationViewer: CheckResult & { imageB64?: string };
  uxCard:         CheckResult;
  uxMetrics:      CheckResult & { cards?: { label: string; value: string }[] };
  uxToast:        CheckResult;
}

const INIT: CheckResult = { status: 'idle' };
const INIT_STATE: State = {
  ping: INIT, stats: INIT, models: INIT,
  documents: INIT,
  uploadSmall: INIT,
  uploadLarge: INIT,
  ragCitations: INIT, ragTokens: INIT, ragDone: INIT,
  citationViewer: INIT,
  uxCard: INIT, uxMetrics: INIT, uxToast: INIT,
};

// ─── Minimal valid PDF (byte-accurate xref offsets) ───────────────────────────
function makeTestPdf(): Blob {
  const enc = new TextEncoder();
  const parts: string[] = [];
  const offsets: number[] = [];
  let pos = 0;
  function emit(s: string) { parts.push(s); pos += enc.encode(s).length; }

  emit('%PDF-1.4\n');
  offsets[1] = pos;
  emit('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offsets[2] = pos;
  emit('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offsets[3] = pos;
  emit('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n');

  const xrefPos = pos;
  emit('xref\n0 4\n');
  emit('0000000000 65535 f \n');
  for (let i = 1; i <= 3; i++) emit(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  emit('trailer\n<< /Size 4 /Root 1 0 R >>\n');
  emit(`startxref\n${xrefPos}\n%%EOF`);

  return new Blob([parts.join('')], { type: 'application/pdf' });
}

// ─── Metric extraction (mirrors ChatPanel.tsx) ────────────────────────────────
const FINANCIAL_KEYWORDS = [
  'revenue', 'pat', 'profit', 'ebitda', 'margin', 'eps', 'dividend',
  'employees', 'growth', 'debt', 'cash', 'sales', 'income',
];

function inferLabel(text: string, matchIndex: number): string {
  const before = text.slice(Math.max(0, matchIndex - 60), matchIndex).toLowerCase();
  for (const kw of FINANCIAL_KEYWORDS) {
    if (before.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return 'Key Figure';
}

function extractMetricCards(text: string): { label: string; value: string }[] {
  const pattern = /\*\*([₹$]?[\d,]+(?:\.\d+)?(?:\s?[A-Za-z][\w\s]{0,12})?)\*\*/g;
  const cards: { label: string; value: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].trim();
    if (value.length < 2) continue;
    cards.push({ label: inferLabel(text, match.index), value });
    if (cards.length >= 6) break;
  }
  return cards;
}

// ─── Fix hints ────────────────────────────────────────────────────────────────
function fixHint(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('fetch') || e.includes('econnrefused') || e.includes('failed to fetch'))
    return 'Backend not running — cd backend && uvicorn main:app --reload --port 8000';
  if (e.includes('413'))
    return 'File too large — check MAX_UPLOAD_SIZE_MB in backend/.env';
  if (e.includes('500'))
    return 'Backend pipeline error — check uvicorn terminal logs';
  if (e.includes('404'))
    return 'Endpoint not found or document_id missing — check backend routes';
  if (e.includes('api key') || e.includes('401') || e.includes('authentication'))
    return 'Invalid API key — check GROQ_API_KEY in backend/.env';
  if (e.includes('timeout'))
    return 'Operation timed out — backend may be busy embedding a large doc';
  return 'Check uvicorn terminal for full stack trace';
}

// ─── Shared UI components ─────────────────────────────────────────────────────
function StatusIcon({ status }: { status: Status }) {
  if (status === 'idle')    return <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: 'var(--border)' }} />;
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#60A5FA' }} />;
  if (status === 'pass')    return <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />;
  return <XCircle className="w-4 h-4" style={{ color: '#EF4444' }} />;
}

function CheckRow({ label, result, children }: { label: string; result: CheckResult; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const clickable = result.status !== 'idle';
  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 ${clickable ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={() => clickable && setOpen(o => !o)}
      >
        <StatusIcon status={result.status} />
        <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {result.ms !== undefined && (
          <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>{result.ms}ms</span>
        )}
        {clickable && (
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
        )}
      </div>
      {open && (
        <div className="px-4 pb-3 pt-1">
          {result.status === 'fail' && (
            <>
              <p className="text-xs mb-1.5" style={{ color: '#FCA5A5' }}>{result.message}</p>
              {result.fix && (
                <p className="text-xs px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }}>
                  💡 {result.fix}
                </p>
              )}
            </>
          )}
          {result.status === 'pass' && result.message && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{result.message}</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DebugPage() {
  const [state, setState] = useState<State>(INIT_STATE);
  const [running, setRunning] = useState(false);
  const largeFileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof State>(key: K, val: Partial<State[K]>) {
    setState(prev => ({ ...prev, [key]: { ...prev[key], ...val } }));
  }

  async function runCheck<K extends keyof State>(key: K, fn: () => Promise<Partial<State[K]>>) {
    set(key, { status: 'running' } as Partial<State[K]>);
    const t = Date.now();
    try {
      const result = await fn();
      set(key, { status: 'pass', ms: Date.now() - t, ...result } as Partial<State[K]>);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set(key, { status: 'fail', ms: Date.now() - t, message: msg, fix: fixHint(msg) } as Partial<State[K]>);
    }
  }

  // ── Check functions ──────────────────────────────────────────────────────────
  async function checkPing() {
    await runCheck('ping', async () => {
      const res = await fetch(`${API}/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'running') throw new Error(`Unexpected status: ${data.status}`);
      return { message: `${data.app} v${data.version}` };
    });
  }

  async function checkStats() {
    await runCheck('stats', async () => {
      const res = await fetch(`${API}/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { message: `${data.total_chunks} chunks in ChromaDB` };
    });
  }

  async function checkModels() {
    await runCheck('models', async () => {
      const res = await fetch(`${API}/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const configured = Object.entries(data.configured as Record<string, boolean>)
        .filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
      return { message: `Default: ${data.default} · Configured: ${configured}` };
    });
  }

  async function checkDocuments() {
    await runCheck('documents', async () => {
      const res = await fetch(`${API}/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const docs = data.documents || [];
      return { message: `${docs.length} document(s) in library`, docs };
    });
  }

  async function checkUploadSmall() {
    await runCheck('uploadSmall', async () => {
      const pdf = makeTestPdf();
      const form = new FormData();
      form.append('file', pdf, 'folioai_test.pdf');
      form.append('company_name', 'FolioAI Test');
      const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.document_id) throw new Error('No document_id in response');
      return {
        message: `${data.total_pages} page(s), ${data.total_chunks} chunk(s) · id: ${data.document_id.slice(0, 8)}…`,
        docId: data.document_id,
        pages: data.total_pages,
        chunks: data.total_chunks,
      };
    });
  }

  async function checkUploadLarge(file: File) {
    await runCheck('uploadLarge', async () => {
      const form = new FormData();
      form.append('file', file);
      form.append('company_name', file.name.replace('.pdf', ''));
      const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.document_id) throw new Error('No document_id in response');
      return {
        message: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) → ${data.total_pages} pages, ${data.total_chunks} chunks`,
      };
    });
  }

  async function checkRag() {
    const docId = (state.uploadSmall as State['uploadSmall']).docId;
    if (!docId) {
      const noDoc = { status: 'fail' as const, message: 'Run Upload (small) first to get a document_id', fix: 'Run check 3 first' };
      setState(prev => ({ ...prev, ragCitations: noDoc, ragTokens: noDoc, ragDone: noDoc }));
      return;
    }
    setState(prev => ({
      ...prev,
      ragCitations: { status: 'running' },
      ragTokens: { status: 'running' },
      ragDone: { status: 'running' },
    }));

    const t = Date.now();
    let citationsOk = false;
    let tokenCount = 0;
    let firstTokenMs: number | undefined;
    let doneOk = false;

    try {
      const res = await fetch(`${API}/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Summarise this document',
          document_id: docId,
          top_k: 3,
          language: 'en',
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        const msg = (err as { detail?: string }).detail || `HTTP ${res.status}`;
        const fix = fixHint(msg);
        setState(prev => ({
          ...prev,
          ragCitations: { status: 'fail', ms: Date.now() - t, message: msg, fix },
          ragTokens:    { status: 'fail', message: msg },
          ragDone:      { status: 'fail', message: msg },
        }));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === 'citations') {
            citationsOk = true;
            setState(prev => ({ ...prev, ragCitations: { status: 'pass', ms: Date.now() - t, message: `${payload.citations.length} citation(s)` } }));
          } else if (payload.type === 'token') {
            if (!firstTokenMs) firstTokenMs = Date.now() - t;
            tokenCount++;
          } else if (payload.type === 'done') {
            doneOk = true;
          }
        }
      }

      if (!citationsOk) {
        setState(prev => ({ ...prev, ragCitations: { status: 'fail', ms: Date.now() - t, message: 'No citations event', fix: 'Check TOP_K_RESULTS and threshold in retriever.py' } }));
      }
      setState(prev => ({
        ...prev,
        ragTokens: tokenCount > 0
          ? { status: 'pass', ms: firstTokenMs, message: `${tokenCount} tokens · first at ${firstTokenMs}ms` }
          : { status: 'fail', ms: Date.now() - t, message: 'No tokens received', fix: fixHint('api key') },
        ragDone: doneOk
          ? { status: 'pass', ms: Date.now() - t, message: 'Stream completed cleanly' }
          : { status: 'fail', ms: Date.now() - t, message: 'No done event', fix: 'Check generator.py for unhandled exceptions' },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const fix = fixHint(msg);
      setState(prev => ({
        ...prev,
        ragCitations: { status: 'fail', ms: Date.now() - t, message: msg, fix },
        ragTokens:    { status: 'fail', message: msg },
        ragDone:      { status: 'fail', message: msg },
      }));
    }
  }

  async function checkCitationViewer() {
    const docId = (state.uploadSmall as State['uploadSmall']).docId;
    if (!docId) {
      set('citationViewer', { status: 'fail', message: 'Run Upload (small) first', fix: 'Run check 3 first' });
      return;
    }
    await runCheck('citationViewer', async () => {
      const res = await fetch(`${API}/documents/${docId}/page/1`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.image) throw new Error('No image field in response');
      return {
        message: `Page 1/${data.total_pages} · ${Math.round(data.image.length / 1024)} KB PNG`,
        imageB64: data.image,
      };
    });
  }

  function checkUxFeatures() {
    try {
      const sample = 'Revenue of **₹2,55,324 Cr** with PAT of **₹42,147 Cr** and EPS **₹134.19**.';
      const cards = extractMetricCards(sample);
      set('uxMetrics', { status: 'pass', message: `Extracted ${cards.length} metric card(s) from sample text`, cards } as Partial<State['uxMetrics']>);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set('uxMetrics', { status: 'fail', message: msg, fix: 'Check extractMetricCards in ChatPanel.tsx' });
    }
    set('uxCard', { status: 'pass', message: 'Mock card rendered below' });
    set('uxToast', { status: 'idle', message: 'Click trigger button to test' });
  }

  async function runAll() {
    setRunning(true);
    setState(INIT_STATE);
    await checkPing();
    await checkStats();
    await checkModels();
    await checkDocuments();
    await checkUploadSmall();
    await checkRag();
    await checkCitationViewer();
    checkUxFeatures();
    setRunning(false);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="px-4 py-2 text-center text-xs font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#F59E0B', borderBottom: '1px solid rgba(245,158,11,0.3)' }}>
        ⚠ Debug Dashboard — Development only
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>FolioAI Debug</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Backend: <span className="font-mono">{API}</span>
            </p>
          </div>
          <button
            onClick={runAll}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-indigo-500 transition-colors disabled:opacity-60"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running…' : 'Run All Checks'}
          </button>
        </div>

        <Section title="1 — Backend Health">
          <CheckRow label="Server ping  GET /" result={state.ping} />
          <CheckRow label="ChromaDB stats  GET /stats" result={state.stats} />
          <CheckRow label="LLM models  GET /models" result={state.models} />
        </Section>

        <Section title="2 — Documents">
          <CheckRow label="List documents  GET /documents" result={state.documents}>
            {(state.documents.docs?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {state.documents.docs!.map((d) => (
                  <div key={d.document_id} className="flex items-center justify-between text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    <span className="truncate">{d.company_name}</span>
                    <span className="font-mono ml-2 shrink-0">{d.chunk_count} chunks</span>
                  </div>
                ))}
              </div>
            )}
          </CheckRow>
        </Section>

        <Section title="3 — Upload (small PDF, programmatic)">
          <CheckRow label="Upload 1-page generated PDF  POST /upload" result={state.uploadSmall} />
        </Section>

        <Section title="4 — Upload (large PDF, user-provided)">
          <div className="px-4 py-3 flex items-center gap-3">
            <input
              ref={largeFileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) checkUploadLarge(f);
                if (e.target) e.target.value = '';
              }}
            />
            <div className="flex-1">
              <CheckRow label="Upload user-provided PDF  POST /upload" result={state.uploadLarge} />
            </div>
            <button
              onClick={() => largeFileRef.current?.click()}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Pick PDF
            </button>
          </div>
        </Section>

        <Section title="5 — RAG Query + Streaming">
          {!state.uploadSmall.docId && state.uploadSmall.status !== 'running' && (
            <p className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Requires check 3 (Upload small) to pass first.
            </p>
          )}
          <CheckRow label="Citations event received" result={state.ragCitations} />
          <CheckRow label="Token stream" result={state.ragTokens} />
          <CheckRow label="Done event" result={state.ragDone} />
        </Section>

        <Section title="6 — Citation Viewer">
          <CheckRow label="Render page 1 as PNG  GET /documents/{id}/page/1" result={state.citationViewer}>
            {state.citationViewer.imageB64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${state.citationViewer.imageB64}`}
                alt="Page 1 preview"
                className="mt-2 rounded"
                style={{ maxHeight: '120px', border: '1px solid var(--border)' }}
              />
            )}
          </CheckRow>
        </Section>

        <Section title="7 — UX Features (visual smoke test)">
          <CheckRow label="extractMetricCards — bold number extraction" result={state.uxMetrics}>
            {(state.uxMetrics.cards?.length ?? 0) > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {state.uxMetrics.cards!.map((c, i) => (
                  <div key={i} className="px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(232,160,32,0.07)', border: '1px solid rgba(232,160,32,0.22)', minWidth: '90px' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{c.label}</div>
                    <div className="font-semibold" style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{c.value}</div>
                  </div>
                ))}
              </div>
            )}
          </CheckRow>
          <CheckRow label="DocSummaryCard mock render" result={state.uxCard}>
            {state.uxCard.status === 'pass' && (
              <div className="mt-2 flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.30)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ backgroundColor: 'rgba(232,160,32,0.12)' }}>📄</div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>test.pdf</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    FolioAI Test · 1 page · 1 chunk indexed{' '}
                    <span style={{ color: 'var(--accent)' }}>● Ready</span>
                  </div>
                </div>
              </div>
            )}
          </CheckRow>
          <CheckRow label="Progress toast sequence" result={state.uxToast}>
            <button
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onClick={() => {
                import('sonner').then(({ toast: t }) => {
                  const id = 'debug-toast-test';
                  t.loading('⬆  Uploading file…', { id });
                  setTimeout(() => t.loading('📄  Parsing pages…', { id }), 4000);
                  setTimeout(() => t.loading('🔢  Embedding chunks…', { id }), 12000);
                  setTimeout(() => t.success('✓  Ready — 312 chunks indexed', { id }), 2000);
                });
                set('uxToast', { status: 'pass', message: 'Toast sequence triggered — check bottom-right corner' });
              }}
            >
              Trigger toast sequence
            </button>
          </CheckRow>
        </Section>
      </div>
    </div>
  );
}
