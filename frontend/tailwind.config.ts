import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary:  '#E8A020',
        accent:   '#1FD4A0',
        success:  '#1FD4A0',
        warning:  '#E8A020',
        danger:   '#FF4060',
        dark: {
          bg:            '#06060A',
          secondary:     '#0C0C13',
          card:          '#111119',
          elevated:      '#181821',
          border:        '#1C1C2A',
          textPrimary:   '#EDE8DC',
          textSecondary: '#72718A',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body:    ['var(--font-body)',    'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)',    'monospace'],
        sans:    ['var(--font-body)',    'system-ui', 'sans-serif'],
      },
      animation: {
        'float':        'float 7s ease-in-out infinite',
        'pulse-dot':    'pulseDot 1.2s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'marquee':      'marquee 35s linear infinite',
        'fade-up':      'fadeUp 0.75s cubic-bezier(0.16,1,0.3,1) forwards',
        'gradient-orb': 'gradientShift 12s ease infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(-0.5deg)' },
          '50%':       { transform: 'translateY(-14px) rotate(0deg)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1',   transform: 'scale(1)' },
          '50%':       { opacity: '0.3', transform: 'scale(0.7)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        gradientShift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':       { transform: 'translate(5%, 5%) scale(1.06)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
