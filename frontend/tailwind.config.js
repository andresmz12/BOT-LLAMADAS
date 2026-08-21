/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        'z-bg': '#0A0A0F',
        'z-card': '#111827',
        'z-card-hi': '#141d31',
        'z-border': '#1E293B',
        'z-blue': {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          dark: '#1D4ED8',
        },
        'z-good': '#10b981',
        'z-warn': '#f59e0b',
        'z-crit': '#ef4444',
        sidebar: '#0D0D16',
      },
    },
  },
  plugins: [],
}
