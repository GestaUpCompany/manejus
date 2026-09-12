import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
// @ts-ignore -- modulos .js sem declaracao de tipos, carregados em dev local
import morteHandler from './api/pdf/morte.js'
// @ts-ignore
import consumoHandler from './api/pdf/consumo.js'

function localPdfApi(): Plugin {
  return {
    name: 'local-pdf-api',
    configureServer(server) {
      const register = (
        path: string,
        handler: (req: any, res: any) => Promise<void>,
      ) => {
        server.middlewares.use(path, async (req: IncomingMessage, res: ServerResponse, next) => {
          if (req.method !== 'POST') return next()

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))

          let body: unknown
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'JSON inválido' }))
            return
          }

          const apiResponse = {
            status(code: number) {
              res.statusCode = code
              return apiResponse
            },
            json(value: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(value))
            },
            setHeader(name: string, value: string) {
              res.setHeader(name, value)
            },
            send(value: Buffer) {
              res.end(value)
            },
          }

          await handler({ method: req.method, body }, apiResponse)
        })
      }

      register('/api/pdf/morte', morteHandler)
      register('/api/pdf/consumo', consumoHandler)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localPdfApi()],
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
          'react-pdf': ['@react-pdf/renderer'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
