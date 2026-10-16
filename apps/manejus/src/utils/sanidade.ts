// Sanidade do animal: aplicações, carência e próxima dose. Regras puras, sem acesso a dados.

export const TIPOS_APLICACAO = ['Vacinação', 'Vermifugação', 'Tratamento', 'Preventivo', 'Outro'] as const
export type TipoAplicacao = (typeof TIPOS_APLICACAO)[number]

export interface FormAplicacao {
  data: string
  tipo: TipoAplicacao
  /** '' = produto fora do catálogo (nome digitado) */
  medicamentoId: string
  medicamentoNome: string
  principioAtivo: string
  dose: string
  via: string
  loteProduto: string
  validadeProduto: string
  /** em dias, texto do campo; '' = sem carência */
  carenciaDias: string
  intervaloDias: string
  diagnostico: string
  observacao: string
}

export interface MedicamentoCatalogo {
  id: string
  nome_comercial: string
  principio_ativo: string
  dose_recomendada: string | null
  carencia_abate_dias: number | null
  intervalo_reaplicacao_dias: number | null
}

export interface LinhaHistoricoSanitario {
  origem: 'aplicacao' | 'enfermaria' | 'maternidade'
  data: string
  liberacao_abate_em: string | null
  proxima_aplicacao_em: string | null
  medicamento_nome: string
}

export function formVazioAplicacao(hoje: string): FormAplicacao {
  return {
    data: hoje,
    tipo: 'Vacinação',
    medicamentoId: '',
    medicamentoNome: '',
    principioAtivo: '',
    dose: '',
    via: '',
    loteProduto: '',
    validadeProduto: '',
    carenciaDias: '',
    intervaloDias: '',
    diagnostico: '',
    observacao: '',
  }
}

