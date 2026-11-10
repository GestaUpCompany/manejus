// Agregação do relatório de Maternidade. A RPC (get_dados_relatorio_maternidade) devolve uma linha
// por cria registrada; aqui viram KPIs, distribuições e o painel de matrizes. É a fonte única das
// regras: a página pública, o PDF individual e o Infográfico usam o mesmo resumo (o endpoint de PDF não importa o front).
//
// Regras:
//  - Cria morta = tipo_parto com 'Aborto' ou 'Natimorto' (não conta como cria viva).
//  - Parto = grupo de linhas com o mesmo parto_vinculo_id (gêmeos); sem vínculo, cada linha é um parto.
//  - Intercorrência = parto com Cesárea, Auxiliado, Aborto ou Natimorto.

export interface MedicamentoMaternidade {
  nomeComercial?: string | null
  principioAtivo?: string | null
  tipo?: string | null
  doseAplicada?: string | null
}

export interface RegistroMaternidade {
  id: string
  data: string
  pasto: string | null
  lote: string | null
  sexo: string | null
  raca: string | null
  peso_cria_kg: number | null
  tipo_parto: string[]
  categoria_mae: string | null
  escore_matriz: string | null
  docilidade_matriz: number | null
  tratamento: string | null
  medicamentos: MedicamentoMaternidade[]
  mae: string | null
  cria: string | null
  parto_vinculo_id: string | null
  mae_adotiva: string | null
  observacao: string | null
  responsavel: string | null
}

export interface DadosRelatorioMaternidade {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  gerado_em?: string
  data_inicio?: string | null
  data_fim?: string | null
  registros: RegistroMaternidade[]
  registros_total: number
}

export const DADOS_MATERNIDADE_VAZIO: DadosRelatorioMaternidade = { registros: [], registros_total: 0 }

export interface ItemDistribuicao {
  label: string
  valor: number
}

export interface MesNascimentos {
  mes: string
  partos: number
  crias: number
}

export interface MatrizResumo {
  mae: string
  categoria: string | null
  partos: number
  crias: number
  intercorrencias: number
  medicamentos: number
  escore_medio: number | null
}

export interface ResumoMaternidade {
  partos: number
  crias: number
  crias_vivas: number
  crias_mortas: number
  partos_gemeos: number
  partos_com_intercorrencia: number
  taxa_intercorrencia: number | null
  taxa_perda: number | null
  peso_medio_kg: number | null
  pesadas: number
  machos: number
  femeas: number
  escore_medio: number | null
  docilidade_media: number | null
  matrizes_distintas: number
  partos_medicados: number
  por_sexo: ItemDistribuicao[]
  por_raca: ItemDistribuicao[]
  por_tipo_parto: ItemDistribuicao[]
  por_categoria_mae: ItemDistribuicao[]
  por_pasto: ItemDistribuicao[]
  por_lote: ItemDistribuicao[]
  por_mes: MesNascimentos[]
  tratamentos: ItemDistribuicao[]
  medicamentos: ItemDistribuicao[]
  matrizes: MatrizResumo[]
}

export const ROTULOS_INTERCORRENCIA = ['Cesárea', 'Auxiliado', 'Aborto', 'Natimorto']
const ROTULOS_CRIA_MORTA = ['Aborto', 'Natimorto']
const SEM_INFORMACAO = 'Não informado'
const MAX_MATRIZES = 10
const MAX_DISTRIBUICAO = 10

export function criaMorta(r: RegistroMaternidade): boolean {
  return (r.tipo_parto ?? []).some((t) => ROTULOS_CRIA_MORTA.includes(t))
}

export function temIntercorrencia(r: RegistroMaternidade): boolean {
  return (r.tipo_parto ?? []).some((t) => ROTULOS_INTERCORRENCIA.includes(t))
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
}

function distribuir(valores: (string | null | undefined)[], limite = Infinity): ItemDistribuicao[] {
  const mapa = new Map<string, number>()
  for (const v of valores) {
    const chave = (v ?? '').trim() || SEM_INFORMACAO
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
  }
  return [...mapa.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, limite)
}

