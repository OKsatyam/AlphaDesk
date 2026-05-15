'use client';
import { motion } from 'framer-motion';

const COMPANIES = [
  { name: 'Reliance',      ticker: 'RELIANCE', market: 'BSE', sector: 'Energy',     color: '#E8A020', change: '+1.4%', up: true  },
  { name: 'TCS',           ticker: 'TCS',       market: 'BSE', sector: 'IT',         color: '#1FD4A0', change: '+0.8%', up: true  },
  { name: 'HDFC Bank',     ticker: 'HDFCBANK',  market: 'NSE', sector: 'Banking',    color: '#A78BFA', change: '+0.3%', up: true  },
  { name: 'Infosys',       ticker: 'INFY',      market: 'BSE', sector: 'IT',         color: '#60A5FA', change: '-0.2%', up: false },
  { name: 'Apple',         ticker: 'AAPL',      market: 'SEC', sector: 'Technology', color: '#C0C0C0', change: '+0.6%', up: true  },
  { name: 'ITC',           ticker: 'ITC',       market: 'NSE', sector: 'FMCG',       color: '#34D399', change: '+1.1%', up: true  },
  { name: 'Microsoft',     ticker: 'MSFT',      market: 'SEC', sector: 'Technology', color: '#60A5FA', change: '+0.9%', up: true  },
  { name: 'SBI',           ticker: 'SBIN',      market: 'BSE', sector: 'Banking',    color: '#F472B6', change: '+0.5%', up: true  },
  { name: 'Wipro',         ticker: 'WIPRO',     market: 'NSE', sector: 'IT',         color: '#1FD4A0', change: '+1.8%', up: true  },
  { name: 'Tesla',         ticker: 'TSLA',      market: 'SEC', sector: 'EV',         color: '#EF4444', change: '+2.1%', up: true  },
  { name: 'Bajaj Finance', ticker: 'BAJFINANCE',market: 'NSE', sector: 'NBFC',       color: '#E8A020', change: '+0.7%', up: true  },
  { name: 'ONGC',          ticker: 'ONGC',      market: 'BSE', sector: 'Energy',     color: '#F59E0B', change: '-0.4%', up: false },
];

const DOUBLED = [...COMPANIES, ...COMPANIES];

export function CompanyShowcase() {
  return (
    <section className="py-20" style={{ backgroundColor: 'var(--bg-secondary)' }}>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10 px-4"
      >
        <p
          className="text-xs tracking-[0.2em] uppercase mb-2"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          Pre-loaded ·{' '}
          <span style={{ color: 'var(--primary)' }}>start asking immediately</span>
        </p>
        <h3
          className="text-2xl"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 300,
            color: 'var(--text-secondary)',
          }}
        >
          12 companies ready to analyze
        </h3>
      </motion.div>

      {/* Ticker tape */}
      <div className="relative overflow-hidden py-2">
        {/* Fade masks */}
        <div
          className="absolute inset-y-0 left-0 w-28 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--bg-secondary), transparent)' }}
        />
        <div
          className="absolute inset-y-0 right-0 w-28 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--bg-secondary), transparent)' }}
        />

        <div
          className="flex gap-3 w-max"
          style={{ animation: 'marquee 36s linear infinite' }}
          onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
          onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}
        >
          {DOUBLED.map((c, i) => (
            <TickerChip key={`${c.ticker}-${i}`} {...c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TickerChip({ name, ticker, market, sector, color, change, up }: {
  name: string; ticker: string; market: string; sector: string;
  color: string; change: string; up: boolean;
}) {
  const mktColor = market === 'BSE' ? '#E8A020' : market === 'NSE' ? '#1FD4A0' : '#60A5FA';
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl shrink-0 cursor-pointer transition-all duration-200 hover:scale-[1.04] hover:-translate-y-0.5"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: `${color}16`, color, border: `1px solid ${color}28` }}
      >
        {name[0]}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {name}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: mktColor,
              background: `${mktColor}12`,
              border: `1px solid ${mktColor}20`,
            }}
          >
            {market}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          >
            {sector}
          </span>
          <span style={{ color: 'var(--border-bright)' }}>·</span>
          <span
            className="text-xs font-medium"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: up ? '#1FD4A0' : '#FF4060',
            }}
          >
            {change}
          </span>
        </div>
      </div>
    </div>
  );
}
