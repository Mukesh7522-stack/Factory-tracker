/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6ff',
          100: '#d9e4ff',
          300: '#8cb1ff',
          500: '#3b82f6',
          600: '#2563eb',
          900: '#0f172a',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 45px rgba(59, 130, 246, 0.35)',
      },
    },
  },
  plugins: [],
};