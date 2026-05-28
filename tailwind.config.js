/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI Variable"', '"Segoe UI"', 'Inter', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      keyframes: {
        'progress-stripe': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' }
        }
      },
      animation: {
        'progress-stripe': 'progress-stripe 1.4s ease-in-out infinite'
      },
      colors: {
        bg: {
          base: '#0b1220',     // app background
          surface: '#111827',  // top bar, sticky headers
          raised: '#1f2937',   // cards, expanded panels
          hover:  '#1e2a3d'
        },
        line: {
          DEFAULT: '#1f2937',
          strong:  '#334155'
        },
        ink: {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569'
        },
        accent: {
          DEFAULT: '#22d3ee',  // cyan-400
          hover:   '#67e8f9',
          ink:     '#082f3a'
        }
      }
    }
  },
  plugins: []
};
