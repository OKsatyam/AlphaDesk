'use client';
import { useState, useEffect, useCallback } from 'react';
import { FileText, Link as LinkIcon, StickyNote, AlertTriangle, FileSearch, Loader2, ImageOff, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';

const TABS = [
  { id: 'document', label: 'Document', icon: FileText },
  { id: 'sources',  label: 'Sources',  icon: LinkIcon },
  { id: 'risks',    label: 'Risks',    icon: AlertTriangle },
  { id: 'notes',    label: 'Notes',    icon: StickyNote },
] as const;

type TabId = typeof TABS[number]['id'];

interface Citation {
  chunk_id: string;
  document_id: string;
  page_number: number;
  section: string;
  relevance_score: number;
  text_snippet: string;
}

interface Risk {
  type: string;
  color: string;
  sentence: string;
  severity: 'high' | 'medium' | 'low';
}

interface RightPanelProps {
  isOpen: boolean;
  activeCitation: Citation | null;
  sourceCitations?: Citation[];
  risks?: Risk[];
  width?: number;
  onDragStart?: (e: React.MouseEvent) => void;
}

const SEVERITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; image: string; totalPages: number }
  | { status: 'error'; message: string };

export function RightPanel({ isOpen, activeCitation, sourceCitations = [], risks = [], width = 420, onDragStart }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('document');
  const [notes, setNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageState, setPageState] = useState<PageState>({ status: 'idle' });
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchPage = useCallback(async (documentId: string, pageNum: number) => {
    setPageState({ status: 'loading' });
    try {
      const res = await fetch(`${API}/documents/${documentId}/page/${pageNum}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to load page' }));
        setPageState({ status: 'error', message: err.detail || 'Failed to load page' });
        return;
      }
      const data = await res.json();
      setPageState({ status: 'loaded', image: data.image, totalPages: data.total_pages });
    } catch {
      setPageState({ status: 'error', message: 'Could not connect to backend' });
    }
  }, []);

  useEffect(() => {
    if (activeCitation) {
      setCurrentPage(activeCitation.page_number);
      setActiveTab('document');
      setZoom(1);
      fetchPage(activeCitation.document_id, activeCitation.page_number);
    } else {
      setPageState({ status: 'idle' });
    }
  }, [activeCitation, fetchPage]);

  // navigate to adjacent pages
  const goToPage = (pageNum: number) => {
    if (!activeCitation) return;
    setCurrentPage(pageNum);
    fetchPage(activeCitation.document_id, pageNum);
  };

  if (!isOpen) return null;

  return (
    <>
    {/* Fullscreen PDF modal */}
    {isFullscreen && pageState.status === 'loaded' && (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
        onClick={() => setIsFullscreen(false)}
      >
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="text-sm font-medium text-white">p.{currentPage} — {activeCitation?.section || 'Document'}</span>
          <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6" onClick={e => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${pageState.image}`}
            alt={`Page ${currentPage}`}
            style={{ maxWidth: '100%', width: '100%', height: 'auto', display: 'block', borderRadius: '8px', margin: '0 auto' }}
          />
        </div>
        <div className="flex items-center justify-center gap-4 px-6 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
            className="text-sm px-4 py-2 rounded-lg text-white border border-white/20 hover:bg-white/10 disabled:opacity-30 transition-colors">
            ← Prev
          </button>
          <span className="text-sm font-mono text-white">{currentPage} / {pageState.totalPages}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageState.totalPages}
            className="text-sm px-4 py-2 rounded-lg text-white border border-white/20 hover:bg-white/10 disabled:opacity-30 transition-colors">
            Next →
          </button>
        </div>
      </div>
    )}
    <aside
      className="flex flex-col h-full shrink-0 overflow-hidden relative"
      style={{ width, backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 transition-colors z-10"
        style={{ backgroundColor: 'transparent' }}
        title="Drag to resize"
      />
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-semibold transition-colors"
            style={{
              color: activeTab === tab.id ? '#4F46E5' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '2px solid #4F46E5' : '2px solid transparent',
            }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Document tab ─────────────────────────────────────── */}
      {activeTab === 'document' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeCitation ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <FileSearch className="w-10 h-10" style={{ color: 'var(--border)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No page selected</p>
              <p className="text-xs max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                Click a citation pill in the chat to jump to that page
              </p>
            </div>
          ) : (
            <>
              {/* Citation header */}
              <div className="px-3 py-2 border-b flex items-center justify-between shrink-0"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium"
                    style={{ backgroundColor: 'rgba(14,165,233,0.12)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.3)' }}>
                    p.{currentPage}
                  </span>
                  <span className="text-xs font-semibold truncate max-w-[100px]" style={{ color: '#F59E0B' }}>
                    {activeCitation.section || 'Document'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono mr-1" style={{ color: '#10B981' }}>
                    {(activeCitation.relevance_score * 100).toFixed(0)}%
                  </span>
                  <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-1 rounded hover:opacity-70 transition-opacity"
                    title="Zoom out"
                    style={{ color: 'var(--text-secondary)' }}>
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                    className="p-1 rounded hover:opacity-70 transition-opacity"
                    title="Zoom in"
                    style={{ color: 'var(--text-secondary)' }}>
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setZoom(1)}
                    className="px-1.5 py-0.5 rounded text-xs font-mono hover:opacity-70 transition-opacity"
                    title="Fit width"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    fit
                  </button>
                  <button onClick={() => setIsFullscreen(true)}
                    className="p-1 rounded hover:opacity-70 transition-opacity ml-0.5"
                    title="Fullscreen"
                    style={{ color: 'var(--text-secondary)' }}>
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Page image area */}
              <div className="flex-1 overflow-auto" style={{ backgroundColor: '#1a1a24' }}>
                {pageState.status === 'loading' && (
                  <div className="flex items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Rendering page...</span>
                  </div>
                )}
                {pageState.status === 'loaded' && (
                  <div style={{ padding: '8px', minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${pageState.image}`}
                      alt={`Page ${currentPage}`}
                      style={{
                        width: zoom === 1 ? '100%' : `${zoom * 100}%`,
                        maxWidth: zoom === 1 ? '100%' : 'none',
                        height: 'auto',
                        display: 'block',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                )}
                {pageState.status === 'error' && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
                    <ImageOff className="w-8 h-8" style={{ color: 'var(--border)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{pageState.message}</p>
                    {/* Fallback: text snippet */}
                    <div className="w-full rounded-xl p-3 text-left" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                        {activeCitation.text_snippet}
                      </p>
                    </div>
                  </div>
                )}
                {pageState.status === 'idle' && (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--border)' }} />
                  </div>
                )}
              </div>

              {/* Page navigation */}
              <div className="border-t flex items-center justify-between px-3 py-2 shrink-0"
                style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="text-xs px-3 py-1.5 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  ← Prev
                </button>
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {currentPage}
                  {pageState.status === 'loaded' ? ` / ${pageState.totalPages}` : ''}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={pageState.status === 'loaded' && currentPage >= pageState.totalPages}
                  className="text-xs px-3 py-1.5 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sources tab ──────────────────────────────────────── */}
      {activeTab === 'sources' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {sourceCitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <LinkIcon className="w-8 h-8" style={{ color: 'var(--border)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No sources yet</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Ask a question — cited pages will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                SOURCES — {sourceCitations.length} chunks retrieved
              </div>
              {sourceCitations.map((s, i) => (
                <div key={s.chunk_id} className="rounded-xl p-3 flex flex-col gap-2" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium" style={{ backgroundColor: 'rgba(14,165,233,0.12)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.3)' }}>
                      p.{s.page_number}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{(s.relevance_score * 100).toFixed(0)}% match</span>
                  </div>
                  {s.section && <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.section}</div>}
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{s.text_snippet}</p>
                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${s.relevance_score * 100}%`, background: 'linear-gradient(90deg, #4F46E5, #0EA5E9)' }} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Risks tab ────────────────────────────────────────── */}
      {activeTab === 'risks' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <AlertTriangle className="w-8 h-8" style={{ color: 'var(--border)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No risks detected yet</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Ask about risks — detected factors will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                RISK FACTORS — {risks.length} detected
              </div>
              {risks.map((r, i) => (
                <div key={i} className="rounded-xl p-3 flex flex-col gap-1.5" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${r.color}33` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${r.color}18`, color: r.color }}>
                      {r.type}
                    </span>
                    <span className="text-xs font-mono capitalize" style={{ color: SEVERITY_COLOR[r.severity] }}>
                      {r.severity}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.sentence}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Notes tab ────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>YOUR NOTES</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Jot down key observations, highlights, or things to follow up on..."
            className="flex-1 w-full bg-transparent text-sm outline-none resize-none leading-relaxed rounded-xl p-3"
            style={{ color: 'var(--text-primary)', border: '1px solid var(--border)', minHeight: '200px' }}
          />
          <button
            onClick={() => { navigator.clipboard.writeText(notes); }}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-indigo-500 transition-colors"
          >
            Copy notes
          </button>
        </div>
      )}
    </aside>
    </>
  );
}
