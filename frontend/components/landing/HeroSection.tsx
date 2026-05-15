'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';

const TRUST = ['BSE India', 'NSE India', 'SEC EDGAR', 'PDF Upload'];

const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease },
});

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-24 pb-20 overflow-hidden">

      {/* Chart grid background */}
      <div className="absolute inset-0 chart-grid" />

      {/* Ambient glow — gold top-left */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-8%', left: '-4%',
          width: '55%', height: '65%',
          background: 'radial-gradient(ellipse, rgba(232,160,32,0.09) 0%, transparent 65%)',
          animation: 'gradientShift 11s ease infinite',
        }}
      />

      {/* Ambient glow — emerald bottom-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-12%', right: '-4%',
          width: '50%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(31,212,160,0.06) 0%, transparent 65%)',
          animation: 'gradientShift 15s ease infinite reverse',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">

          {/* ── LEFT ── */}
          <div className="flex flex-col">

            {/* Eyebrow */}
            <motion.div {...fadeUp(0.1)}>
              <span
                className="inline-flex items-center gap-2.5 text-xs tracking-[0.22em] uppercase mb-8"
                style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)', animation: 'glowPulse 2s ease infinite' }}
                />
                AI · India-First · BSE · NSE · SEC EDGAR
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div {...fadeUp(0.2)}>
              <h1>
                <span
                  className="block text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-primary)' }}
                >
                  Ask anything about
                </span>
                <span
                  className="block text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight italic font-semibold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)' }}
                >
                  any company&apos;s
                </span>
                <span
                  className="block text-5xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-primary)' }}
                >
                  financials.
                </span>
              </h1>
            </motion.div>

            {/* Subtext */}
            <motion.p
              {...fadeUp(0.38)}
              className="mt-7 text-lg leading-relaxed"
              style={{ color: 'var(--text-secondary)', fontWeight: 300, maxWidth: '490px' }}
            >
              Upload annual reports or auto-fetch BSE, NSE & SEC EDGAR filings.
              Get grounded answers with exact page citations — in plain English or Hinglish.
            </motion.p>

            {/* CTAs */}
            <motion.div {...fadeUp(0.5)} className="flex flex-wrap gap-3 mt-9">
              <Link
                href="/chat"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.04] hover:brightness-110"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#06060A',
                  boxShadow: '0 0 36px rgba(232,160,32,0.32)',
                }}
              >
                Start analyzing
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200"
                style={{
                  border: '1px solid var(--border-mid)',
                  color: 'var(--text-primary)',
                }}
              >
                How it works
                <ChevronRight className="w-4 h-4" />
              </Link>
            </motion.div>

            {/* Trust strip */}
            <motion.div
              {...fadeUp(0.62)}
              className="flex flex-wrap items-center gap-5 mt-8"
            >
              {TRUST.map((item, i) => (
                <span
                  key={item}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  {item}
                  {i < TRUST.length - 1 && (
                    <span className="ml-3" style={{ color: 'var(--border-bright)' }}>·</span>
                  )}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ── RIGHT — Terminal card ── */}
          <motion.div
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.45, ease }}
            className="hidden lg:flex justify-center items-center"
          >
            <div style={{ animation: 'float 7s ease-in-out infinite' }}>
              <TerminalCard />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function TerminalCard() {
  return (
    <div
      className="w-full max-w-[420px] rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-bright)',
        boxShadow: '0 0 64px rgba(232,160,32,0.10), 0 32px 80px rgba(0,0,0,0.55)',
      }}
    >
      {/* Terminal chrome */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#FF5F57' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#28CA41' }} />
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))', color: '#06060A' }}
          >
            R
          </div>
          <div>
            <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              RELIANCE.BSE
            </div>
            <div className="text-xs leading-tight" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              ● Loaded
            </div>
          </div>
        </div>
        <div
          className="text-xs px-2 py-1 rounded-md"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', background: 'var(--border)' }}
        >
          FY2024
        </div>
      </div>

      {/* Messages */}
      <div className="p-4 flex flex-col gap-3">

        {/* User message */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          className="self-end max-w-[82%]"
        >
          <div
            className="px-3.5 py-2 rounded-2xl rounded-tr-sm text-sm"
            style={{
              background: 'rgba(232,160,32,0.10)',
              border: '1px solid rgba(232,160,32,0.20)',
              color: 'var(--text-primary)',
            }}
          >
            What was Reliance&apos;s revenue and PAT in FY24?
          </div>
        </motion.div>

        {/* AI response */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8, duration: 0.5 }}
          className="self-start max-w-[92%]"
        >
          <div
            className="px-3.5 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
            style={{
              background: 'var(--bg-elevated)',
              borderLeft: '2px solid var(--primary)',
              color: 'var(--text-primary)',
            }}
          >
            Reliance reported revenue of{' '}
            <span style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>₹9,01,535 Cr</span>{' '}
            with PAT of{' '}
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>₹79,020 Cr</span>{' '}
            — up 7.3% YoY.
          </div>
        </motion.div>

        {/* Citation chips */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.4, duration: 0.4 }}
          className="flex gap-2 flex-wrap pl-0.5"
        >
          {['pg 42 · Revenue', 'pg 67 · PAT', 'pg 8 · Highlights'].map(cite => (
            <span
              key={cite}
              className="px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all hover:scale-105"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgba(31,212,160,0.08)',
                border: '1px solid rgba(31,212,160,0.22)',
                color: 'var(--accent)',
              }}
            >
              {cite}
            </span>
          ))}
        </motion.div>

        {/* Typing indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.0, duration: 0.3 }}
          className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-xl"
          style={{ background: 'var(--bg-elevated)' }}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--text-tertiary)',
                animation: `pulseDot 1.2s ease ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </motion.div>
      </div>

      {/* Input area */}
      <div className="px-4 pb-4">
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
            Ask about margins, debt, or outlook...
          </span>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--primary)' }}
          >
            <ArrowRight className="w-3.5 h-3.5" style={{ color: '#06060A' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
