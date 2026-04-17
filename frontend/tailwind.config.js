/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'z-bg': '#0A0A0F',
        'z-card': '#111827',
        'z-border': '#1E293B',
        'z-blue': {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          dark: '#1D4ED8',
        },
        sidebar: '#0D0D16',
      },
    },
  },
  plugins: [],
}
