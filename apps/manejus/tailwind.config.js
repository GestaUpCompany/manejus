/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cores semânticas via CSS variables (suportam dark mode)
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-light': 'rgb(var(--color-primary-light) / <alpha-value>)',
        'primary-dark': 'rgb(var(--color-primary-dark) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        // Surfaces
        'surface-0': 'rgb(var(--color-surface-0) / <alpha-value>)',
        'surface-1': 'rgb(var(--color-surface-1) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--color-surface-3) / <alpha-value>)',
        // Texto
        'content-strong': 'rgb(var(--color-content-strong) / <alpha-value>)',
        'content': 'rgb(var(--color-content) / <alpha-value>)',
        'content-muted': 'rgb(var(--color-content-muted) / <alpha-value>)',
        'content-faint': 'rgb(var(--color-content-faint) / <alpha-value>)',
        // Bordas
        'border-base': 'rgb(var(--color-border-base) / <alpha-value>)',
        'border-subtle': 'rgb(var(--color-border-subtle) / <alpha-value>)',
        // Mantém gray scale hardcoded para compatibilidade com código existente
        'gray-50': '#f9fafb',
        'gray-100': '#f3f4f6',
        'gray-500': '#6b7280',
        'gray-800': '#1f2937',
      },
    },
  },
  plugins: [],
}
