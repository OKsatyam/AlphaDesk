/**
 * Backend DB sync — called when user is logged in.
 * All functions fire-and-forget (no throw on network failure) so
 * localStorage remains the source of truth and DB sync is best-effort.
 */

import type { SavedChat } from './chat-storage';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function toDbMessages(messages: SavedChat['messages']) {
  return messages.map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.content,
    citations: m.citations ?? [],
  }));
}

/** Push a single chat to DB (full upsert — creates or replaces). */
export async function syncChatToDb(chat: SavedChat, userEmail: string): Promise<void> {
  try {
    await fetch(`${API}/chats/${chat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: chat.id,
        user_email: userEmail,
        title: chat.title,
        document_id: chat.document_id ?? '',
        company_name: chat.document_name ?? '',
        messages: toDbMessages(chat.messages),
      }),
    });
  } catch {
    // silent — localStorage is source of truth
  }
}

/** Push all localStorage chats to DB on login. Skips existing sessions. */
export async function syncAllChatsToDb(chats: SavedChat[], userEmail: string): Promise<void> {
  try {
    await fetch(`${API}/chats/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        chats.map(c => ({
          id: c.id,
          user_email: userEmail,
          title: c.title,
          document_id: c.document_id ?? '',
          company_name: c.document_name ?? '',
          messages: toDbMessages(c.messages),
        }))
      ),
    });
  } catch {
    // silent
  }
}

/** Load all sessions from DB for a user. Returns null on failure. */
export async function loadChatsFromDb(userEmail: string): Promise<SavedChat[] | null> {
  try {
    const res = await fetch(`${API}/chats/${encodeURIComponent(userEmail)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data as any[]).map(s => ({
      id: s.id,
      title: s.title,
      document_id: s.document_id || null,
      document_name: s.company_name || null,
      messages: (s.messages ?? []).map((m: any) => ({
        role: m.role === 'assistant' ? 'ai' : 'user',
        content: m.content,
        citations: m.citations ?? [],
      })),
      created_at: new Date(s.created_at).getTime(),
      updated_at: new Date(s.updated_at).getTime(),
    }));
  } catch {
    return null;
  }
}

/** Delete session from DB. */
export async function deleteDbChat(userEmail: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${API}/chats/${encodeURIComponent(userEmail)}/${sessionId}`, { method: 'DELETE' });
  } catch {
    // silent
  }
}
