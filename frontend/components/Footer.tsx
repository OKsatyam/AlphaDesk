import Link from 'next/link';
import { TrendingUp, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-8">

          {/* Brand */}
          <div className="flex flex-col items-center sm:items-start gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
              >
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#06060A' }} />
              </div>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                Folio<span style={{ color: 'var(--primary)' }}>AI</span>
              </span>
            </Link>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              AI-powered financial document intelligence
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm transition-colors duration-200 hover:text-primary"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <Link
              href="/privacy"
              className="text-sm transition-colors duration-200 hover:text-primary"
              style={{ color: 'var(--text-secondary)' }}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm transition-colors duration-200 hover:text-primary"
              style={{ color: 'var(--text-secondary)' }}
            >
              Terms
            </Link>
          </div>

          {/* Made in India */}
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
          >
            <span>🇮🇳</span>
            <span>Made for Indian investors</span>
          </div>
        </div>

        {/* Gold divider */}
        <div className="mt-8 gold-rule" />

        <p
          className="mt-4 text-center text-xs"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          © {new Date().getFullYear()} AlphaDesk · For informational purposes only · Not financial advice
        </p>
      </div>
    </footer>
  );
}