function tokens(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

// Agrupa as linhas em partos: gêmeos compartilham parto_vinculo_id.
function agruparPartos(registros: RegistroMaternidade[]): RegistroMaternidade[][] {
  const grupos = new Map<string, RegistroMaternidade[]>()
  for (const r of registros) {
    const chave = r.parto_vinculo_id ?? r.id
    const lista = grupos.get(chave)
    if (lista) lista.push(r)
    else grupos.set(chave, [r])
  }
  return [...grupos.values()]
}

export function calcularResumoMaternidade(registros: RegistroMaternidade[]): ResumoMaternidade {
  const lista = registros ?? []
  const partos = agruparPartos(lista)
  const vivas = lista.filter((r) => !criaMorta(r))
  const pesos = vivas.map((r) => numeroOuNulo(r.peso_cria_kg)).filter((p): p is number => p !== null && p > 0)
  const partosGemeos = partos.filter((g) => g.length > 1 || g.some((r) => (r.tipo_parto ?? []).includes('Gêmeos'))).length
  const partosInterc = partos.filter((g) => g.some(temIntercorrencia)).length
  const partosMedicados = partos.filter((g) => g.some((r) => tokens(r.tratamento).length > 0 || (r.medicamentos ?? []).length > 0)).length

  const porMes = new Map<string, { partos: number; crias: number }>()
  for (const g of partos) {
    const mes = (g[0].data ?? '').slice(0, 7)
    if (!mes) continue
    const atual = porMes.get(mes) ?? { partos: 0, crias: 0 }
    atual.partos += 1
    atual.crias += g.length
    porMes.set(mes, atual)
  }

  const nomesMedicamento: string[] = []
  for (const r of lista) {
    for (const m of r.medicamentos ?? []) {
      const nome = (m.nomeComercial || m.principioAtivo || '').trim()
      if (nome) nomesMedicamento.push(nome)
    }
  }

  const porMae = new Map<string, RegistroMaternidade[][]>()
  for (const g of partos) {
    const mae = g[0].mae?.trim()
    if (!mae) continue
    const lst = porMae.get(mae)
    if (lst) lst.push(g)
    else porMae.set(mae, [g])
  }
  const matrizes: MatrizResumo[] = [...porMae.entries()]
    .map(([mae, gs]) => {
      const linhas = gs.flat()
      return {
        mae,
        categoria: linhas.find((r) => r.categoria_mae)?.categoria_mae ?? null,
        partos: gs.length,
        crias: linhas.length,
        intercorrencias: gs.filter((g) => g.some(temIntercorrencia)).length,
        medicamentos: linhas.reduce((s, r) => s + (r.medicamentos ?? []).length, 0),
        escore_medio: media(linhas.map((r) => numeroOuNulo(r.escore_matriz)).filter((v): v is number => v !== null)),
      }
    })
    .sort((a, b) => b.intercorrencias - a.intercorrencias || b.partos - a.partos || a.mae.localeCompare(b.mae, 'pt-BR'))
    .slice(0, MAX_MATRIZES)

  const tiposParto = lista.flatMap((r) => (r.tipo_parto ?? []).length ? r.tipo_parto : [null])

  return {
    partos: partos.length,
    crias: lista.length,
    crias_vivas: vivas.length,
    crias_mortas: lista.length - vivas.length,
    partos_gemeos: partosGemeos,
    partos_com_intercorrencia: partosInterc,
    taxa_intercorrencia: partos.length ? partosInterc / partos.length : null,
    taxa_perda: lista.length ? (lista.length - vivas.length) / lista.length : null,
    peso_medio_kg: media(pesos),
    pesadas: pesos.length,
    machos: vivas.filter((r) => r.sexo === 'Macho').length,
    femeas: vivas.filter((r) => r.sexo === 'Fêmea').length,
    escore_medio: media(lista.map((r) => numeroOuNulo(r.escore_matriz)).filter((v): v is number => v !== null)),
    docilidade_media: media(lista.map((r) => numeroOuNulo(r.docilidade_matriz)).filter((v): v is number => v !== null)),
    matrizes_distintas: porMae.size,
    partos_medicados: partosMedicados,
    por_sexo: distribuir(vivas.map((r) => r.sexo)),
    por_raca: distribuir(vivas.map((r) => r.raca), MAX_DISTRIBUICAO),
    por_tipo_parto: distribuir(tiposParto),
    por_categoria_mae: distribuir(partos.map((g) => g[0].categoria_mae)),
    por_pasto: distribuir(partos.map((g) => g[0].pasto), MAX_DISTRIBUICAO),
    por_lote: distribuir(partos.map((g) => g[0].lote), MAX_DISTRIBUICAO),
    por_mes: [...porMes.entries()].map(([mes, v]) => ({ mes, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
    tratamentos: distribuir(lista.flatMap((r) => tokens(r.tratamento)), MAX_DISTRIBUICAO),
    medicamentos: distribuir(nomesMedicamento, MAX_DISTRIBUICAO),
    matrizes,
  }
}

export function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return `${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function formatarDecimal(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return a && m ? `${nomes[Number(m) - 1] ?? m}/${a.slice(2)}` : mes
}
