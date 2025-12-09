/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主题色 - 使用 RGB 值支持透明度
        primary: {
          50: 'rgb(var(--primary-50-rgb, 254 252 232) / <alpha-value>)',
          100: 'rgb(var(--primary-100-rgb, 254 249 195) / <alpha-value>)',
          200: 'rgb(var(--primary-200-rgb, 254 240 138) / <alpha-value>)',
          300: 'rgb(var(--primary-300-rgb, 253 224 71) / <alpha-value>)',
          400: 'rgb(var(--primary-400-rgb, 250 204 21) / <alpha-value>)',
          500: 'rgb(var(--primary-500-rgb, 234 179 8) / <alpha-value>)',
          600: 'rgb(var(--primary-600-rgb, 202 138 4) / <alpha-value>)',
          700: 'rgb(var(--primary-700-rgb, 161 98 7) / <alpha-value>)',
          800: 'rgb(var(--primary-800-rgb, 133 77 14) / <alpha-value>)',
          900: 'rgb(var(--primary-900-rgb, 113 63 18) / <alpha-value>)',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}




