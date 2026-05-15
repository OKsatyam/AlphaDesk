'use client';
import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Metric {
  term: string;
  full: string;
  explain: string;
  formula?: string | null;
  good_range?: string | null;
}

interface MetricsPillProps {
  metric: Metric;
}

export function MetricsPill({ metric }: MetricsPillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: 'rgba(79,70,229,0.12)',
          color: '#4F46E5',
          border: '1px solid rgba(79,70,229,0.3)',
        }}
      >
        {metric.term}
        <Info className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-xl p-3 flex flex-col gap-2 shadow-xl"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
            {metric.term} — {metric.full}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {metric.explain}
          </p>
          {metric.formula && (
            <div className="px-2 py-1 rounded-lg text-xs font-mono" style={{ backgroundColor: 'var(--bg-secondary)', color: '#0EA5E9' }}>
              {metric.formula}
            </div>
          )}
          {metric.good_range && (
            <div className="text-xs" style={{ color: '#10B981' }}>
              ✓ {metric.good_range}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


interface MetricsBarProps {
  metrics: Metric[];
}

export function MetricsBar({ metrics }: MetricsBarProps) {
  if (!metrics.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-1 items-center">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Terms:</span>
      {metrics.map(m => (
        <MetricsPill key={m.term} metric={m} />
      ))}
    </div>
  );
}
