/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff4ff',
          100: '#dbe6fe',
          200: '#bfcffe',
          300: '#93b0fd',
          400: '#6088fa',
          500: '#3b63f6',
          600: '#2346eb',
          700: '#1a35d8',
          800: '#1c2eaf',
          900: '#1e2d8a',
          950: '#161d5c',
        },
        accent: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
    },
  },
  plugins: [],
};
