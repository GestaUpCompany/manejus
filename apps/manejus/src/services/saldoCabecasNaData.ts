// Saldo de cabeças de um lote em uma data passada, reconstituído a partir do
// quant_atual gravado desfazendo os eventos posteriores. Espelha a
// classificação de public.calculate_quant_atual (entrada, saída, transferência,
// entrevero, morte); se a regra do SQL mudar, ajustar aqui também.

export interface MovimentacaoSaldo {
  data: string
  lote_origem_id: string | null
  lote_destino_id: string | null
  categoria: string | null
  numero_cabecas: number | null
  motivo_movimentacao: string | null
  tipo_saida: string | null
  tipo_entrada: string | null
  subtipo: string | null
}

export interface MorteSaldo {
  data: string
  lote_id: string | null
  categoria: string | null
}

export interface CategoriaSaldo {
  lote_id: string
  categoria: string | null
  quant_atual: number | string | null
  peso_vivo_atual_kg_cab?: number | string | null
  ativo?: boolean | null
  created_at?: string | null
  data_fim?: string | null
}

const SAIDAS_SIMPLES = ['Consumo', 'Saída', 'Doação']
const TRANSFERENCIAS = ['Transferência', 'Apartação']

function chave(categoria: string | null): string {
  return (categoria || '').toLowerCase()
}

// Efeito líquido (positivo = aumenta o saldo) de uma movimentação sobre o lote.
export function efeitoMovimentacao(m: MovimentacaoSaldo, loteId: string): number {
  const n = Number(m.numero_cabecas) || 0
  const motivo = m.motivo_movimentacao
  let efeito = 0
  if (m.lote_origem_id === loteId) {
    if (motivo === 'Entrada') efeito += n
    const saidaSimples =
      (SAIDAS_SIMPLES.includes(motivo || '') || (motivo === 'Entrevero' && !m.lote_destino_id)) && !m.tipo_saida
    const saidaTransf =
      TRANSFERENCIAS.includes(m.tipo_saida || '') || (motivo === 'Entrevero' && !!m.lote_destino_id)
    if (saidaSimples || saidaTransf) efeito -= n
  }
  if (m.lote_destino_id === loteId) {
    const entradaTransf =
      TRANSFERENCIAS.includes(m.tipo_entrada || '') ||
      motivo === 'Entrevero' ||
      (!m.tipo_entrada && !!m.lote_destino_id)
    if (entradaTransf && m.subtipo !== 'Novo Lote') efeito += n
  }
  return efeito
}

// A categoria existia (vigente) no instante? Categoria encerrada por
// recategorização (data_fim) ainda vale antes do encerramento; a criada depois
// do instante ainda não existia. Sem datas (dados antigos), vale a flag ativo.
function categoriaVigenteEm(item: CategoriaSaldo, instante: number): boolean {
  if (item.created_at && Date.parse(item.created_at) > instante) return false
  if (item.data_fim) return Date.parse(item.data_fim) > instante
  return item.ativo !== false
}

// Saldo da categoria no instante: desfaz tudo que ocorreu nele ou depois.
function saldoCategoriaEm(
  loteId: string,
  item: CategoriaSaldo,
  instante: string,
  movimentacoes: MovimentacaoSaldo[],
  mortes: MorteSaldo[]
): number {
  const alvo = Date.parse(instante)
  if (!categoriaVigenteEm(item, alvo)) return 0
  const cat = chave(item.categoria)
  let saldo = Number(item.quant_atual) || 0
  for (const m of movimentacoes) {
    if (chave(m.categoria) !== cat || Date.parse(m.data) < alvo) continue
    saldo -= efeitoMovimentacao(m, loteId)
  }
  for (const morte of mortes) {
    if (morte.lote_id !== loteId || chave(morte.categoria) !== cat || Date.parse(morte.data) < alvo) continue
    saldo += 1
  }
  return Math.max(0, saldo)
}

// Cabeças que estiveram no lote em algum momento do dia: o maior entre o total
// no início e no fim do dia (quem saiu à tarde ainda foi tratado de manhã; quem
// entrou à tarde também conta). Os totais são por instante, somando só as
// categorias vigentes nele, para não contar duas vezes o gado que mudou de
// categoria na recategorização. Para hoje, sem eventos, equivale ao quant_atual.
export function cabecasNoDia(params: {
  loteId: string
  categorias: CategoriaSaldo[]
  movimentacoes: MovimentacaoSaldo[]
  mortes: MorteSaldo[]
  inicioDia: string
  fimDia: string
}): { quantidade: number; pesoTotal: number; categorias: string[] } {
  const { loteId, categorias, movimentacoes, mortes, inicioDia, fimDia } = params
  const doLote = categorias.filter((item) => item.lote_id === loteId)
  const totalEm = (instante: string) => {
    let quantidade = 0
    let pesoTotal = 0
    const nomes: string[] = []
    for (const item of doLote) {
      const q = saldoCategoriaEm(loteId, item, instante, movimentacoes, mortes)
      quantidade += q
      pesoTotal += q * (Number(item.peso_vivo_atual_kg_cab) || 0)
      if (q > 0 && item.categoria) nomes.push(item.categoria)
    }
    return { quantidade, pesoTotal, nomes }
  }
  const inicio = totalEm(inicioDia)
  const fim = totalEm(fimDia)
  const maior = fim.quantidade > inicio.quantidade ? fim : inicio
  const nomes = [...new Set([...inicio.nomes, ...fim.nomes])]
  return { quantidade: maior.quantidade, pesoTotal: maior.pesoTotal, categorias: nomes }
}
