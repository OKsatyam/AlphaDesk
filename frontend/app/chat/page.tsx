'use client';
import { useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/chat/Sidebar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { RightPanel } from '@/components/chat/RightPanel';
import { type SavedChat } from '@/lib/chat-storage';

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

function ChatPageInner() {
  const searchParams = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const dragStartX = useRef<number | null>(null);
  const dragStartW = useRef<number>(420);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    dragStartW.current = rightPanelWidth;
    const onMove = (mv: MouseEvent) => {
      if (dragStartX.current === null) return;
      const delta = dragStartX.current - mv.clientX;
      setRightPanelWidth(Math.min(700, Math.max(280, dragStartW.current + delta)));
    };
    const onUp = () => {
      dragStartX.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rightPanelWidth]);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [sourceCitations, setSourceCitations] = useState<Citation[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const [prefillQuery, setPrefillQuery] = useState('');
  const [restoredChat, setRestoredChat] = useState<SavedChat | undefined>(undefined);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(undefined);
  // Store doc from URL params in state so New Chat can clear them
  const [initialDocId, setInitialDocId] = useState<string | undefined>(searchParams.get('doc_id') ?? undefined);
  const [initialDocName, setInitialDocName] = useState<string | undefined>(searchParams.get('name') ?? undefined);

  const handleNewChat = useCallback(() => {
    setChatKey(k => k + 1);
    setRestoredChat(undefined);
    setActiveChatId(undefined);
    setActiveCitation(null);
    setSourceCitations([]);
    setRisks([]);
    setPrefillQuery('');
    setInitialDocId(undefined);
    setInitialDocName(undefined);
  }, []);

  const handleRestoreChat = useCallback((chat: SavedChat) => {
    setChatKey(k => k + 1);
    setRestoredChat(chat);
    setActiveChatId(chat.id);
    setActiveCitation(null);
    setSourceCitations([]);
    setRisks([]);
    setPrefillQuery('');
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        onNewChat={handleNewChat}
        onSuggestedQuery={q => setPrefillQuery(q)}
        onRestoreChat={handleRestoreChat}
        activeChatId={activeChatId}
      />
      <ChatPanel
        key={chatKey}
        sidebarOpen={sidebarOpen}
        rightOpen={rightOpen}
        onRightToggle={() => setRightOpen(v => !v)}
        onCitationClick={c => { setActiveCitation(c); setRightOpen(true); }}
        onCitationsUpdate={setSourceCitations}
        onRisksUpdate={setRisks}
        prefillQuery={prefillQuery}
        onPrefillConsumed={() => setPrefillQuery('')}
        initialDocId={initialDocId}
        initialDocName={initialDocName}
        restoredChat={restoredChat}
        onChatCreated={id => setActiveChatId(id)}
      />
      <RightPanel
        isOpen={rightOpen}
        activeCitation={activeCitation}
        sourceCitations={sourceCitations}
        risks={risks}
        width={rightPanelWidth}
        onDragStart={handleDragStart}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
