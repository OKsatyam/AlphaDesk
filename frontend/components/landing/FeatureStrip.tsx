'use client';
import { motion } from 'framer-motion';
import { FileText, Globe2, Layers } from 'lucide-react';

const FEATURES = [
  {
    num: '01',
    icon: FileText,
    color: '#E8A020',
    title: 'AI answers with citations',
    desc: 'Every answer cites the exact page number. No hallucinations — grounded in the actual document text.',
  },
  {
    num: '02',
    icon: Globe2,
    color: '#1FD4A0',
    title: 'India-first intelligence',
    desc: 'Native support for BSE, NSE, INR crore formatting, DII/FII data, ROCE — and Hinglish queries.',
  },
  {
    num: '03',
    icon: Layers,
    color: '#A78BFA',
    title: 'Multi-source, one place',
    desc: 'Annual reports, 10-Ks, transcripts — upload PDFs or auto-fetch from BSE, NSE, and SEC EDGAR.',
  },
];

export function FeatureStrip() {
  return (
    <section
      id="features"
      className="py-28"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-18"
        >
          <p
            className="text-xs tracking-[0.22em] uppercase mb-5"
            style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}
          >
            ◆ Capabilities
          </p>
          <h2
            className="text-4xl sm:text-5xl mb-5"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}
          >
            Everything you need to{' '}
            <em style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--primary)' }}>
              understand a filing
            </em>
          </h2>
          <p
            className="text-base mx-auto"
            style={{ color: 'var(--text-secondary)', maxWidth: '460px', fontWeight: 300 }}
          >
            Powered by retrieval-augmented generation. Answers always trace back to the source document.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid sm:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.num}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <FeatureCard {...f} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ num, icon: Icon, color, title, desc }: {
  num: string; icon: any; color: string; title: string; desc: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-7 h-full group transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Ghost background number */}
      <div
        className="absolute -top-2 right-3 text-[88px] font-bold leading-none select-none pointer-events-none"
        style={{
          fontFamily: 'var(--font-display)',
          color,
          opacity: 0.055,
          letterSpacing: '-0.04em',
        }}
      >
        {num}
      </div>

      {/* Icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-6"
        style={{ background: `${color}14`, border: `1px solid ${color}28` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>

      <h3
        className="text-xl mb-3 leading-snug"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)', fontWeight: 300 }}
      >
        {desc}
      </p>

      {/* Bottom accent line (reveal on hover) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-400"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
    </div>
  );
}
