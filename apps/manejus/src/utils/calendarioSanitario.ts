// Calendário sanitário: programação de campanhas por fazenda (ex.: vacina anual) e leitura das pendências calculadas
// pelo banco (calendario_sanitario_pendencias). Regras puras, sem acesso a dados.
import { TIPOS_APLICACAO, type TipoAplicacao } from './sanidade'

export interface FormProgramacao {
  nome: string
  tipo: TipoAplicacao
  /** '' = produto fora do catálogo (nome digitado) */
  medicamentoId: string
  produtoNome: string
  /** categorias separadas por vírgula; '' = todas as categorias do lote */
  categorias: string
  /** AAAA-MM-DD: uma ocorrência de referência */
  dataBase: string
  periodoMeses: string
  antecedenciaDias: string
  prazoDias: string
  observacao: string
}

export interface ProgramacaoSanitaria {
  id: string
  nome: string
  tipo: TipoAplicacao
  medicamento_id: string | null
  produto_nome: string
  categorias: string[]
  data_base: string
  periodo_meses: number
  antecedencia_dias: number
  prazo_dias: number
  observacao: string | null
  ativo: boolean
}

export interface PendenciaCalendario {
  programacao_id: string
  nome: string
  produto_nome: string
  lote_id: string
  lote_nome: string
  categoria: string
  quant_atual: number
  ocorrencia: string
  situacao: 'atrasada' | 'a_vencer'
  dias: number
  cabecas_aplicadas: number
}

/**
 * Modelos de partida. Não trazem data: as datas oficiais (aftosa, brucelose...) dependem do órgão sanitário do estado e
 * mudam; cada fazenda informa a sua e confere a exigência.
 */
export interface ModeloProgramacao {
  id: string
  nome: string
  tipo: TipoAplicacao
  produtoNome: string
  periodoMeses: number
  categorias: string
  observacao: string
}

export const MODELOS_PROGRAMACAO: ModeloProgramacao[] = [
  { id: 'aftosa', nome: 'Vacinação contra febre aftosa', tipo: 'Vacinação', produtoNome: 'Vacina contra febre aftosa', periodoMeses: 6, categorias: '', observacao: 'Confirme com o órgão sanitário do estado se a vacinação é exigida e em quais datas.' },
  { id: 'brucelose', nome: 'Vacinação contra brucelose (bezerras)', tipo: 'Vacinação', produtoNome: 'Vacina contra brucelose', periodoMeses: 12, categorias: '', observacao: 'Em fêmeas jovens, na faixa de idade indicada pelo órgão sanitário. Informe a categoria das bezerras da fazenda.' },
  { id: 'raiva', nome: 'Vacinação contra raiva dos herbívoros', tipo: 'Vacinação', produtoNome: 'Vacina contra raiva', periodoMeses: 12, categorias: '', observacao: 'Campanha anual; ajuste a região conforme a orientação veterinária.' },
  { id: 'clostridioses', nome: 'Vacinação contra clostridioses', tipo: 'Vacinação', produtoNome: 'Vacina clostridial', periodoMeses: 12, categorias: '', observacao: 'Reforço e calendário conforme o veterinário da fazenda.' },
  { id: 'vermifugacao', nome: 'Vermifugação estratégica', tipo: 'Vermifugação', produtoNome: 'Vermífugo', periodoMeses: 6, categorias: '', observacao: 'Épocas e categorias conforme o plano do veterinário.' },
]

export function formVazioProgramacao(): FormProgramacao {
  return {
    nome: '',
    tipo: 'Vacinação',
    medicamentoId: '',
    produtoNome: '',
    categorias: '',
    dataBase: '',
    periodoMeses: '12',
    antecedenciaDias: '15',
    prazoDias: '60',
    observacao: '',
  }
}

export function formDoModelo(modelo: ModeloProgramacao): FormProgramacao {
  return {
    ...formVazioProgramacao(),
    nome: modelo.nome,
    tipo: modelo.tipo,
    produtoNome: modelo.produtoNome,
    periodoMeses: String(modelo.periodoMeses),
    categorias: modelo.categorias,
    observacao: modelo.observacao,
  }
}

