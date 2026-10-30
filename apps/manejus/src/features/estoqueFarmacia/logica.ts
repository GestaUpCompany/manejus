// Regras puras da tela Estoque → Farmacia (pages/controller/EstoqueFarmacia.tsx).
// O saldo e o custo médio de medicamentos são recalculados pelo trigger do
// banco (recalcular_estoque_farmacia) a cada lançamento em movimentacoes_farmacia:
// entrada soma e refaz o custo médio ponderado, baixa e estorno subtraem, ajuste
// define o saldo absoluto. A tela só valida o formulário e insere o lançamento.

export interface ItemEstoqueFarmacia {
  id: string
  nome_comercial: string
  sku?: string | null
  tipo: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  custo_unitario: number
  custo_total_estoque: number
  controla_estoque: boolean
  conteudo_por_unidade?: number | null
  conteudo_unidade?: string | null
}

export type TipoMovimentoFarmacia = 'entrada' | 'baixa' | 'ajuste' | 'estorno'

export interface MovimentoFarmacia {
  id: string
  medicamento_id: string
  tipo_movimentacao: TipoMovimentoFarmacia
  quantidade: number
  custo_unitario: number | null
  valor_total: number | null
  data: string
  origem: string | null
  fornecedor: string | null
  nota_fiscal: string | null
  lote_produto: string | null
  validade: string | null
  observacao: string | null
  unidade: string | null
  registro_origem_id: string | null
  created_at: string
}

export interface MovimentoComSaldo extends MovimentoFarmacia {
  variacao: number
  saldo_apos: number
}

export const ROTULO_TIPO: Record<TipoMovimentoFarmacia, string> = {
  entrada: 'Entrada',
  baixa: 'Baixa',
  ajuste: 'Ajuste',
  estorno: 'Estorno',
}

export const ROTULO_ORIGEM: Record<string, string> = {
  painel_entrada: 'Entrada manual',
  painel_ajuste: 'Ajuste manual',
  pwa_farmacia: 'Aplicativo',
  enfermaria: 'Enfermaria',
  estoque_inicial: 'Estoque inicial',
}

const num = (v: unknown) => Number(v) || 0

export const UNIDADES_ESTOQUE = ['un', 'dose', 'frasco', 'caixa', 'mL', 'L', 'g', 'kg']
export const UNIDADES_DIRETAS = ['mL', 'L', 'g', 'kg']
export const UNIDADES_CONTEUDO = ['mL', 'mg']

// Plural só para as unidades de contagem; mL, L, g, kg e un ficam iguais.
const PLURAL_UNIDADE: Record<string, string> = { dose: 'doses', frasco: 'frascos', caixa: 'caixas' }

export function unidadeNaQuantidade(unidade: string, quantidade: number): string {
  return Math.abs(quantidade) > 1 ? (PLURAL_UNIDADE[unidade] ?? unidade) : unidade
}

export type ModoBaixaEnfermaria = 'direta' | 'embalagem' | 'sem_conversao'

// Espelha farmacia_dose_para_estoque (banco): mL/L/g/kg convertem direto; as demais precisam do conteúdo da embalagem.
export function modoBaixaEnfermaria(item: Pick<ItemEstoqueFarmacia, 'unidade' | 'conteudo_por_unidade' | 'conteudo_unidade'>): ModoBaixaEnfermaria {
  if (UNIDADES_DIRETAS.includes(item.unidade)) return 'direta'
  return num(item.conteudo_por_unidade) > 0 && item.conteudo_unidade ? 'embalagem' : 'sem_conversao'
}

export function rotuloBaixaEnfermaria(item: Pick<ItemEstoqueFarmacia, 'unidade' | 'conteudo_por_unidade' | 'conteudo_unidade'>): string {
  const modo = modoBaixaEnfermaria(item)
  if (modo === 'direta') return `Automática (em ${item.unidade})`
  if (modo === 'embalagem') return `Automática (${num(item.conteudo_por_unidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${item.conteudo_unidade} por ${item.unidade})`
  return 'Defina o conteúdo da embalagem'
}

