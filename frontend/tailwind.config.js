/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          dark: '#1D4ED8',
        },
        sidebar: '#111827',
        zyra: {
          bg:     '#0A0A0F',
          card:   '#111827',
          blue:   '#2563EB',
          text:   '#F1F5F9',
          muted:  '#94A3B8',
          border: '#1E293B',
        },
      },
    },
  },
  plugins: [],
}
