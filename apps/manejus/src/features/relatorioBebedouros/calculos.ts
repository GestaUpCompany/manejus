// Cálculos puros do relatório de Bebedouros, compartilhados entre a página
// pública (RelatorioBebedourosPublico) e o Infográfico Mensal (loaders.ts).
// Datas são tratadas como "date-only" (dia de calendário local), sem fuso.

export interface BebedouroBase {
  id: string
  nome: string
  meta_intervalo_limpeza: number | null
}

export interface LimpezaBase {
  bebedouro_id: string
  data_limpeza: string
  responsavel: string | null
  observacao?: string | null
}

export type StatusCodigo = 'em_dia' | 'atrasado' | 'critico' | 'sem_registro' | 'sem_meta'

export interface StatusLimpezaInfo {
  codigo: StatusCodigo
  label: string
  cor: string
  // Símbolo textual para leitura em preto e branco (impressão).
  simbolo: string
}

export interface ItemCronograma {
  id: string
  nome: string
  meta: number | null
  ultimaLimpeza: string | null
  proximaLimpeza: string | null
  // Dias desde a última limpeza até a data de referência.
  dias: number | null
  // proxima - referência: negativo = vencida há X dias.
  diasParaProxima: number | null
  responsavelUltima: string | null
  observacaoUltima: string | null
  limpezasNoPeriodo: number
  status: StatusLimpezaInfo
}

export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'agua_suficiente', label: 'Água insuficiente' },
  { key: 'vazao_bebedouro_ideal', label: 'Vazão não ideal' },
  { key: 'espacamento_bebedouro_ideal', label: 'Espaçamento não ideal' },
  { key: 'boia_protecao_boas_condicoes', label: 'Bóia/proteção em más condições' },
  { key: 'aterro_acesso_bebedouro_ideal', label: 'Aterro/acesso não ideal' },
]

const MS_DIA = 86_400_000

export function paraDia(valor: string): Date {
  const d = new Date(`${valor.split('T')[0]}T00:00:00`)
  d.setHours(0, 0, 0, 0)
  return d
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((paraDia(fim).getTime() - paraDia(inicio).getTime()) / MS_DIA)
}

