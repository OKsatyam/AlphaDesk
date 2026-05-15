'use client';
import { motion } from 'framer-motion';
import { Building2, MessageSquare, BookOpen } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: Building2,
    color: '#E8A020',
    title: 'Pick a company or upload a PDF',
    desc: 'Search BSE, NSE, or SEC EDGAR — or drag-drop your own annual report PDF.',
  },
  {
    num: '02',
    icon: MessageSquare,
    color: '#1FD4A0',
    title: 'Ask in plain English or Hinglish',
    desc: '"What was PAT in FY24?" or "Debt kitna hai?" — either works perfectly.',
  },
  {
    num: '03',
    icon: BookOpen,
    color: '#A78BFA',
    title: 'Get answers with page citations',
    desc: 'Every answer cites the exact page. Click any citation to jump directly to the source.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-28"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <p
            className="text-xs tracking-[0.22em] uppercase mb-5"
            style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
          >
            ◆ Process
          </p>
          <h2
            className="text-4xl sm:text-5xl"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}
          >
            How it works in{' '}
            <em style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--accent)' }}>
              three steps
            </em>
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="relative grid sm:grid-cols-3 gap-10">

          {/* Gradient connecting line — desktop only */}
          <div
            className="absolute hidden sm:block pointer-events-none"
            style={{ top: '38px', left: '18%', right: '18%', height: '1px' }}
          >
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              whileInView={{ scaleX: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{
                height: '1px',
                background: 'linear-gradient(90deg, #E8A020, #1FD4A0, #A78BFA)',
                opacity: 0.3,
                transformOrigin: 'left center',
              }}
            />
          </div>

          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center text-center"
            >
              {/* Icon circle */}
              <div className="relative mb-7 z-10">
                <div
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 hover:scale-105"
                  style={{
                    background: `${step.color}0E`,
                    border: `1.5px solid ${step.color}38`,
                    boxShadow: `0 0 28px ${step.color}0A`,
                  }}
                >
                  <step.icon className="w-6 h-6" style={{ color: step.color }} />
                  <span
                    className="text-xs leading-none"
                    style={{ fontFamily: 'var(--font-mono)', color: step.color, opacity: 0.65 }}
                  >
                    {step.num}
                  </span>
                </div>
              </div>

              <h3
                className="text-xl mb-3 px-2"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                {step.title}
              </h3>
              <p
                className="text-sm leading-relaxed px-4"
                style={{ color: 'var(--text-secondary)', fontWeight: 300 }}
              >
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
