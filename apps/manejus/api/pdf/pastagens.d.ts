import type {
  OcupacaoPasto,
  RegistroPastagem,
  ResumoPastagens,
} from '../../src/features/relatorioPastagens/agregacao'

export interface RenderPastagensHtmlInput {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  logoGestao: string
  logoFazenda: string
  resumo: ResumoPastagens
  registros: RegistroPastagem[]
  ocupacoes: OcupacaoPasto[]
}

export function renderPastagensHtml(input: RenderPastagensHtmlInput): Promise<string>