export function formDaProgramacao(p: ProgramacaoSanitaria): FormProgramacao {
  return {
    nome: p.nome,
    tipo: p.tipo,
    medicamentoId: p.medicamento_id ?? '',
    produtoNome: p.produto_nome,
    categorias: p.categorias.join(', '),
    dataBase: p.data_base,
    periodoMeses: String(p.periodo_meses),
    antecedenciaDias: String(p.antecedencia_dias),
    prazoDias: String(p.prazo_dias),
    observacao: p.observacao ?? '',
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function inteiro(texto: string): number | null {
  if (texto.trim() === '') return null
  const n = Number(texto)
  return Number.isInteger(n) ? n : NaN
}

/** Lista de categorias digitadas (vírgula), sem vazios nem repetidas (sem diferenciar maiúsculas). */
export function listaDeCategorias(texto: string): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const parte of texto.split(',')) {
    const c = parte.trim()
    if (c === '' || vistos.has(c.toLowerCase())) continue
    vistos.add(c.toLowerCase())
    saida.push(c)
  }
  return saida
}

export function validarProgramacao(form: FormProgramacao): string[] {
  const erros: string[] = []
  if (form.nome.trim() === '') erros.push('Informe o nome da programação')
  if (!(TIPOS_APLICACAO as readonly string[]).includes(form.tipo)) erros.push('Tipo inválido')
  if (form.produtoNome.trim() === '') erros.push('Informe o produto')
  if (!ISO.test(form.dataBase) || Number.isNaN(Date.parse(`${form.dataBase}T00:00:00Z`))) erros.push('Informe a data de uma ocorrência (referência)')
  const periodo = inteiro(form.periodoMeses)
  if (periodo === null || Number.isNaN(periodo) || periodo < 1 || periodo > 60) erros.push('Repetir a cada: de 1 a 60 meses')
  const ant = inteiro(form.antecedenciaDias)
  if (ant === null || Number.isNaN(ant) || ant < 0 || ant > 120) erros.push('Avisar com antecedência: de 0 a 120 dias')
  const prazo = inteiro(form.prazoDias)
  if (prazo === null || Number.isNaN(prazo) || prazo < 1 || prazo > 365) erros.push('Prazo após a data: de 1 a 365 dias')
  return erros
}

/** Linha para `calendario_sanitario`. */
export function montarProgramacaoParaGravar(form: FormProgramacao, fazendaId: string) {
  return {
    fazenda_id: fazendaId,
    nome: form.nome.trim(),
    tipo: form.tipo,
    medicamento_id: form.medicamentoId === '' ? null : form.medicamentoId,
    produto_nome: form.produtoNome.trim(),
    categorias: listaDeCategorias(form.categorias),
    data_base: form.dataBase,
    periodo_meses: inteiro(form.periodoMeses) as number,
    antecedencia_dias: inteiro(form.antecedenciaDias) as number,
    prazo_dias: inteiro(form.prazoDias) as number,
    observacao: form.observacao.trim() === '' ? null : form.observacao.trim(),
  }
}

export function rotuloPeriodo(meses: number): string {
  if (meses === 12) return 'Anual'
  if (meses === 6) return 'Semestral'
  if (meses === 3) return 'Trimestral'
  if (meses === 1) return 'Mensal'
  if (meses % 12 === 0) return `A cada ${meses / 12} anos`
  return `A cada ${meses} meses`
}

export function textoPrazo(situacao: PendenciaCalendario['situacao'], dias: number): string {
  if (situacao === 'atrasada') {
    const d = Math.abs(dias)
    return d === 1 ? 'atrasada há 1 dia' : `atrasada há ${d} dias`
  }
  if (dias === 0) return 'é hoje'
  return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`
}

export interface GrupoPendencia {
  programacaoId: string
  nome: string
  produto: string
  ocorrencia: string
  situacao: PendenciaCalendario['situacao']
  dias: number
  itens: PendenciaCalendario[]
  totalCabecas: number
}

/** Agrupa as pendências por programação (já ordenadas pelo banco), atrasadas primeiro. */
export function agruparPendencias(linhas: PendenciaCalendario[]): GrupoPendencia[] {
  const mapa = new Map<string, GrupoPendencia>()
  for (const l of linhas) {
    let g = mapa.get(l.programacao_id)
    if (!g) {
      g = { programacaoId: l.programacao_id, nome: l.nome, produto: l.produto_nome, ocorrencia: l.ocorrencia, situacao: l.situacao, dias: l.dias, itens: [], totalCabecas: 0 }
      mapa.set(l.programacao_id, g)
    }
    g.itens.push(l)
    g.totalCabecas += l.quant_atual
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.situacao !== b.situacao) return a.situacao === 'atrasada' ? -1 : 1
    return a.dias - b.dias
  })
}
