import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Purple palette sampled from the A&T Student Loans legal templates.
        brand: {
          50: '#f3ecfe',
          100: '#e9defc',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#7c3aed',
          600: '#5b21b6',
          700: '#4c1d95',
          800: '#3b1578',
          900: '#2e1065',
        },
      },
      fontFamily: {
        heading: ['Verdana', 'Geneva', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
