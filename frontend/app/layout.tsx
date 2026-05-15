import type { Metadata } from 'next';
import './globals.css';
import { Cormorant_Garamond, Outfit, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import Providers from '@/components/Providers';
import { Toaster } from 'sonner';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AlphaDesk — AI Financial Document Intelligence',
    template: '%s | AlphaDesk',
  },
  description:
    "Ask anything about any company's financials. Analyze BSE, NSE, SEC EDGAR filings and annual reports — get grounded answers with page citations in seconds.",
  keywords: [
    'financial analysis', 'BSE India', 'NSE India', 'SEC EDGAR', 'annual report',
    'AI financial intelligence', 'India stocks', 'stock research', '10-K analysis',
    'Zerodha', 'Groww', 'Indian investors', 'financial document AI',
  ],
  authors: [{ name: 'AlphaDesk' }],
  creator: 'AlphaDesk',
  metadataBase: new URL('https://alphadeskAI.com'),
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    title: 'AlphaDesk — AI Financial Document Intelligence',
    description: "Ask anything about any company's financials. BSE · NSE · SEC EDGAR · PDF",
    siteName: 'AlphaDesk',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AlphaDesk — AI Financial Document Intelligence',
    description: 'AI-powered analysis of BSE, NSE, SEC filings. Grounded answers with citations.',
    creator: '@alphadesk_ai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${outfit.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="font-body">
        <Providers>
          <ThemeProvider>
            {children}
            <Toaster
              position="top-right"
              expand={false}
              richColors
              toastOptions={{
                style: {
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-mid)',
                  color: 'var(--text-primary)',
                },
              }}
            />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
