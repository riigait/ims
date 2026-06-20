/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(2rem)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        detailPopupIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        slideInRight: 'slideInRight 0.25s ease-out',
        detailPopupIn: 'detailPopupIn 0.12s ease-out',
      },
    },
  },
  plugins: [],
}
