'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Search, Upload, ArrowRight, RefreshCw, Loader2, FileText, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const LIBRARY: { name: string; query?: string; exchange: 'BSE' | 'NSE' | 'NASDAQ'; sector: string; color: string }[] = [
  { name: 'Reliance Industries', exchange: 'BSE', sector: 'Energy',     color: '#E8A020', query: '500325' },
  { name: 'TCS',                 exchange: 'BSE', sector: 'Technology', color: '#1FD4A0', query: '532540' },
  { name: 'HDFC Bank',           exchange: 'BSE', sector: 'Banking',    color: '#A78BFA', query: '500180' },
  { name: 'Infosys',             exchange: 'BSE', sector: 'Technology', color: '#60A5FA', query: '500209' },
  { name: 'Tata Motors',         exchange: 'BSE', sector: 'Automobile', color: '#F472B6', query: '544569' },
  { name: 'ICICI Bank',          exchange: 'BSE', sector: 'Banking',    color: '#34D399', query: '532174' },
  { name: 'Bajaj Finance',       exchange: 'BSE', sector: 'NBFC',       color: '#E8A020', query: '500034' },
  { name: 'Wipro',               exchange: 'BSE', sector: 'Technology', color: '#1FD4A0', query: '507685' },
];

const LIBRARY_TICKERS: Record<string, string> = {
  'Apple Inc.': 'AAPL',
  'Tesla': 'TSLA',
  'NVIDIA': 'NVDA',
  'Microsoft': 'MSFT',
};

interface IngestedDoc {
  document_id: string;
  company_name: string;
  filing_type: string;
  market: string;
  filename: string;
  chunk_count: number;
}

function ExchangeBadge({ exchange }: { exchange: string }) {
  const colors: Record<string, string> = {
    NSE:    '#1FD4A0',
    BSE:    '#E8A020',
    NASDAQ: '#60A5FA',
    NYSE:   '#A78BFA',
    SEC:    '#60A5FA',
    IN:     '#1FD4A0',
    US:     '#60A5FA',
  };
  const label: Record<string, string> = { IN: 'NSE', US: 'SEC' };
  const c   = colors[exchange] || '#6B7280';
  const lbl = label[exchange] || exchange;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-semibold"
      style={{
        fontFamily: 'var(--font-mono)',
        backgroundColor: `${c}14`,
        color: c,
        border: `1px solid ${c}28`,
        fontSize: '10px',
      }}
    >
      {lbl}
    </span>
  );
}

const cardVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function CompaniesPage() {
  const router      = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [q,              setQ]              = useState('');
  const [ingestedDocs,   setIngestedDocs]   = useState<IngestedDoc[]>([]);
  const [loadingDocs,    setLoadingDocs]    = useState(true);
  const [fetchingCard,   setFetchingCard]   = useState<string | null>(null);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [bseInput,       setBseInput]       = useState('');
  const [nseInput,       setNseInput]       = useState('');
  const [secInput,       setSecInput]       = useState('');
  const [fetchingSource, setFetchingSource] = useState<'bse' | 'nse' | 'sec' | null>(null);

  useEffect(() => { loadDocs(); }, []);

  async function loadDocs() {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API}/documents`);
      const data = await res.json();
      setIngestedDocs(data.documents || []);
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setLoadingDocs(false);
    }
  }

  function openInChat(doc_id: string, name: string) {
    router.push(`/chat?doc_id=${doc_id}&name=${encodeURIComponent(name)}`);
  }

  async function fetchAndOpen(source: 'bse' | 'nse' | 'sec', input: string) {
    if (!input.trim()) {
      toast.error(source === 'sec' ? 'Enter a ticker symbol' : 'Enter a company name');
      return;
    }
    setFetchingSource(source);
    const toastId = toast.loading(`⬇  Fetching from ${source.toUpperCase()}…`);
    try {
      const body = source === 'sec'
        ? { ticker: input.trim().toUpperCase() }
        : { company_name: input.trim() };
      const res = await fetch(`${API}/fetch/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Fetch failed');

      // Read SSE stream — backend sends progress heartbeats then a final "done" event
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let step = 1;
      const stepLabels = ['📄  Parsing pages…', '🔢  Embedding chunks…', '💾  Storing in database…'];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'progress') {
            toast.loading(stepLabels[step % stepLabels.length] || '⏳  Working…', { id: toastId });
            step++;
          } else if (evt.type === 'error') {
            throw new Error(evt.detail || 'Fetch failed');
          } else if (evt.type === 'done') {
            const data = evt.result;
            toast.success(`✓  ${data.company_name} — ${data.total_chunks} chunks ready`, { id: toastId });
            // Clear input on success so next fetch starts clean
            if (source === 'bse') setBseInput('');
            else if (source === 'nse') setNseInput('');
            else if (source === 'sec') setSecInput('');
            openInChat(data.document_id, data.company_name);
            return;
          }
        }
      }
    } catch (err: any) {
      const msg = err.name === 'TimeoutError'
        ? 'Timed out — document too large. Try again.'
        : err.message || 'Fetch failed';
      toast.error(msg, { id: toastId });
    } finally {
      setFetchingSource(null);
    }
  }

  async function fetchLibraryCard(name: string, exchange: 'BSE' | 'NSE' | 'NASDAQ') {
    const source = exchange === 'NASDAQ' ? 'sec' : exchange.toLowerCase() as 'bse' | 'nse';
    const card   = LIBRARY.find(c => c.name === name);
    const input  = exchange === 'NASDAQ' ? LIBRARY_TICKERS[name] ?? name : (card?.query ?? name);
    const existing = ingestedDocs.find(
      d => d.company_name.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    );
    if (existing) { openInChat(existing.document_id, existing.company_name); return; }
    setFetchingCard(name);
    const toastId = toast.loading(`⬇  Fetching ${name}…`);
    try {
      const res = await fetch(`${API}/fetch/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source === 'sec' ? { ticker: input.toUpperCase() } : { company_name: input }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Fetch failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let step = 1;
      const stepLabels = ['📄  Parsing pages…', '🔢  Embedding chunks…', '💾  Storing in database…'];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'progress') {
            toast.loading(stepLabels[step % stepLabels.length] || '⏳  Working…', { id: toastId });
            step++;
          } else if (evt.type === 'error') {
            throw new Error(evt.detail || 'Fetch failed');
          } else if (evt.type === 'done') {
            const data = evt.result;
            toast.success(`✓  ${data.company_name} — ${data.total_chunks} chunks`, { id: toastId });
            await loadDocs();
            openInChat(data.document_id, data.company_name);
            return;
          }
        }
      }
    } catch (err: any) {
      const msg = err.name === 'TimeoutError'
        ? 'Timed out — try again or use a smaller report.'
        : err.message || 'Fetch failed';
      toast.error(msg, { id: toastId });
    } finally {
      setFetchingCard(null);
    }
  }

  async function deleteDoc(doc_id: string, name: string) {
    setDeletingId(doc_id);
    try {
      const res = await fetch(`${API}/documents/${doc_id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`Removed ${name}`);
      setIngestedDocs(prev => prev.filter(d => d.document_id !== doc_id));
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpload(file: File) {
    if (!file.name.endsWith('.pdf')) { toast.error('Only PDF files supported'); return; }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`);
      return;
    }
    setUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}…`);
    const form = new FormData();
    form.append('file', file);
    form.append('company_name', file.name.replace('.pdf', ''));
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
      toast.success(`Ingested — ${data.total_chunks} chunks ready`, { id: toastId });
      await loadDocs();
      openInChat(data.document_id, data.filename);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  }

  const filteredLibrary  = LIBRARY.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) || c.sector.toLowerCase().includes(q.toLowerCase())
  );
  const filteredIngested = ingestedDocs.filter(d =>
    d.company_name.toLowerCase().includes(q.toLowerCase()) || d.filename.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-24 pb-20">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p
            className="text-xs tracking-[0.22em] uppercase mb-3"
            style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}
          >
            ◆ Company Library
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <h1
              className="text-4xl sm:text-5xl"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-primary)' }}
            >
              Fetch any{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--primary)' }}>
                company
              </em>
            </h1>
            {/* Search */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl sm:w-80"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search Reliance, HDFC, Banking…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="mt-4 gold-rule" />
        </motion.div>

        {/* ── Your Library ── */}
        <AnimatePresence>
          {(loadingDocs || filteredIngested.length > 0) && (
            <section className="mb-14">
              <div className="flex items-center justify-between mb-5">
                <h2
                  className="text-lg"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
                >
                  Your Library
                  {!loadingDocs && (
                    <span
                      className="ml-2 text-sm font-normal"
                      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                    >
                      ({filteredIngested.length})
                    </span>
                  )}
                </h2>
                <button
                  onClick={loadDocs}
                  className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {loadingDocs ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-2xl skeleton" style={{ height: '164px' }} />
                  ))}
                </div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                  className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {filteredIngested.map(doc => (
                    <motion.div
                      key={doc.document_id}
                      variants={cardVariants}
                      className="rounded-2xl p-4 flex flex-col gap-3 group transition-all hover:scale-[1.01]"
                      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))',
                              color: '#06060A',
                            }}
                          >
                            {doc.company_name[0]?.toUpperCase() ?? 'F'}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="text-sm font-semibold truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {doc.company_name || doc.filename}
                            </div>
                            <ExchangeBadge exchange={doc.market} />
                          </div>
                        </div>
                        <button
                          onClick={() => deleteDoc(doc.document_id, doc.company_name)}
                          disabled={deletingId === doc.document_id}
                          className="shrink-0 p-1 rounded transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                          style={{ color: 'var(--danger)' }}
                          title="Remove"
                        >
                          {deletingId === doc.document_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{doc.filing_type.replace('_', ' ')}</span>
                        <span
                          className="ml-auto shrink-0 px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: 'rgba(31,212,160,0.08)',
                            color: 'var(--accent)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            border: '1px solid rgba(31,212,160,0.2)',
                          }}
                        >
                          {doc.chunk_count} chunks
                        </span>
                      </div>

                      <button
                        onClick={() => openInChat(doc.document_id, doc.company_name)}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold mt-auto transition-all hover:brightness-110"
                        style={{ backgroundColor: 'var(--primary)', color: '#06060A' }}
                      >
                        Ask now <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </section>
          )}
        </AnimatePresence>

        {/* ── Pre-loaded library ── */}
        <section className="mb-14">
          <div className="mb-5">
            <h2
              className="text-lg mb-1"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
            >
              Pre-loaded Companies
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
              Click any card — annual report fetched and ingested automatically.
            </p>
          </div>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filteredLibrary.map(c => {
              const isFetching     = fetchingCard === c.name;
              const alreadyLoaded  = ingestedDocs.some(
                d => d.company_name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0])
              );
              return (
                <motion.div
                  key={c.name}
                  variants={cardVariants}
                  className="rounded-2xl p-4 flex flex-col gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all group"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: `${c.color}16`, color: c.color, border: `1px solid ${c.color}28` }}
                    >
                      {c.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {c.name}
                      </div>
                      <ExchangeBadge exchange={c.exchange} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                      }}
                    >
                      {c.sector}
                    </span>
                    {alreadyLoaded && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'rgba(31,212,160,0.08)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(31,212,160,0.2)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                        }}
                      >
                        ● Loaded
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => fetchLibraryCard(c.name, c.exchange)}
                    disabled={isFetching}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold mt-auto transition-all"
                    style={{
                      backgroundColor: isFetching ? 'var(--bg-secondary)' : `${c.color}18`,
                      color:           isFetching ? 'var(--text-secondary)' : c.color,
                      border:          `1px solid ${isFetching ? 'var(--border)' : `${c.color}30`}`,
                    }}
                  >
                    {isFetching
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
                      : alreadyLoaded
                        ? <>Open in chat <ArrowRight className="w-3.5 h-3.5" /></>
                        : <>Fetch &amp; open <ArrowRight className="w-3.5 h-3.5" /></>}
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ── Fetch any company ── */}
        <section className="mb-14">
          <h2
            className="text-lg mb-5"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Fetch any company
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {/* BSE */}
            <FetchCard
              label="BSE — Company Name or Code"
              placeholder="e.g. 500325 or Reliance"
              value={bseInput}
              onChange={setBseInput}
              onFetch={() => fetchAndOpen('bse', bseInput)}
              loading={fetchingSource === 'bse'}
              color="#E8A020"
              btnLabel="Fetch from BSE"
            />
            {/* NSE */}
            <FetchCard
              label="NSE — Symbol or Company Name"
              placeholder="e.g. TCS, INFY, HDFCBANK"
              value={nseInput}
              onChange={setNseInput}
              onFetch={() => fetchAndOpen('nse', nseInput)}
              loading={fetchingSource === 'nse'}
              color="#1FD4A0"
              btnLabel="Fetch from NSE"
            />
            {/* SEC */}
            <FetchCard
              label="SEC EDGAR — US Ticker"
              placeholder="e.g. AAPL, TSLA, NVDA"
              value={secInput}
              onChange={setSecInput}
              onFetch={() => fetchAndOpen('sec', secInput)}
              loading={fetchingSource === 'sec'}
              color="#60A5FA"
              btnLabel="Fetch from SEC"
            />
          </div>
        </section>

        {/* ── Upload PDF ── */}
        <section>
          <h2
            className="text-lg mb-5"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Upload your own document
          </h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
          />
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleUpload(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border-dashed border-2 flex flex-col items-center justify-center py-16 px-8 text-center cursor-pointer transition-all"
            style={{
              borderColor:     dragOver ? 'var(--primary)' : 'var(--border-mid)',
              backgroundColor: dragOver ? 'rgba(232,160,32,0.04)' : 'var(--bg-card)',
            }}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--primary)' }} />
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Ingesting document…
                </p>
              </div>
            ) : (
              <>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: 'rgba(232,160,32,0.08)',
                    border: '1px solid rgba(232,160,32,0.22)',
                  }}
                >
                  <Upload className="w-7 h-7" style={{ color: 'var(--primary)' }} />
                </div>
                <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: '18px' }}>
                  Drag &amp; drop your PDF here
                </p>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
                  or{' '}
                  <span style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                    click to browse
                  </span>
                </p>
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                >
                  Annual reports · Earnings transcripts · DRHP · Investor presentations
                </p>
              </>
            )}
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}

function FetchCard({
  label, placeholder, value, onChange, onFetch, loading, color, btnLabel,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; onFetch: () => void;
  loading: boolean; color: string; btnLabel: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <label
        className="text-xs font-semibold"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onFetch()}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = color)}
        onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
      <button
        onClick={onFetch}
        disabled={loading}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 disabled:opacity-50"
        style={{
          backgroundColor: `${color}14`,
          color,
          border: `1px solid ${color}28`,
        }}
      >
        {loading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
          : <><RefreshCw className="w-3.5 h-3.5" /> {btnLabel}</>}
      </button>
    </div>
  );
}
