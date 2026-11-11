/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f0f9f2', 100: '#dcf1e1', 200: '#bbe3c6', 300: '#8cce9f', 400: '#57b174',
          500: '#339455', 600: '#237643', 700: '#1d5e37', 800: '#1a4b2d', 900: '#163e26',
        },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
};
