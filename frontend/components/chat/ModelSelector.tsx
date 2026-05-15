'use client';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Cpu, CheckCircle2, XCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ModelOption {
  id: string;
  label: string;
  badge: string;
}

interface ModelsResponse {
  default: string;
  providers: Record<string, ModelOption[]>;
  configured: Record<string, boolean>;
}

export interface SelectedModel {
  provider: string;
  model: string;
  label: string;
}

interface ModelSelectorProps {
  value: SelectedModel;
  onChange: (v: SelectedModel) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
  claude: 'Claude',
};

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/models`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Set default from API on first load
  useEffect(() => {
    if (!data) return;
    const provider = data.default;
    const models = data.providers[provider];
    if (models?.length) {
      onChange({ provider, model: models[0].id, label: models[0].label });
    }
  }, [data]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        <Cpu className="w-3.5 h-3.5" />
        <span className="max-w-[90px] truncate">{value.label || 'Model'}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && data && (
        <div
          className="absolute top-full right-0 mt-1 z-50 w-64 rounded-xl overflow-hidden shadow-xl"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          {Object.entries(data.providers).map(([provider, models]) => (
            <div key={provider}>
              {/* Provider header */}
              <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  {PROVIDER_LABELS[provider] ?? provider}
                </span>
                {data.configured[provider] ? (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#10B981' }}>
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                    <XCircle className="w-3 h-3" /> No key
                  </span>
                )}
              </div>

              {/* Models */}
              {models.map(m => {
                const active = value.provider === provider && value.model === m.id;
                const disabled = !data.configured[provider];
                return (
                  <button
                    key={m.id}
                    disabled={disabled}
                    onClick={() => { onChange({ provider, model: m.id, label: m.label }); setOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: active ? 'rgba(79,70,229,0.08)' : 'transparent',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span className="text-xs font-medium" style={{ color: active ? '#4F46E5' : 'var(--text-primary)' }}>
                      {m.label}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      {m.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Add keys in <code className="px-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>backend/.env</code>
          </div>
        </div>
      )}
    </div>
  );
}
