'use client';
import { motion } from 'framer-motion';

interface CitationPillProps {
  label: string;
  onClick?: () => void;
}

export function CitationPill({ label, onClick }: CitationPillProps) {
  return (
    <motion.span
      whileHover={{ scale: 1.05, y: -1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold cursor-pointer transition-colors"
      style={{
        backgroundColor: 'rgba(14,165,233,0.12)',
        color: '#0EA5E9',
        border: '1px solid rgba(14,165,233,0.3)',
      }}
    >
      [{label}]
    </motion.span>
  );
}
