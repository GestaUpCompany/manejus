import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Supabase
          'supabase': ['@supabase/supabase-js'],
          // Data fetching
          'query': ['@tanstack/react-query'],
          // Charts (recharts é importado estaticamente em páginas de relatório)
          'charts': ['recharts'],
          // Mapa da fazenda
          'map': ['maplibre-gl', 'terra-draw', 'terra-draw-maplibre-gl-adapter'],
          // xlsx, exceljs, jspdf, jspdf-autotable e chart.js são carregados sob demanda via dynamic import
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
