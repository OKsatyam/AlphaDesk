'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { TrendingUp, Menu, X, LogOut, LayoutDashboard } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';

const NAV_LINKS = [
  { label: 'Features',     href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Companies',    href: '/companies' },
];

export function Navbar() {
  const { data: session, status } = useSession();
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        backgroundColor: scrolled ? 'rgba(6,6,10,0.90)' : 'transparent',
        backdropFilter:  scrolled ? 'blur(20px) saturate(160%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
        borderBottom:    scrolled ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}
          >
            <TrendingUp className="w-4 h-4" style={{ color: '#06060A' }} />
          </div>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Alpha<span style={{ color: 'var(--primary)' }}>Desk</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(link => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium transition-colors duration-200 hover:text-primary"
              style={{ color: 'var(--text-secondary)' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {status !== 'loading' && (
            session ? (
              <>
                <Link
                  href="/chat"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200 hover:text-primary"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Link>
                <div className="hidden sm:flex items-center gap-2">
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? 'User'}
                      className="w-8 h-8 rounded-full object-cover"
                      style={{ border: '2px solid var(--primary)' }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--primary)', color: '#06060A' }}
                    >
                      {(session.user?.name ?? session.user?.email ?? 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="p-1.5 rounded-lg transition-colors hover:text-primary"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/auth"
                  className="hidden sm:inline-flex text-sm font-medium transition-colors duration-200 hover:text-primary"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sign in
                </Link>
                <Link
                  href="/chat"
                  className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:scale-[1.04] hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: '#06060A',
                    boxShadow: '0 0 24px rgba(232,160,32,0.28)',
                  }}
                >
                  <span className="hidden sm:inline">Try free</span>
                  <span className="sm:hidden">Try</span>
                </Link>
              </>
            )
          )}
          <button
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden border-t px-4 py-5 flex flex-col gap-4"
          style={{
            background: 'rgba(6,6,10,0.96)',
            backdropFilter: 'blur(20px)',
            borderColor: 'var(--border)',
          }}
        >
          {NAV_LINKS.map(link => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium py-1 transition-colors hover:text-primary"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {session ? (
            <>
              <Link
                href="/chat"
                className="text-sm font-medium transition-colors hover:text-primary"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileOpen(false)}
              >
                Dashboard
              </Link>
              <button
                onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }); }}
                className="text-left text-sm font-medium transition-colors hover:text-primary"
                style={{ color: 'var(--text-secondary)' }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="text-sm font-medium transition-colors hover:text-primary"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/chat"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: 'var(--primary)', color: '#06060A' }}
                onClick={() => setMobileOpen(false)}
              >
                Start for free
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