export function somarDias(valor: string, dias: number): string {
  const d = paraDia(valor)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function statusLimpeza(dias: number | null, meta: number | null): StatusLimpezaInfo {
  if (dias === null) return { codigo: 'sem_registro', label: 'Sem registro', cor: '#6B7280', simbolo: '○' }
  if (!meta || meta <= 0) return { codigo: 'sem_meta', label: 'Sem meta', cor: '#6B7280', simbolo: '–' }
  if (dias <= meta) return { codigo: 'em_dia', label: 'Em dia', cor: '#22C55E', simbolo: '●' }
  if (dias <= Math.ceil(meta * 1.3)) return { codigo: 'atrasado', label: 'Atrasado', cor: '#F59E0B', simbolo: '▲' }
  return { codigo: 'critico', label: 'Atraso crítico', cor: '#EF4444', simbolo: '■' }
}

export function textoPrazo(diasParaProxima: number | null): string {
  if (diasParaProxima === null) return '—'
  if (diasParaProxima === 0) return 'hoje'
  if (diasParaProxima > 0) return `em ${diasParaProxima} ${diasParaProxima === 1 ? 'dia' : 'dias'}`
  const atraso = Math.abs(diasParaProxima)
  return `vencida há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`
}

function ordemCronograma(a: ItemCronograma, b: ItemCronograma): number {
  const grupo = (i: ItemCronograma) => {
    if (i.diasParaProxima !== null && i.diasParaProxima < 0) return 0
    if (i.diasParaProxima !== null) return 1
    if (i.ultimaLimpeza) return 2 // sem meta
    return 3 // sem registro
  }
  const ga = grupo(a)
  const gb = grupo(b)
  if (ga !== gb) return ga - gb
  if (a.diasParaProxima !== null && b.diasParaProxima !== null && a.diasParaProxima !== b.diasParaProxima) {
    return a.diasParaProxima - b.diasParaProxima
  }
  return a.nome.localeCompare(b.nome)
}

export function calcularCronograma(
  bebedouros: BebedouroBase[],
  limpezas: LimpezaBase[],
  dataReferencia: string,
  dataInicio: string,
  dataFim: string,
): ItemCronograma[] {
  return bebedouros
    .map((b) => {
      const historico = limpezas
        .filter((l) => l.bebedouro_id === b.id)
        .sort((x, y) => paraDia(y.data_limpeza).getTime() - paraDia(x.data_limpeza).getTime())
      const ultima = historico[0] ?? null
      const dias = ultima ? Math.max(diasEntre(ultima.data_limpeza, dataReferencia), 0) : null
      const meta = b.meta_intervalo_limpeza && b.meta_intervalo_limpeza > 0 ? b.meta_intervalo_limpeza : null
      const proxima = ultima && meta ? somarDias(ultima.data_limpeza, meta) : null
      const diasParaProxima = proxima ? diasEntre(dataReferencia, proxima) : null
      const limpezasNoPeriodo = historico.filter((l) => {
        const dia = l.data_limpeza.split('T')[0]
        return dia >= dataInicio && dia <= dataFim
      }).length
      return {
        id: b.id,
        nome: b.nome,
        meta,
        ultimaLimpeza: ultima?.data_limpeza ?? null,
        proximaLimpeza: proxima,
        dias,
        diasParaProxima,
        responsavelUltima: ultima?.responsavel ?? null,
        observacaoUltima: ultima?.observacao ?? null,
        limpezasNoPeriodo,
        status: statusLimpeza(dias, meta),
      }
    })
    .sort(ordemCronograma)
}

export function calcularKPIsCronograma(itens: ItemCronograma[]) {
  const total = itens.length
  const conta = (codigo: StatusCodigo) => itens.filter((i) => i.status.codigo === codigo).length
  const emDia = conta('em_dia')
  return {
    total,
    emDia,
    atrasado: conta('atrasado'),
    critico: conta('critico'),
    semRegistro: conta('sem_registro'),
    semMeta: conta('sem_meta'),
    pctEmDia: total > 0 ? Math.round((emDia / total) * 100) : 0,
  }
}

export function calcularMaisAtrasado(itens: ItemCronograma[]) {
  const candidatos = itens.filter((i) => i.dias !== null && i.meta !== null && i.status.codigo !== 'em_dia')
  if (candidatos.length === 0) return null
  const pior = candidatos.reduce((max, i) => (i.dias! > max.dias! ? i : max))
  return { nome: pior.nome, dias: pior.dias!, meta: pior.meta! }
}

// Bebedouros cuja próxima limpeza cai entre hoje (referência) e `janela` dias.
export function proximasNaJanela(itens: ItemCronograma[], janela = 7) {
  return itens
    .filter((i) => i.diasParaProxima !== null && i.diasParaProxima >= 0 && i.diasParaProxima <= janela)
    .map((i) => ({ nome: i.nome, proximaLimpeza: i.proximaLimpeza!, diasParaProxima: i.diasParaProxima! }))
}

export interface LimpezaDoDiaItem {
  id: string
  nome: string
  dataLimpeza: string
  responsavel: string | null
  observacao: string | null
  intervalo: number | null
  meta: number | null
  statusLabel: string
  statusCor: string
  simbolo: string
  dataLimpezaAnterior: string | null
  proximaPrevista: string | null
}

export function calcularLimpezasDoDia(
  bebedouros: BebedouroBase[],
  limpezas: LimpezaBase[],
  dia: string,
): LimpezaDoDiaItem[] {
  return bebedouros
    .flatMap((b) => {
      const historico = limpezas
        .filter((l) => l.bebedouro_id === b.id)
        .sort((x, y) => paraDia(y.data_limpeza).getTime() - paraDia(x.data_limpeza).getTime())
      const atual = historico.find((l) => l.data_limpeza.split('T')[0] === dia)
      if (!atual) return []
      const anterior = historico[historico.indexOf(atual) + 1] ?? null
      const intervalo = anterior ? Math.max(diasEntre(anterior.data_limpeza, atual.data_limpeza), 0) : null
      const meta = b.meta_intervalo_limpeza && b.meta_intervalo_limpeza > 0 ? b.meta_intervalo_limpeza : null
      let status: { label: string; cor: string; simbolo: string }
      if (!meta) status = { label: intervalo === null ? 'Primeira limpeza' : 'Sem meta', cor: '#6B7280', simbolo: '–' }
      else if (intervalo === null) status = { label: 'Primeira limpeza', cor: '#6B7280', simbolo: '○' }
      else if (intervalo <= meta) status = { label: 'Dentro da meta', cor: '#22C55E', simbolo: '●' }
      else if (intervalo <= Math.ceil(meta * 1.3)) status = { label: 'Acima da meta', cor: '#F59E0B', simbolo: '▲' }
      else status = { label: 'Muito acima da meta', cor: '#EF4444', simbolo: '■' }
      return [{
        id: b.id,
        nome: b.nome,
        dataLimpeza: atual.data_limpeza,
        responsavel: atual.responsavel,
        observacao: atual.observacao ?? null,
        intervalo,
        meta,
        statusLabel: status.label,
        statusCor: status.cor,
        simbolo: status.simbolo,
        dataLimpezaAnterior: anterior?.data_limpeza ?? null,
        proximaPrevista: meta ? somarDias(atual.data_limpeza, meta) : null,
      }]
    })
    .sort((a, b) => (b.intervalo ?? 0) - (a.intervalo ?? 0))
}

export interface RegistroChecklistBase {
  id?: string
  data: string
  numero_bebedouro: string | null
  responsavel: string | null
  observacao: string | null
  checklist: Record<string, { valor: boolean; observacao: string }> | null
}

export interface OcorrenciaCalculada {
  data: string
  bebedouro: string
  responsavel: string
  itens: { label: string; obs: string }[]
  obsGeral: string
}

export function calcularChecklist(registros: RegistroChecklistBase[]) {
  const comChecklist = registros.filter((r) => r.checklist && Object.keys(r.checklist).length > 0)
  const ocorrencias: OcorrenciaCalculada[] = comChecklist
    .map((r) => ({
      data: r.data,
      bebedouro: r.numero_bebedouro || 'Sem identificação',
      responsavel: r.responsavel || '',
      itens: CHECKLIST_ITEMS
        .filter((item) => r.checklist?.[item.key]?.valor === false)
        .map((item) => ({ label: item.label, obs: r.checklist?.[item.key]?.observacao || '' })),
      obsGeral: r.observacao || '',
    }))
    .filter((o) => o.itens.length > 0)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const total = comChecklist.length
  const ranking = CHECKLIST_ITEMS.map((item) => {
    const negativos = comChecklist.filter((r) => r.checklist?.[item.key]?.valor === false).length
    return {
      key: item.key,
      label: item.label,
      negativos,
      total,
      pctNegativo: total > 0 ? Math.round((negativos / total) * 100) : 0,
    }
  }).sort((a, b) => b.pctNegativo - a.pctNegativo)

  const porBebedouro = new Map<string, number>()
  ocorrencias.forEach((o) => porBebedouro.set(o.bebedouro, (porBebedouro.get(o.bebedouro) ?? 0) + 1))
  const ocorrenciasPorBebedouro = [...porBebedouro.entries()]
    .map(([bebedouro, quantidade]) => ({ bebedouro, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.bebedouro.localeCompare(b.bebedouro))

  return {
    kpis: {
      totalRegistros: registros.length,
      comChecklist: total,
      negativos: ocorrencias.length,
      pctNegativos: total > 0 ? Math.round((ocorrencias.length / total) * 100) : 0,
      itemMaisProblematico: ranking[0]?.pctNegativo > 0 ? ranking[0] : null,
    },
    ranking,
    ocorrencias,
    ocorrenciasPorBebedouro,
  }
}
