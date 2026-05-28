/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        added: { 50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981', 700: '#047857' },
        removed: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 700: '#b91c1c' },
        modified: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 700: '#b45309' }
      }
    }
  },
  plugins: []
};
