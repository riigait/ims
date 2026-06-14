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
      },
      animation: {
        slideInRight: 'slideInRight 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
