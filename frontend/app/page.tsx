import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeatureStrip } from '@/components/landing/FeatureStrip';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { CompanyShowcase } from '@/components/landing/CompanyShowcase';

export const metadata: Metadata = {
  title: 'AlphaDesk — AI Financial Document Intelligence',
  description:
    "Ask anything about any company's financials. Analyze BSE, NSE & SEC EDGAR filings with AI-powered answers and exact page citations. India-first, free to start.",
  alternates: { canonical: 'https://alphadeskAI.com' },
  openGraph: {
    title: "AlphaDesk — Ask anything about any company's financials",
    description: 'BSE · NSE · SEC EDGAR · PDF. Grounded AI answers with page citations. Free to start.',
    url: 'https://alphadeskAI.com',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'AlphaDesk' }],
  },
};

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Navbar />
      <HeroSection />
      <FeatureStrip />
      <HowItWorks />
      <CompanyShowcase />
      <Footer />
    </main>
  );
}
