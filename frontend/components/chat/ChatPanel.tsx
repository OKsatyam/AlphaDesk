'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, ChevronRight, Loader2, X, Languages, Download, Share2, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signIn } from 'next-auth/react';
import { CitationPill } from '@/components/CitationPill';
import { MetricsBar } from '@/components/chat/MetricsPill';
import { ModelSelector, SelectedModel } from '@/components/chat/ModelSelector';
import { toast } from 'sonner';
import { upsertChat, chatTitle, type SavedChat } from '@/lib/chat-storage';
import { syncChatToDb } from '@/lib/db-sync';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const QUICK_CHIPS = ['Summarise financials', 'Key risks', 'Compare YoY revenue', 'Segment breakdown'];

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

interface MetricCard {
  label: string;
  value: string;
}

function extractMetricCards(text: string): MetricCard[] {
  const pattern = /\*\*([₹$]?[\d,]+(?:\.\d+)?(?:\s?[A-Za-z][\w\s]{0,12})?)\*\*/g;
  const cards: MetricCard[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].trim();
    if (value.length < 2) continue;
    cards.push({
      label: inferLabel(text, match.index),
      value,
    });
    if (cards.length >= 6) break;
  }
  return cards;
}

// ─── INR formatter (mirrors backend india_formatter.py) ────────────────
function formatInrInText(text: string): string {
  return text.replace(
    /(?:Rs\.?\s*|₹\s*|INR\s*)?([\d,]+(?:\.\d+)?)\s*(?:crores?|Cr\.?|cr\.?)/gi,
    (_, raw) => {
      const value = parseFloat(raw.replace(/,/g, ''));
      if (isNaN(value)) return _;
      if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L Cr`;
      if (value >= 1_000)    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
      if (value >= 1)        return `₹${value.toFixed(1)} Cr`;
      return `₹${(value * 100).toFixed(1)} L`;
    }
  );
}

interface Citation {
  chunk_id: string;
  document_id: string;
  page_number: number;
  section: string;
  relevance_score: number;
  text_snippet: string;
}

interface Metric {
  term: string;
  full: string;
  explain: string;
  formula?: string | null;
  good_range?: string | null;
}

interface Risk {
  type: string;
  color: string;
  sentence: string;
  severity: 'high' | 'medium' | 'low';
}

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
  citations?: Citation[];
  metrics?: Metric[];
  risks?: Risk[];
  streaming?: boolean;
  source?: 'document' | 'web' | 'llm' | 'combined';
  searchLimitHit?: boolean;
}

interface ChatPanelProps {
  sidebarOpen: boolean;
  rightOpen: boolean;
  onRightToggle: () => void;
  onCitationClick: (citation: Citation) => void;
  onCitationsUpdate?: (citations: Citation[]) => void;
  onRisksUpdate?: (risks: Risk[]) => void;
  prefillQuery?: string;
  onPrefillConsumed?: () => void;
  initialDocId?: string;
  initialDocName?: string;
  restoredChat?: SavedChat;
  onChatCreated?: (id: string) => void;
}

export function ChatPanel({ sidebarOpen, rightOpen, onRightToggle, onCitationClick, onCitationsUpdate, onRisksUpdate, prefillQuery, onPrefillConsumed, initialDocId, initialDocName, restoredChat, onChatCreated }: ChatPanelProps) {
  const { data: session } = useSession();
  const [input, setInput] = useState('');

  // Restore messages from saved chat, or start fresh
  const [messages, setMessages] = useState<Message[]>(() => {
    if (restoredChat) {
      return restoredChat.messages.map((m, i) => ({ id: i, ...m }));
    }
    return [];
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [useWeb, setUseWeb] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SelectedModel>({ provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' });
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
  const [uploading, setUploading] = useState(false);
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  // Stable chat ID — one per ChatPanel mount
  const chatIdRef = useRef<string>(restoredChat?.id ?? `chat_${Date.now()}`);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isNewUploadRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pre-fill input from sidebar suggestion
  useEffect(() => {
    if (prefillQuery) {
      setInput(prefillQuery);
      onPrefillConsumed?.();
    }
  }, [prefillQuery]);

  // Auto-save chat to localStorage after each completed AI response
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'ai' || lastMsg.streaming) return;
    if (messages.length < 2) return; // need at least user + ai

    const saved: SavedChat = {
      id: chatIdRef.current,
      title: chatTitle(messages, uploadedDoc?.filename ?? null),
      document_id: uploadedDoc?.document_id ?? null,
      document_name: uploadedDoc?.filename ?? null,
      messages: messages.map(({ role, content, citations, metrics, risks }) => ({
        role, content, citations, metrics, risks,
      })),
      created_at: restoredChat?.created_at ?? Date.now(),
      updated_at: Date.now(),
    };
    upsertChat(saved);
    // Tell parent the chat ID so sidebar can highlight it
    onChatCreated?.(chatIdRef.current);
    // Sync to DB if user is logged in (best-effort, non-blocking)
    if (session?.user?.email) {
      syncChatToDb(saved, session.user.email);
    }
  }, [messages]);

  // ─── Upload PDF ────────────────────────────────────────────────
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
      toast.loading('📄  Parsing pages…', { id: toastId });
    }, 4000));

    timers.push(setTimeout(() => {
      toast.loading('🔢  Embedding chunks…', { id: toastId });
    }, 12000));

    timers.push(setTimeout(() => {
      toast.loading('🔢  Still embedding — large document…', { id: toastId });
    }, 60000));

    timers.push(setTimeout(() => {
      toast.loading('⏳  Almost there…', { id: toastId });
    }, 150000));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('company_name', file.name.replace('.pdf', ''));

    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
      timers.forEach(clearTimeout);
      isNewUploadRef.current = true;
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

  // ─── Export chat as PDF ────────────────────────────────────────
  async function handleExport() {
    if (!messages.length) return toast.error('No messages to export');
    try {
      const res = await fetch(`${API}/export/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: uploadedDoc?.filename.replace('.pdf', '') ?? 'Research',
          messages: messages.map(m => ({ role: m.role, content: m.content, citations: m.citations ?? [] })),
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `AlphaDesk_${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Export failed');
    }
  }

  // ─── Share chat ─────────────────────────────────────────────────
  async function handleShare() {
    if (!messages.length) return toast.error('No messages to share');
    try {
      const res = await fetch(`${API}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: uploadedDoc?.filename.replace('.pdf', '') ?? 'Research',
          messages: messages.map(m => ({ role: m.role, content: m.content, citations: m.citations ?? [], metrics: m.metrics ?? [] })),
        }),
      });
      if (!res.ok) throw new Error('Share failed');
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Share link copied to clipboard!');
    } catch {
      toast.error('Share failed');
    }
  }

  // ─── Core streaming engine ─────────────────────────────────────
  const fireQuery = useCallback(async (question: string, docId: string | null) => {
    if (isStreaming) return;

    const userMsg: Message = { id: Date.now(), role: 'user', content: question };
    const aiMsgId = Date.now() + 1;
    const aiMsg: Message = { id: aiMsgId, role: 'ai', content: '', citations: [], metrics: [], streaming: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API}/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          document_id: docId,
          top_k: 5,
          language: lang,
          provider: selectedModel.provider,
          model: selectedModel.model,
          use_web: useWeb,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Query failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'citations') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, citations: payload.citations } : m
            ));
            onCitationsUpdate?.(payload.citations);
          } else if (payload.type === 'source') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, source: payload.source } : m
            ));
          } else if (payload.type === 'token') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId
                ? { ...m, content: m.content + payload.text }
                : m
            ));
          } else if (payload.type === 'metrics') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, metrics: payload.metrics } : m
            ));
          } else if (payload.type === 'search_limit') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, searchLimitHit: true } : m
            ));
          } else if (payload.type === 'risks') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, risks: payload.risks } : m
            ));
            onRisksUpdate?.(payload.risks);
          } else if (payload.type === 'done') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId
                ? { ...m, streaming: false, content: formatInrInText(m.content) }
                : m
            ));
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      toast.error(err.message || 'Something went wrong');
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: 'Sorry, something went wrong. Please try again.', streaming: false } : m
      ));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, lang, selectedModel, useWeb, onCitationsUpdate, onRisksUpdate]);

  // Auto-summary on fresh upload
  useEffect(() => {
    if (!uploadedDoc || !isNewUploadRef.current) return;
    isNewUploadRef.current = false;
    fireQuery('Give me a brief overview of this company and its key financials from the document.', uploadedDoc.document_id);
  }, [uploadedDoc]);

  // ─── Send message with streaming ───────────────────────────────
  const handleSend = useCallback(async () => {
    setSummaryDismissed(true);
    if (!input.trim() || isStreaming) return;
    const question = input;
    setInput('');
    await fireQuery(question, uploadedDoc?.document_id ?? null);
  }, [input, isStreaming, uploadedDoc, fireQuery]);

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {uploadedDoc ? uploadedDoc.filename[0].toUpperCase() : 'F'}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {uploadedDoc ? uploadedDoc.filename.replace('.pdf', '') : 'AlphaDesk'}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {uploadedDoc ? 'Annual Report — Ready' : 'Upload a PDF or fetch a company to start'}
            </div>
          </div>
          {uploadedDoc && (
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }}>
              ● Loaded
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Model selector */}
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />

          {/* Export + Share */}
          {messages.length > 0 && (
            <>
              <button onClick={handleExport} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }} title="Export as PDF">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={handleShare} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }} title="Copy share link">
                <Share2 className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Language toggle */}
          <button
            onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: lang === 'hi' ? 'rgba(245,158,11,0.12)' : 'var(--bg-card)',
              color: lang === 'hi' ? '#F59E0B' : 'var(--text-secondary)',
              border: `1px solid ${lang === 'hi' ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
            }}
            title="Toggle Hinglish / English"
          >
            <Languages className="w-3.5 h-3.5" />
            {lang === 'hi' ? 'Hinglish' : 'EN'}
          </button>

          {/* Internet toggle */}
          <button
            onClick={() => setUseWeb(w => !w)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: useWeb ? 'rgba(14,165,233,0.12)' : 'var(--bg-card)',
              color: useWeb ? '#0EA5E9' : 'var(--text-secondary)',
              border: `1px solid ${useWeb ? 'rgba(14,165,233,0.4)' : 'var(--border)'}`,
            }}
            title={useWeb ? 'Internet ON — answers use both document + live web' : 'Internet OFF — answers from document only'}
          >
            <Globe className="w-3.5 h-3.5" />
            {useWeb ? 'Web ON' : 'Web'}
          </button>

          <button
            onClick={onRightToggle}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${rightOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">
        {/* Document summary card */}
        <AnimatePresence>
          {uploadedDoc && !summaryDismissed && (
            <DocSummaryCard
              doc={uploadedDoc}
              onDismiss={() => setSummaryDismissed(true)}
            />
          )}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Send className="w-6 h-6 text-white" />
            </div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ask anything about a company</p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
              Upload a PDF or click a chip below to get started. Answers come with page citations.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium text-white" style={{ backgroundColor: '#4F46E5' }}>
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] flex flex-col gap-2">
                  <div
                    className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                    style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderLeftColor: '#4F46E5', borderLeftWidth: '2px' }}
                  >
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

                  {/* Metrics tooltips */}
                  {!msg.streaming && msg.metrics && msg.metrics.length > 0 && (
                    <MetricsBar metrics={msg.metrics} />
                  )}

                  {/* Citation pills */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap px-1">
                      {msg.citations.map(c => (
                        <CitationPill
                          key={c.chunk_id}
                          label={`p.${c.page_number}`}
                          onClick={() => {
                            onCitationClick(c);
                            toast.info(`Page ${c.page_number} — ${c.section || 'Document'}`);
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Answer source badge */}
                  {!msg.streaming && msg.source && msg.source !== 'document' && (
                    <div className="flex items-center gap-1.5 px-1">
                      {msg.source === 'web' ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(14,165,233,0.10)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.25)' }}
                        >
                          🌐 From internet
                        </span>
                      ) : msg.source === 'combined' ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(16,185,129,0.10)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)' }}
                        >
                          🌐+📄 Document + Web
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(79,70,229,0.10)', color: '#818CF8', border: '1px solid rgba(79,70,229,0.25)' }}
                        >
                          🤖 General knowledge
                        </span>
                      )}
                    </div>
                  )}

                  {/* Search limit warning */}
                  {!msg.streaming && msg.searchLimitHit && (
                    <div className="flex items-start gap-2 px-1 mt-1">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg leading-snug"
                        style={{ backgroundColor: 'rgba(245,158,11,0.10)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        ⚠️ Web search quota exhausted — Tavily free tier: 1,000 searches/month. Resets monthly. Answered from general knowledge instead.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isStreaming && messages[messages.length - 1]?.role !== 'ai' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-2">
            <div className="flex gap-1">
              {[0, 0.2, 0.4].map(d => (
                <div key={d} className="w-2 h-2 rounded-full" style={{ backgroundColor: '#0EA5E9', animation: `pulseDot 1.5s ease-in-out ${d}s infinite` }} />
              ))}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>AlphaDesk is analyzing…</span>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2 flex-wrap mb-3">
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => setInput(chip)}
              className="text-xs px-3 py-1.5 rounded-full font-medium hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2 px-3 py-2.5 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
          />

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={lang === 'hi' ? 'Kuch bhi pucho document ke baare mein...' : 'Ask anything about the document…'}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed"
            style={{ color: 'var(--text-primary)', maxHeight: '120px', overflowY: 'auto' }}
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
              title="Upload PDF"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-red-500 hover:bg-red-600 transition-colors"
                title="Stop generating"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-primary hover:bg-indigo-500 transition-colors disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
          {session
            ? `Signed in as ${session.user?.email}`
            : <span>Guest mode — <button onClick={() => signIn()} className="underline text-primary">sign in</button> to sync chats across devices</span>
          }
        </p>
      </div>
    </main>
  );
}

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
