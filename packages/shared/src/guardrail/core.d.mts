export const FAZENDA_TESTES_ID: string
export const SUPABASE_PROJECT_REF: string
export const TABELAS_PROIBIDAS: Set<string>

export class GuardrailError extends Error {
  detalhe: Record<string, unknown>
  constructor(mensagem: string, detalhe?: Record<string, unknown>)
}

export interface OpcoesGuardrail {
  fazendaPermitida?: string
  hostsPermitidos?: string[]
  rpcsVerificadas?: Set<string>
  functionsPermitidas?: string[]
}

export interface RequisicaoHttp {
  method?: string
  url: string
  body?: string
}

export function assertFazendaDeTestes(fazendaId: unknown, permitido?: string): string
export function assertAmbienteDeTeste(env?: { nodeEnv?: string; supabaseUrl?: string; fazendaConfigurada?: unknown }): void
export function assertRequisicaoPermitida(req?: RequisicaoHttp, opcoes?: OpcoesGuardrail): void
export function criarFetchGuardado(
  fetchReal: (input: any, init?: any) => Promise<any>,
  opcoes?: OpcoesGuardrail,
): (input: any, init?: any) => Promise<any>
