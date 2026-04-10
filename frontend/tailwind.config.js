/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D4AF37',
          light: '#E8CC5A',
          dark: '#B8961E',
        },
        sidebar: '#111827',
      },
    },
  },
  plugins: [],
}
