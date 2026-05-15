'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TrendingUp, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState<string | null>(null);

  async function handleOAuth(provider: 'google' | 'github' | 'twitter') {
    setLoading(provider);
    await signIn(provider, { callbackUrl: '/chat' });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error('Enter email and password');
    if (password.length < 6)  return toast.error('Password must be at least 6 characters');
    setLoading('email');
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.ok) {
      toast.success('Signed in');
      router.push('/chat');
    } else {
      toast.error('Sign in failed — check your credentials');
      setLoading(null);
    }
  }

  return (
    <div
      className="min-h-screen flex items-stretch"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* ── LEFT PANEL — brand story (desktop only) ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[44%] p-12 relative overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
      >
        {/* Chart grid */}
        <div className="absolute inset-0 chart-grid opacity-60" />

        {/* Glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '-10%', left: '-10%',
            width: '70%', height: '70%',
            background: 'radial-gradient(ellipse, rgba(232,160,32,0.08) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: '-10%', right: '-10%',
            width: '60%', height: '60%',
            background: 'radial-gradient(ellipse, rgba(31,212,160,0.05) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
            >
              <TrendingUp className="w-4.5 h-4.5" style={{ color: '#06060A' }} />
            </div>
            <span
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Folio<span style={{ color: 'var(--primary)' }}>AI</span>
            </span>
          </div>
        </div>

        {/* Center quote */}
        <div className="relative z-10">
          <blockquote
            className="text-4xl leading-snug mb-6"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--text-primary)' }}
          >
            &ldquo;The investor who reads the most,{' '}
            <em style={{ color: 'var(--primary)', fontStyle: 'italic' }}>
              wins the most.
            </em>&rdquo;
          </blockquote>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            — AlphaDesk
          </p>
        </div>

        {/* Bottom stats */}
        <div className="relative z-10 flex gap-8">
          {[
            { num: 'BSE', label: 'India Exchange' },
            { num: 'NSE', label: 'India Exchange' },
            { num: 'SEC', label: 'US Filings' },
          ].map(s => (
            <div key={s.num}>
              <div
                className="text-2xl font-bold"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)' }}
              >
                {s.num}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — auth form ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm flex flex-col gap-7">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
            >
              <TrendingUp className="w-4 h-4" style={{ color: '#06060A' }} />
            </div>
            <span
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Folio<span style={{ color: 'var(--primary)' }}>AI</span>
            </span>
          </div>

          {/* Heading */}
          <div>
            <h1
              className="text-3xl mb-1.5"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}
            >
              Sign in
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
              Save chats, sync across devices, fetch company reports.
            </p>
          </div>

          {/* Guest warning */}
          <div
            className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl"
            style={{
              background: 'rgba(232,160,32,0.07)',
              border: '1px solid rgba(232,160,32,0.22)',
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
            <span className="text-xs leading-relaxed" style={{ color: 'var(--primary)' }}>
              Guest chats are local only. Sign in to sync across devices.
            </span>
          </div>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2.5">
            <OAuthBtn
              label="Continue with Google"
              disabled={!!loading}
              loading={loading === 'google'}
              onClick={() => handleOAuth('google')}
              style={{ background: '#fff', color: '#0A0A0F', border: '1px solid #ddd' }}
              icon={
                <svg width="17" height="17" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
                </svg>
              }
            />
            <OAuthBtn
              label="Continue with GitHub"
              disabled={!!loading}
              loading={loading === 'github'}
              onClick={() => handleOAuth('github')}
              style={{ background: '#161B22', color: '#fff', border: '1px solid #30363D' }}
              icon={
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
              }
            />
            <OAuthBtn
              label="Continue with X (Twitter)"
              disabled={!!loading}
              loading={loading === 'twitter'}
              onClick={() => handleOAuth('twitter')}
              style={{ background: '#000', color: '#fff', border: '1px solid #333' }}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              }
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              or email
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="flex flex-col gap-2.5">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <button
              type="submit"
              disabled={!!loading}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#06060A',
                boxShadow: '0 0 24px rgba(232,160,32,0.25)',
              }}
            >
              {loading === 'email'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <>Sign in / Create account <ArrowRight className="w-4 h-4" /></>}
            </button>
            <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No account? Enter any email + password to create one.
            </p>
          </form>

          {/* Guest */}
          <Link
            href="/chat"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:border-primary/40"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            Continue as guest →
          </Link>
        </div>
      </div>
    </div>
  );
}

function OAuthBtn({
  label, icon, disabled, loading, onClick, style,
}: {
  label: string; icon: React.ReactNode; disabled: boolean;
  loading: boolean; onClick: () => void; style: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] hover:opacity-90 disabled:opacity-50"
      style={style}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
