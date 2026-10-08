import { Buffer } from 'buffer'
// Polyfill para @react-pdf/renderer que espera Buffer global no browser
if (typeof (window as any).Buffer === 'undefined') {
  (window as any).Buffer = Buffer
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { AuthProvider } from '@gestaup/shared'
import { ToastProvider } from '@gestaup/ui'
import { StagingBanner } from './components/StagingBanner'
import { tituloComAmbiente } from './utils/ambiente'
import './index.css'

// Em staging, distingue a aba da produção pelo título
document.title = tituloComAmbiente(document.title)

// Preconnect ao Supabase para eliminar DNS+TLS latency na primeira chamada de API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
if (supabaseUrl) {
  try {
    const origin = new URL(supabaseUrl).origin
    for (const rel of ['preconnect', 'dns-prefetch']) {
      const link = document.createElement('link')
      link.rel = rel
      link.href = origin
      if (rel === 'preconnect') link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    }
  } catch {
    // URL inválida: ignora silenciosamente
  }
}

// Desabilita mudança de valor de input[type=number] pela roda do mouse:
// com foco no campo, scroll alterava o valor silenciosamente (causa de erro
// de digitação no ajuste de estoque). O blur deixa o scroll seguir na página.
document.addEventListener(
  'wheel',
  (e) => {
    const el = e.target
    if (el instanceof HTMLInputElement && el.type === 'number') {
      el.blur()
    }
  },
  { passive: true },
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <App />
          <StagingBanner />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
