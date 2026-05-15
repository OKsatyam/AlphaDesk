'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { TrendingUp, Plus, Search, ChevronLeft, ChevronRight, MessageSquare, User, Trash2, Building2 } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import {
  getAllChats,
  deleteChat,
  upsertChat,
  groupChatsByDate,
  type SavedChat,
} from '@/lib/chat-storage';
import { loadChatsFromDb, syncAllChatsToDb, deleteDbChat } from '@/lib/db-sync';

const SUGGESTED_QUERIES = [
  { label: 'Revenue & PAT FY24', icon: '📊' },
  { label: 'Key risk factors', icon: '⚠️' },
  { label: 'Segment breakdown', icon: '🗂️' },
  { label: 'Debt & liquidity', icon: '💰' },
  { label: 'Management outlook', icon: '🔭' },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat?: () => void;
  onSuggestedQuery?: (query: string) => void;
  onRestoreChat?: (chat: SavedChat) => void;
  activeChatId?: string;
}

export function Sidebar({ isOpen, onToggle, onNewChat, onSuggestedQuery, onRestoreChat, activeChatId }: SidebarProps) {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [tab, setTab] = useState<'history' | 'quick'>('history');

  const [synced, setSynced] = useState(false);

  // Load chats — DB if logged in, else localStorage
  useEffect(() => {
    async function load() {
      const local = getAllChats();
      if (session?.user?.email) {
        // First login: push localStorage chats to DB
        if (!synced && local.length > 0) {
          syncAllChatsToDb(local, session.user.email);
          setSynced(true);
        }
        // Try to load from DB; merge with localStorage (DB wins on conflict)
        const remote = await loadChatsFromDb(session.user.email);
        if (remote) {
          // Upsert remote chats into localStorage so they're available offline
          remote.forEach(c => upsertChat(c));
          setChats(remote);
          return;
        }
      }
      setChats(local);
    }
    load();
  }, [activeChatId, session?.user?.email]);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteChat(id);
    setChats(prev => prev.filter(c => c.id !== id));
    if (session?.user?.email) deleteDbChat(session.user.email, id);
  }

  const filteredChats = search
    ? chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : chats;

  const groups = groupChatsByDate(filteredChats);

  const filteredQueries = SUGGESTED_QUERIES.filter(q =>
    q.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 p-2 rounded-r-lg transition-all hover:scale-110"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: 'none', color: 'var(--text-secondary)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <aside
        className={`flex flex-col h-full shrink-0 transition-all duration-300 ${isOpen ? 'w-60' : 'w-0 overflow-hidden'}`}
        style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">AlphaDesk</span>
          </Link>
          <button onClick={onToggle} className="p-1 rounded hover:opacity-60 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* New chat + Companies */}
        <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-indigo-500 transition-colors"
          >
            <Plus className="w-4 h-4" /> New chat
          </button>
          <Link
            href="/companies"
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <Building2 className="w-4 h-4" /> Companies
          </Link>
        </div>

        {/* Tabs */}
        <div className="px-3 pb-2 flex gap-1">
          {(['history', 'quick'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: tab === t ? 'rgba(79,70,229,0.12)' : 'transparent',
                color: tab === t ? '#4F46E5' : 'var(--text-secondary)',
              }}>
              {t === 'history' ? 'History' : 'Quick ask'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'history' ? 'Search chats…' : 'Search questions…'}
              className="bg-transparent text-xs flex-1 outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3">

          {/* ── History tab ── */}
          {tab === 'history' && (
            <>
              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center py-8">
                  <MessageSquare className="w-8 h-8" style={{ color: 'var(--border)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    No chats yet. Ask something to get started.
                  </p>
                </div>
              ) : (
                groups.map(group => (
                  <div key={group.label} className="mb-4">
                    <div className="text-xs font-semibold uppercase tracking-wide mb-1.5 px-1"
                      style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                      {group.label}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.chats.map(chat => (
                        <div
                          key={chat.id}
                          onClick={() => onRestoreChat?.(chat)}
                          className="group w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl hover:opacity-80 transition-all cursor-pointer"
                          style={{
                            backgroundColor: activeChatId === chat.id ? 'rgba(79,70,229,0.1)' : 'transparent',
                            border: activeChatId === chat.id ? '1px solid rgba(79,70,229,0.25)' : '1px solid transparent',
                          }}
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                          <span className="text-xs flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                            {chat.title}
                          </span>
                          <button
                            onClick={e => handleDelete(e, chat.id)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-red-400"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── Quick ask tab ── */}
          {tab === 'quick' && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                Quick Questions
              </div>
              <div className="flex flex-col gap-1">
                {filteredQueries.map(q => (
                  <button
                    key={q.label}
                    onClick={() => onSuggestedQuery?.(q.label)}
                    className="w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:opacity-80 transition-opacity"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <span className="text-base leading-none">{q.icon}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{q.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* User info */}
        <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          {session ? (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                {session.user?.name?.[0]?.toUpperCase() ?? session.user?.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {session.user?.name || session.user?.email}
                </div>
                <button onClick={() => signOut()} className="text-xs hover:underline" style={{ color: 'var(--text-secondary)' }}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Guest mode — saved locally</span>
              </div>
              <button
                onClick={() => signIn()}
                className="w-full text-center text-xs py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: 'rgba(79,70,229,0.12)', color: '#4F46E5', border: '1px solid rgba(79,70,229,0.3)' }}
              >
                Sign in to sync chats →
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
