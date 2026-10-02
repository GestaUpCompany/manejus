import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // O motor do relatório mora em vision-relatorio/pipeline (fora da raiz do app,
    // mas dentro do workspace pnpm — compartilhado entre pipeline Node e o app).
    fs: { allow: ['../..'] },
  },
})
