/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa Studio mb (placeholder, ajustar tras branding).
        brand: {
          50:  '#f5f7ff',
          100: '#e6ecff',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
