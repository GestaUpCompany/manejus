import { supabase } from './supabaseClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export interface ChatResposta {
  resposta: string
  funcoes_chamadas: string[]
  tokens: { input: number; output: number; cached: number }
  limite_diario?: number
  limite_restante?: number
}

export async function enviarPerguntaIA(pergunta: string): Promise<ChatResposta> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/chat-fazenda`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pergunta }),
    },
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ erro: 'Erro desconhecido' }))
    throw new Error(error.erro || `Erro ${response.status}`)
  }

  return await response.json()
}
