'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { TrendingUp, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Citation {
  page_number: number;
  section?: string;
}

interface Message {
  role: string;
  content: string;
  citations?: Citation[];
}

interface ShareData {
  share_id: string;
  company_name: string;
  created_at: string;
  messages: Message[];
}

export default function SharePage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/share/${id}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(setData)
      .catch(() => setError('This share link has expired or does not exist.'));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center flex flex-col items-center gap-4">
          <AlertCircle className="w-12 h-12" style={{ color: '#EF4444' }} />
          <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{error}</p>
          <Link href="/chat" className="text-sm underline" style={{ color: '#4F46E5' }}>Start a new chat</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#4F46E5' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4F46E5] to-[#0EA5E9] flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>AlphaDesk</span>
            <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>· {data.company_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(79,70,229,0.1)', color: '#4F46E5', border: '1px solid rgba(79,70,229,0.3)' }}>
            Read-only
          </span>
          <Link href="/chat" className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#4F46E5' }}>
            Try AlphaDesk
          </Link>
        </div>
      </div>

      {/* Chat transcript */}
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-4">
        <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          Shared on {new Date(data.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        {data.messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium text-white" style={{ backgroundColor: '#4F46E5' }}>
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[85%] flex flex-col gap-2">
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderLeftColor: '#4F46E5', borderLeftWidth: '2px' }}>
                  {msg.content}
                </div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap px-1">
                    {msg.citations.map((c, ci) => (
                      <span key={ci} className="text-xs px-2 py-0.5 rounded-full font-mono"
                        style={{ backgroundColor: 'rgba(14,165,233,0.12)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.3)' }}>
                        p.{c.page_number}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
