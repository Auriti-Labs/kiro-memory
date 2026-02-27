/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/ui/viewer/**/*.{tsx,ts}',
    './src/ui/viewer.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        border: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
          hover: 'var(--border-hover)',
        },
        zinc: {
          50: 'var(--zinc-50)',
          100: 'var(--zinc-100)',
          200: 'var(--zinc-200)',
          300: 'var(--zinc-300)',
          400: 'var(--zinc-400)',
          500: 'var(--zinc-500)',
          600: 'var(--zinc-600)',
          700: 'var(--zinc-700)',
          800: 'var(--zinc-800)',
          900: 'var(--zinc-900)',
        },
        accent: {
          violet: '#7C5AFF',
          blue: '#3B82F6',
          cyan: '#22D3EE',
          green: '#34D399',
          amber: '#FBBF24',
          rose: '#FB7185',
          orange: '#FB923C',
        },
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'glow-violet': '0 0 20px rgba(124,90,255,0.15)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.15)',
        'panel': 'var(--shadow-panel)',
      },
      keyframes: {
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'spin': 'spin 0.8s linear infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'slide-in-left': 'slide-in-left 0.25s ease-out forwards',
      },
    },
  },
  plugins: [],
};
