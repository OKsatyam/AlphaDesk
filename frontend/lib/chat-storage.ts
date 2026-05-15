/**
 * Chat history stored in localStorage.
 * Key: 'alphadesk_chats' → JSON array of SavedChat, newest first.
 * Max 50 chats kept — oldest pruned on overflow.
 */

const STORAGE_KEY = 'alphadesk_chats';
const MAX_CHATS = 50;

export interface SavedCitation {
  chunk_id: string;
  document_id: string;
  page_number: number;
  section: string;
  relevance_score: number;
  text_snippet: string;
}

export interface SavedMetric {
  term: string;
  full: string;
  explain: string;
  formula?: string | null;
  good_range?: string | null;
}

export interface SavedRisk {
  type: string;
  color: string;
  sentence: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SavedMessage {
  role: 'user' | 'ai';
  content: string;
  citations?: SavedCitation[];
  metrics?: SavedMetric[];
  risks?: SavedRisk[];
}

export interface SavedChat {
  id: string;
  title: string;
  document_id: string | null;
  document_name: string | null;
  messages: SavedMessage[];
  created_at: number;  // unix ms
  updated_at: number;
}

function readAll(): SavedChat[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedChat[]) : [];
  } catch {
    return [];
  }
}

function writeAll(chats: SavedChat[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // localStorage full — prune and retry
    const pruned = chats.slice(0, Math.floor(MAX_CHATS / 2));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned)); } catch { /* give up */ }
  }
}

export function getAllChats(): SavedChat[] {
  return readAll();
}

export function getChat(id: string): SavedChat | null {
  return readAll().find(c => c.id === id) ?? null;
}

export function upsertChat(chat: SavedChat): void {
  const all = readAll().filter(c => c.id !== chat.id);
  const updated = [chat, ...all].slice(0, MAX_CHATS);
  writeAll(updated);
}

export function deleteChat(id: string): void {
  writeAll(readAll().filter(c => c.id !== id));
}

export function clearAllChats(): void {
  writeAll([]);
}

/** Build a display title from the first user message or document name. */
export function chatTitle(messages: SavedMessage[], documentName: string | null): string {
  const firstUser = messages.find(m => m.role === 'user')?.content ?? '';
  if (firstUser) return firstUser.length > 45 ? firstUser.slice(0, 45) + '…' : firstUser;
  return documentName ?? 'New chat';
}

/** Group chats by relative date bucket for sidebar display. */
export function groupChatsByDate(chats: SavedChat[]): { label: string; chats: SavedChat[] }[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const buckets: Record<string, SavedChat[]> = { Today: [], Yesterday: [], 'This week': [], Earlier: [] };

  for (const chat of chats) {
    const age = now - chat.updated_at;
    if (age < DAY)               buckets['Today'].push(chat);
    else if (age < 2 * DAY)      buckets['Yesterday'].push(chat);
    else if (age < 7 * DAY)      buckets['This week'].push(chat);
    else                         buckets['Earlier'].push(chat);
  }

  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, chats]) => ({ label, chats }));
}