// Saldo negativo ou no mínimo/abaixo; só itens com controle de estoque.
export function emAlerta(item: Pick<ItemEstoqueFarmacia, 'controla_estoque' | 'estoque_atual' | 'estoque_minimo'>): boolean {
  if (!item.controla_estoque) return false
  const saldo = num(item.estoque_atual)
  const minimo = num(item.estoque_minimo)
  return saldo < 0 || (minimo > 0 && saldo <= minimo)
}

// Item que recebe ou gasta sem ter custo: o valor em estoque sai R$ 0,00.
export function semCusto(item: Pick<ItemEstoqueFarmacia, 'controla_estoque' | 'estoque_atual' | 'custo_unitario'>): boolean {
  return item.controla_estoque && num(item.custo_unitario) <= 0 && num(item.estoque_atual) > 0
}

// Valor do item: saldo negativo é sinal de saneamento, não ativo negativo.
export function valorDoItem(item: Pick<ItemEstoqueFarmacia, 'estoque_atual' | 'custo_unitario'>): number {
  return Math.max(0, num(item.estoque_atual)) * num(item.custo_unitario)
}

export interface TotaisTela {
  controlados: number
  em_alerta: number
  sem_custo: number
  sem_conversao: number
  valor_total: number
}

export function totaisDaTela(itens: ItemEstoqueFarmacia[]): TotaisTela {
  const controlados = itens.filter((i) => i.controla_estoque)
  return {
    controlados: controlados.length,
    em_alerta: controlados.filter(emAlerta).length,
    sem_custo: controlados.filter(semCusto).length,
    // Controlados que a Enfermaria não consegue converter em baixa (sem conteúdo da embalagem)
    sem_conversao: controlados.filter((i) => modoBaixaEnfermaria(i) === 'sem_conversao').length,
    valor_total: controlados.reduce((s, i) => s + valorDoItem(i), 0),
  }
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Busca por nome_comercial ou SKU (sem acento) e tipo; alertas primeiro, depois ordem alfabética.
export function filtrarEOrdenar(itens: ItemEstoqueFarmacia[], busca: string, tipo: string): ItemEstoqueFarmacia[] {
  const termo = semAcento(busca.trim())
  return itens
    .filter((i) => (!tipo || i.tipo === tipo) && (!termo || semAcento(i.nome_comercial).includes(termo) || semAcento(i.sku ?? '').includes(termo)))
    .sort((a, b) => Number(emAlerta(b)) - Number(emAlerta(a)) || a.nome_comercial.localeCompare(b.nome_comercial, 'pt-BR'))
}

export function sinalMovimento(m: Pick<MovimentoFarmacia, 'tipo_movimentacao' | 'quantidade'>): { sinal: '+' | '−' | '='; qtd: number } {
  const qtd = num(m.quantidade)
  if (m.tipo_movimentacao === 'ajuste') return { sinal: '=', qtd }
  if (m.tipo_movimentacao === 'entrada') return { sinal: '+', qtd }
  return { sinal: '−', qtd }
}

// Replay do ledger em ordem (data, created_at, id), igual ao relatório de Farmacia.
// O trigger do banco recalcula por created_at: lançamento retroativo faz o saldo
// reconstruído divergir do gravado (ver divergenciaDeSaldo).
export function movimentosComSaldo(movimentos: MovimentoFarmacia[]): MovimentoComSaldo[] {
  const ordenados = [...movimentos].sort(
    (a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
  let saldo = 0
  return ordenados.map((m) => {
    const { sinal, qtd } = sinalMovimento(m)
    const variacao = sinal === '=' ? qtd - saldo : sinal === '+' ? qtd : -qtd
    saldo += variacao
    return { ...m, variacao, saldo_apos: saldo }
  })
}

// Diferença entre o saldo reconstruído por data e o saldo gravado no item; nulo quando bate.
export function divergenciaDeSaldo(comSaldo: MovimentoComSaldo[], estoqueAtual: number): number | null {
  const reconstruido = comSaldo.length ? comSaldo[comSaldo.length - 1].saldo_apos : 0
  const diff = Math.round((reconstruido - num(estoqueAtual)) * 1000) / 1000
  return Math.abs(diff) > 0.0005 ? diff : null
}

// Movimento gerado por registro do aplicativo é regerado pelo trigger: não se edita aqui.
export function movimentoEditavel(m: Pick<MovimentoFarmacia, 'registro_origem_id'>): boolean {
  return !m.registro_origem_id
}

// Soma das baixas com data a partir do primeiro dia do mês (YYYY-MM-DD).
export function consumoDoMes(movimentos: Array<Pick<MovimentoFarmacia, 'tipo_movimentacao' | 'data' | 'quantidade' | 'custo_unitario' | 'valor_total'>>, inicioDoMes: string): number {
  return movimentos
    .filter((m) => (m.tipo_movimentacao === 'baixa' || m.tipo_movimentacao === 'estorno') && m.data >= inicioDoMes)
    .reduce((s, m) => {
      const valor = m.valor_total ?? num(m.quantidade) * num(m.custo_unitario)
      return s + (m.tipo_movimentacao === 'estorno' ? -valor : valor)
    }, 0)
}

// Valor do lançamento: o gravado (baixas valorizadas pelo ledger) ou, sem ele, quantidade × custo; nulo sem custo.
export function valorDoMovimento(m: Pick<MovimentoFarmacia, 'quantidade' | 'custo_unitario' | 'valor_total'>): number | null {
  if (m.valor_total != null) return num(m.valor_total)
  if (m.custo_unitario == null) return null
  return num(m.quantidade) * num(m.custo_unitario)
}

// Prazo de alerta de vencimento: 60 dias dá tempo de usar ou devolver o lote antes do vencimento
// (vacinas e antibióticos costumam ter validade de 1 a 2 anos; 30 dias é curto demais para planejar).
export const DIAS_ALERTA_VALIDADE = 60

export interface LoteFarmacia {
  chave: string
  lote: string | null
  validade: string | null
  saldo: number
}

export type SituacaoValidade = 'vencido' | 'vence_em_breve' | 'ok' | 'sem_validade'

export function diasAteVencer(validade: string, hoje: string): number {
  return Math.round((Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000)
}

export function situacaoValidade(validade: string | null, hoje: string): { situacao: SituacaoValidade; dias: number | null } {
  if (!validade) return { situacao: 'sem_validade', dias: null }
  const dias = diasAteVencer(validade, hoje)
  if (dias < 0) return { situacao: 'vencido', dias }
  if (dias <= DIAS_ALERTA_VALIDADE) return { situacao: 'vence_em_breve', dias }
  return { situacao: 'ok', dias }
}

const ordemFefo = (a: LoteFarmacia, b: LoteFarmacia) =>
  (a.validade ?? '9999-12-31').localeCompare(b.validade ?? '9999-12-31') || a.chave.localeCompare(b.chave)

// Saldo por lote a partir do ledger. Baixa não guarda lote, então a saída é atribuída
// pelo vencimento mais próximo primeiro (FEFO), que é o critério que a farmácia segue na prática.
// Estorno devolve ao lote de vencimento mais próximo ainda conhecido; ajuste que aumenta o saldo
// entra sem lote. Os lotes vencidos e os com saldo zerado ficam de fora.
export function lotesComSaldo(movimentos: MovimentoFarmacia[]): LoteFarmacia[] {
  const ordenados = [...movimentos].sort(
    (a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
  const lotes = new Map<string, LoteFarmacia>()
  const adicionar = (lote: string | null, validade: string | null, qtd: number) => {
    const chave = `${lote ?? ''}|${validade ?? ''}`
    const atual = lotes.get(chave) ?? { chave, lote, validade, saldo: 0 }
    atual.saldo += qtd
    lotes.set(chave, atual)
  }
  const consumir = (qtd: number) => {
    let resto = qtd
    for (const l of [...lotes.values()].filter((x) => x.saldo > 0).sort(ordemFefo)) {
      const usa = Math.min(l.saldo, resto)
      l.saldo -= usa
      resto -= usa
      if (resto <= 0) break
    }
  }
  for (const m of ordenados) {
    const qtd = num(m.quantidade)
    if (m.tipo_movimentacao === 'entrada') adicionar(m.lote_produto, m.validade, qtd)
    else if (m.tipo_movimentacao === 'baixa') consumir(qtd)
    else if (m.tipo_movimentacao === 'estorno') {
      const primeiro = [...lotes.values()].sort(ordemFefo)[0]
      if (primeiro) primeiro.saldo += qtd
      else adicionar(null, null, qtd)
    } else {
      const total = [...lotes.values()].reduce((s, l) => s + l.saldo, 0)
      const diff = qtd - total
      if (diff < 0) consumir(-diff)
      else if (diff > 0) adicionar(null, null, diff)
    }
  }
  return [...lotes.values()].filter((l) => l.saldo > 0.0005).sort(ordemFefo)
}

export interface FormEntrada {
  itemId: string
  quantidade: string
  custo: string
  fornecedor: string
  notaFiscal: string
  lote: string
  validade: string
  observacao: string
  data: string
}

export interface FormAjuste {
  itemId: string
  saldo: string
  observacao: string
  data: string
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function numeroValido(texto: string): number | null {
  if (texto.trim() === '') return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type ResultadoValidacao<T> = { ok: true; valores: T } | { ok: false; erro: string }

export function validarEntrada(form: FormEntrada): ResultadoValidacao<{ quantidade: number; custo: number }> {
  if (!form.itemId) return { ok: false, erro: 'Selecione o medicamento.' }
  const quantidade = numeroValido(form.quantidade)
  if (quantidade == null || quantidade <= 0) return { ok: false, erro: 'Informe uma quantidade maior que zero.' }
  const custo = numeroValido(form.custo)
  if (custo == null || custo <= 0) return { ok: false, erro: 'Informe o custo unitário (maior que zero).' }
  if (!DATA_ISO.test(form.data)) return { ok: false, erro: 'Informe a data da entrada.' }
  return { ok: true, valores: { quantidade, custo } }
}

// Conteúdo por embalagem é opcional: vazio significa "sem baixa automática da Enfermaria".
export function validarConteudo(conteudo: string): ResultadoValidacao<{ conteudo: number | null }> {
  if (conteudo.trim() === '') return { ok: true, valores: { conteudo: null } }
  const n = numeroValido(conteudo)
  if (n == null || n <= 0) return { ok: false, erro: 'Informe o conteúdo da embalagem maior que zero (ou deixe vazio).' }
  return { ok: true, valores: { conteudo: n } }
}

// Ao ativar o controle, unidades que não são mL/L/g/kg precisam do conteúdo da embalagem para a Enfermaria baixar.
export function validarConteudoObrigatorio(
  unidade: string,
  conteudo: string,
  conteudoUn: string,
): ResultadoValidacao<{ conteudo: number | null }> {
  if (UNIDADES_DIRETAS.includes(unidade)) return validarConteudo(conteudo)
  if (conteudo.trim() === '') return { ok: false, erro: `Informe o conteúdo por ${unidade} (ex.: 500 mL por frasco) para a Enfermaria dar baixa automática.` }
  const n = numeroValido(conteudo)
  if (n == null || n <= 0) return { ok: false, erro: 'Informe o conteúdo da embalagem maior que zero.' }
  if (!UNIDADES_CONTEUDO.includes(conteudoUn)) return { ok: false, erro: 'Escolha mL ou mg para o conteúdo da embalagem.' }
  return { ok: true, valores: { conteudo: n } }
}

export function validarAjuste(form: FormAjuste): ResultadoValidacao<{ saldo: number }> {
  if (!form.itemId) return { ok: false, erro: 'Selecione o medicamento.' }
  const saldo = numeroValido(form.saldo)
  if (saldo == null || saldo < 0) return { ok: false, erro: 'Informe o novo saldo (zero ou maior).' }
  if (!form.observacao.trim()) return { ok: false, erro: 'Informe o motivo do ajuste.' }
  if (!DATA_ISO.test(form.data)) return { ok: false, erro: 'Informe a data do ajuste.' }
  return { ok: true, valores: { saldo } }
}
