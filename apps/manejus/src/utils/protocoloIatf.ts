/**
 * Regras puras do protocolo de IATF (painel): datas das tarefas, situação de cada uma e validações dos formulários.
 * As datas são AAAA-MM-DD (data na fazenda, sem fuso); comparar como texto é seguro.
 */

export type TipoPassoIatf = 'Aplicacao' | 'Retirada' | 'Inseminacao' | 'Outro'

export const TIPOS_PASSO_IATF: { value: TipoPassoIatf; label: string }[] = [
  { value: 'Aplicacao', label: 'Aplicação' },
  { value: 'Retirada', label: 'Retirada' },
  { value: 'Inseminacao', label: 'Inseminação (IA)' },
  { value: 'Outro', label: 'Outro' },
]

export const rotuloTipoPasso = (tipo: string): string => TIPOS_PASSO_IATF.find((t) => t.value === tipo)?.label ?? tipo

export const rotuloDia = (dia: number): string => `D${dia}`

/** Soma dias a uma data AAAA-MM-DD (UTC, sem efeito de fuso ou horário de verão). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}

export type SituacaoTarefa = 'feita' | 'atrasada' | 'hoje' | 'futura'

export function situacaoTarefa(tarefa: { data_prevista: string; feita_em: string | null }, hoje: string): SituacaoTarefa {
  if (tarefa.feita_em) return 'feita'
  if (tarefa.data_prevista < hoje) return 'atrasada'
  if (tarefa.data_prevista === hoje) return 'hoje'
  return 'futura'
}

export const CLASSE_SITUACAO_TAREFA: Record<SituacaoTarefa, string> = {
  feita: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  atrasada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  hoje: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  futura: 'bg-surface-2 text-content-muted',
}

export const ROTULO_SITUACAO_TAREFA: Record<SituacaoTarefa, string> = {
  feita: 'Feita',
  atrasada: 'Atrasada',
  hoje: 'Hoje',
  futura: 'Prevista',
}

export interface FormPassoIatf {
  dia: string
  rotulo: string
  tipo: TipoPassoIatf
  medicamentoNome: string
  dose: string
}

export interface FormProtocoloIatf {
  nome: string
  descricao: string
  passos: FormPassoIatf[]
}

export function validarProtocolo(form: FormProtocoloIatf): string[] {
  const erros: string[] = []
  if (form.nome.trim() === '') erros.push('Informe o nome do protocolo.')
  if (form.passos.length === 0) erros.push('Inclua ao menos um passo.')
  form.passos.forEach((p, i) => {
    const n = i + 1
    const dia = Number(p.dia)
    if (p.dia.trim() === '' || !Number.isInteger(dia) || dia < 0 || dia > 30) erros.push(`Passo ${n}: o dia deve ser um inteiro de 0 a 30.`)
    if (p.rotulo.trim() === '') erros.push(`Passo ${n}: informe a descrição.`)
  })
  const ias = form.passos.filter((p) => p.tipo === 'Inseminacao').length
  if (ias !== 1) erros.push('O protocolo precisa ter exatamente um passo de Inseminação (IA).')
  return erros
}

/** Fêmeas ativas em lotes de protocolo em andamento: individuo_id -> nome do lote (uma fêmea só pode estar em um por vez). */
export function femeasEmOutroLoteIatf(
  lotes: { nome: string; status: string; femeas: { individuo_id: string; status: string }[] }[]
): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const l of lotes) {
    if (l.status !== 'Em andamento') continue
    for (const f of l.femeas) if (f.status === 'Ativa' && !mapa.has(f.individuo_id)) mapa.set(f.individuo_id, l.nome)
  }
  return mapa
}

/** Passos de dia anterior ao informado que ainda não foram feitos (aviso ao registrar a IA com o protocolo atrasado). */
export function passosAnterioresPendentes<T extends { dia: number; feita_em: string | null; rotulo: string }>(tarefas: T[], dia: number): T[] {
  return tarefas.filter((t) => !t.feita_em && t.dia < dia).sort((a, b) => a.dia - b.dia)
}

/**
 * Avisos para quem monta um lote de protocolo: fêmea Prenha (diagnóstico positivo vigente) ou Coberta sem diagnóstico
 * (já foi coberta/inseminada e aguarda resultado). Devolve uma frase por grupo, vazio se não há nada a conferir.
 */
export function avisosReprodutivosIatf(femeas: { rotulo: string; status: string }[]): string[] {
  const lista = (status: string) => femeas.filter((f) => f.status === status).map((f) => f.rotulo)
  const avisos: string[] = []
  const prenhas = lista('Prenha')
  const cobertas = lista('Coberta')
  if (prenhas.length > 0) avisos.push(`Prenha (diagnóstico positivo): ${prenhas.join(', ')}.`)
  if (cobertas.length > 0) avisos.push(`Coberta/inseminada sem diagnóstico: ${cobertas.join(', ')}.`)
  return avisos
}

/** Fêmeas que já têm Inseminação ativa registrada no lote de protocolo (evento não excluído). */
export function individuosComIa(eventos: { individuo_id: string; tipo: string; deleted_at: string | null }[]): Set<string> {
  return new Set(eventos.filter((e) => e.tipo === 'Inseminação' && e.deleted_at == null).map((e) => e.individuo_id))
}

export interface FormLoteIatf {
  protocoloId: string
  nome: string
  dataD0: string
  individuos: string[]
}

export function validarNovoLote(form: FormLoteIatf): string[] {
  const erros: string[] = []
  if (form.protocoloId === '') erros.push('Escolha o protocolo.')
  if (form.nome.trim() === '') erros.push('Informe o nome do lote.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dataD0)) erros.push('Informe o D0.')
  if (form.individuos.length === 0) erros.push('Selecione ao menos uma fêmea.')
  return erros
}
