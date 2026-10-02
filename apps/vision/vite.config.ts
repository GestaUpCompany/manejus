import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
// @ts-ignore -- modulos .js sem declaracao de tipos, carregados em dev local
import visionPdfHandler from './api/pdf/vision.js'

// Em dev o Vite não sobe funções serverless: este middleware registra o mesmo
// handler que a Vercel executa em produção, igual ao padrão do app manejus.
function localPdfApi(): Plugin {
  return {
    name: 'local-pdf-api',
    configureServer(server) {
      process.env.VITE_SUPABASE_URL ||= server.config.env.VITE_SUPABASE_URL
      process.env.VITE_SUPABASE_ANON_KEY ||= server.config.env.VITE_SUPABASE_ANON_KEY
      server.middlewares.use('/api/pdf/vision', async (req: IncomingMessage, res: ServerResponse, next) => {
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
          write(value: Buffer) {
            return res.write(value)
          },
          end(value?: Buffer) {
            res.end(value)
          },
        }

        await visionPdfHandler({ method: req.method, body, headers: req.headers }, apiResponse)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localPdfApi()],
  server: {
    // O motor do relatório mora em vision-relatorio/pipeline (fora da raiz do app,
    // mas dentro do workspace pnpm — compartilhado entre pipeline Node e o app).
    fs: { allow: ['../..'] },
  },
})