/** Escolher um produto do catálogo preenche nome, princípio, dose, carência e intervalo (editáveis depois). */
export function aplicarMedicamentoNoForm(form: FormAplicacao, med: MedicamentoCatalogo | null): FormAplicacao {
  if (!med) return { ...form, medicamentoId: '' }
  return {
    ...form,
    medicamentoId: med.id,
    medicamentoNome: med.nome_comercial,
    principioAtivo: med.principio_ativo,
    dose: form.dose.trim() !== '' ? form.dose : (med.dose_recomendada ?? ''),
    carenciaDias: med.carencia_abate_dias != null ? String(med.carencia_abate_dias) : '',
    intervaloDias: med.intervalo_reaplicacao_dias != null ? String(med.intervalo_reaplicacao_dias) : '',
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function inteiro(texto: string): number | null {
  if (texto.trim() === '') return null
  const n = Number(texto)
  return Number.isInteger(n) ? n : NaN
}

export function validarAplicacao(form: FormAplicacao, hoje: string): string[] {
  const erros: string[] = []
  if (!ISO.test(form.data)) erros.push('Informe a data da aplicação')
  else if (form.data > hoje) erros.push('A data da aplicação não pode ser futura')
  if (form.medicamentoNome.trim() === '') erros.push('Informe o produto aplicado')
  const carencia = inteiro(form.carenciaDias)
  if (carencia !== null && (Number.isNaN(carencia) || carencia < 0)) erros.push('Carência: número inteiro de dias, 0 ou mais')
  const intervalo = inteiro(form.intervaloDias)
  if (intervalo !== null && (Number.isNaN(intervalo) || intervalo < 1)) erros.push('Intervalo: número inteiro de dias, 1 ou mais')
  if (form.validadeProduto !== '') {
    if (!ISO.test(form.validadeProduto)) erros.push('Validade do produto inválida')
    else if (ISO.test(form.data) && form.validadeProduto < form.data) erros.push('O produto estava vencido na data da aplicação')
  }
  return erros
}

const vazioParaNulo = (t: string) => (t.trim() === '' ? null : t.trim())

/** Linha para `aplicacoes_sanitarias` (aplicação em um animal). Datas derivadas ficam por conta do gatilho. */
export function montarAplicacaoParaGravar(form: FormAplicacao, fazendaId: string, individuoId: string) {
  return {
    fazenda_id: fazendaId,
    individuo_id: individuoId,
    data: form.data,
    tipo: form.tipo,
    medicamento_id: form.medicamentoId === '' ? null : form.medicamentoId,
    medicamento_nome: form.medicamentoNome.trim(),
    principio_ativo: vazioParaNulo(form.principioAtivo),
    dose_aplicada: vazioParaNulo(form.dose),
    via_aplicacao: vazioParaNulo(form.via),
    lote_produto: vazioParaNulo(form.loteProduto),
    validade_produto: form.validadeProduto === '' ? null : form.validadeProduto,
    carencia_abate_dias: inteiro(form.carenciaDias),
    intervalo_reaplicacao_dias: inteiro(form.intervaloDias),
    diagnostico: vazioParaNulo(form.diagnostico),
    observacao: vazioParaNulo(form.observacao),
    origem: 'painel' as const,
  }
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000)
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

export interface CarenciaAtiva {
  liberadoEm: string
  diasRestantes: number
  medicamento: string
}

/** Maior data de liberação ainda no futuro (hoje conta como liberado). */
export function carenciaAtiva(linhas: LinhaHistoricoSanitario[], hoje: string): CarenciaAtiva | null {
  let melhor: LinhaHistoricoSanitario | null = null
  for (const l of linhas) {
    if (!l.liberacao_abate_em || l.liberacao_abate_em <= hoje) continue
    if (!melhor || l.liberacao_abate_em > (melhor.liberacao_abate_em as string)) melhor = l
  }
  if (!melhor) return null
  const liberadoEm = melhor.liberacao_abate_em as string
  return { liberadoEm, diasRestantes: diasEntre(hoje, liberadoEm), medicamento: melhor.medicamento_nome }
}

export interface DoseAVencer {
  data: string
  atrasada: boolean
  medicamento: string
  dias: number
}

/** Próximas doses (vencidas ou nos próximos `janelaDias`), uma por produto: vale a aplicação mais recente do produto. */
export function dosesAVencer(linhas: LinhaHistoricoSanitario[], hoje: string, janelaDias = 30): DoseAVencer[] {
  const maisRecente = new Map<string, LinhaHistoricoSanitario>()
  for (const l of linhas) {
    if (!l.proxima_aplicacao_em) continue
    const chave = l.medicamento_nome.trim().toLowerCase()
    const atual = maisRecente.get(chave)
    if (!atual || l.data > atual.data) maisRecente.set(chave, l)
  }
  const saida: DoseAVencer[] = []
  for (const l of maisRecente.values()) {
    const dias = diasEntre(hoje, l.proxima_aplicacao_em as string)
    if (dias <= janelaDias) saida.push({ data: l.proxima_aplicacao_em as string, atrasada: dias < 0, medicamento: l.medicamento_nome, dias })
  }
  return saida.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
}

export function textoCarencia(c: CarenciaAtiva): string {
  const dias = c.diasRestantes === 1 ? '1 dia' : `${c.diasRestantes} dias`
  return `Em carência até ${dataBr(c.liberadoEm)} (faltam ${dias}) por ${c.medicamento}. Não destinar a abate ou venda para corte.`
}

// ---------- Aplicação em lote ----------

export interface FormAplicacaoLote extends FormAplicacao {
  loteId: string
  /** '' = todas as categorias do lote */
  categoria: string
  /** texto do campo: quantas cabeças receberam */
  numeroCabecas: string
}

export function formVazioAplicacaoLote(hoje: string): FormAplicacaoLote {
  return { ...formVazioAplicacao(hoje), loteId: '', categoria: '', numeroCabecas: '' }
}

export function validarAplicacaoLote(form: FormAplicacaoLote, hoje: string): string[] {
  const erros = validarAplicacao(form, hoje)
  if (form.loteId === '') erros.push('Escolha o lote')
  const n = inteiro(form.numeroCabecas)
  if (n === null || Number.isNaN(n) || n < 1) erros.push('Informe quantas cabeças receberam (inteiro, 1 ou mais)')
  return erros
}

/** Linha para `aplicacoes_sanitarias` com alvo no lote (sem animal): a contagem do lote não é alterada. */
export function montarAplicacaoLoteParaGravar(form: FormAplicacaoLote, fazendaId: string) {
  const { individuo_id: _semAnimal, ...base } = montarAplicacaoParaGravar(form, fazendaId, '')
  void _semAnimal
  return {
    ...base,
    lote_id: form.loteId,
    categoria: vazioParaNulo(form.categoria),
    numero_cabecas: inteiro(form.numeroCabecas),
  }
}

export function textoDose(d: DoseAVencer): string {
  if (d.atrasada) return `${d.medicamento}: dose atrasada desde ${dataBr(d.data)}`
  return d.dias === 0 ? `${d.medicamento}: dose prevista para hoje` : `${d.medicamento}: próxima dose em ${dataBr(d.data)}`
}
