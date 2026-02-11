/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      keyframes: {
        'zoom-in-95': {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' }
        },
        'slide-in-from-bottom-8': {
          '0%': { transform: 'translateY(2rem)' },
          '100%': { transform: 'translateY(0)' }
        }
      },
      animation: {
        'zoom-in-95': 'zoom-in-95 0.3s ease-out',
        'slide-in-from-bottom-8': 'slide-in-from-bottom-8 0.3s ease-out'
      }
    }
  },
  plugins: []
};
