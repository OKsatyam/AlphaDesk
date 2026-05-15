import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="gradient-mesh" />
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-lg">
        {/* Big 404 */}
        <div className="font-mono font-bold text-8xl sm:text-9xl leading-none bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          404
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            This page got delisted
          </h1>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            Looks like this filing doesn&apos;t exist. Let&apos;s get you back to analyzing real companies.
          </p>
        </div>

        {/* Easter egg ticker */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>LOST</span>
          <span className="font-bold" style={{ color: '#EF4444' }}>▼ -100.00%</span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>today</span>
        </div>

        <Link
          href="/"
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm bg-primary hover:bg-indigo-500 transition-all hover:scale-105"
        >
          Go to dashboard →
        </Link>
      </div>
    </div>
  );
}
