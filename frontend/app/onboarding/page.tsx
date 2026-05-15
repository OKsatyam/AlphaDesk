'use client';
import Link from 'next/link';
import { TrendingUp, Search, Upload, Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const OPTIONS = [
  {
    icon: Search,
    num:  '01',
    title: 'Browse company library',
    desc: 'Choose from pre-loaded Nifty 50 and S&P 500 companies. Reliance, TCS, Apple — already ingested.',
    cta: 'Browse library',
    href: '/companies',
    color: '#E8A020',
    recommended: false,
  },
  {
    icon: Sparkles,
    num:  '02',
    title: 'Try an example',
    desc: 'See AlphaDesk in action with a pre-loaded Reliance FY24 annual report — no setup, no upload needed.',
    cta: 'Try demo now',
    href: '/chat',
    color: '#1FD4A0',
    recommended: true,
  },
  {
    icon: Upload,
    num:  '03',
    title: 'Upload your own PDF',
    desc: 'Upload any annual report, earnings transcript, or investor presentation as a PDF file.',
    cta: 'Upload document',
    href: '/companies',
    color: '#A78BFA',
    recommended: false,
  },
];

const ease = [0.16, 1, 0.3, 1] as const;

export default function OnboardingPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Background */}
      <div className="absolute inset-0 chart-grid opacity-60" />
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-15%', left: '-5%',
          width: '50%', height: '60%',
          background: 'radial-gradient(ellipse, rgba(232,160,32,0.07) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-10%', right: '-5%',
          width: '45%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(31,212,160,0.05) 0%, transparent 65%)',
        }}
      />

      {/* Skip */}
      <div className="fixed top-5 right-6 z-20">
        <Link
          href="/chat"
          className="text-xs transition-colors hover:text-primary"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          skip →
        </Link>
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-14">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
          >
            <TrendingUp className="w-7 h-7" style={{ color: '#06060A' }} />
          </div>
          <div>
            <h1
              className="text-4xl sm:text-5xl mb-3"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-primary)' }}
            >
              Welcome to{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--primary)' }}>
                AlphaDesk
              </em>
            </h1>
            <p className="text-base" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
              How would you like to get started?
            </p>
          </div>
        </motion.div>

        {/* Option cards */}
        <div className="grid sm:grid-cols-3 gap-5 w-full">
          {OPTIONS.map((opt, i) => (
            <motion.div
              key={opt.title}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.12, ease }}
            >
              <Link
                href={opt.href}
                className="relative flex flex-col gap-5 p-6 rounded-2xl h-full transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 group block"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: opt.recommended
                    ? `1.5px solid ${opt.color}50`
                    : '1px solid var(--border)',
                  boxShadow: opt.recommended
                    ? `0 0 32px ${opt.color}0E`
                    : 'none',
                }}
              >
                {/* Recommended badge */}
                {opt.recommended && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: opt.color,
                      color: '#06060A',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ◆ Recommended
                  </div>
                )}

                {/* Step number */}
                <span
                  className="text-5xl font-bold absolute top-4 right-5 select-none pointer-events-none"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: opt.color,
                    opacity: 0.07,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {opt.num}
                </span>

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: `${opt.color}12`, border: `1px solid ${opt.color}28` }}
                >
                  <opt.icon className="w-6 h-6" style={{ color: opt.color }} />
                </div>

                <div className="flex-1">
                  <h2
                    className="text-xl mb-2"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
                  >
                    {opt.title}
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
                    {opt.desc}
                  </p>
                </div>

                {/* CTA */}
                <div
                  className="flex items-center gap-2 text-sm font-semibold mt-auto pt-2 group-hover:gap-3 transition-all"
                  style={{ color: opt.color }}
                >
                  {opt.cta}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </div>

                {/* Bottom hover line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg, transparent, ${opt.color}, transparent)` }}
                />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
