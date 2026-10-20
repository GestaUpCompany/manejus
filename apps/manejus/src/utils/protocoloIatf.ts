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
