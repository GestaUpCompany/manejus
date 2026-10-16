/**
 * Reprodução dos indivíduos (painel): eventos lançados na ficha da fêmea e leitura do status derivado pela view
 * `v_status_reprodutivo`. Regras espelham as constraints e o gatilho do banco para dar o erro antes de gravar.
 */
export type TipoEventoReprodutivo = 'Cobertura' | 'Inseminação' | 'Diagnóstico de gestação' | 'Aborto'
export type ResultadoDiagnostico = 'Prenha' | 'Vazia' | 'Inconclusivo'
export type MetodoDiagnostico = 'Palpação' | 'Ultrassom' | 'Outro'
export type StatusReprodutivo = 'Prenha' | 'Coberta' | 'Vazia' | 'Parida' | 'Sem registro'

export const TIPOS_EVENTO: TipoEventoReprodutivo[] = ['Cobertura', 'Inseminação', 'Diagnóstico de gestação', 'Aborto']

/** Gestação padrão do banco (`gestacao_dias_padrao()`); só usada para exibir previsões já calculadas. */
export const GESTACAO_DIAS_PADRAO = 283

export interface FormEventoReprodutivo {
  tipo: TipoEventoReprodutivo
  data: string
  estacaoId: string
  touroNome: string
  semenPartida: string
  tecnico: string
  metodoDiagnostico: '' | MetodoDiagnostico
  resultado: '' | ResultadoDiagnostico
  idadeGestacaoDias: string
  eventoCoberturaId: string
  observacao: string
}

export function formVazioEvento(hoje: string): FormEventoReprodutivo {
  return {
    tipo: 'Cobertura',
    data: hoje,
    estacaoId: '',
    touroNome: '',
    semenPartida: '',
    tecnico: '',
    metodoDiagnostico: '',
    resultado: '',
    idadeGestacaoDias: '',
    eventoCoberturaId: '',
    observacao: '',
  }
}

/** Campos que cada tipo de evento usa na tela. */
export function camposDoTipo(tipo: TipoEventoReprodutivo) {
  return {
    estacao: tipo === 'Cobertura' || tipo === 'Inseminação',
    touro: tipo === 'Cobertura' || tipo === 'Inseminação',
    semen: tipo === 'Inseminação',
    tecnico: tipo === 'Inseminação',
    diagnostico: tipo === 'Diagnóstico de gestação',
    cobertura: tipo === 'Diagnóstico de gestação' || tipo === 'Aborto',
  }
}

/** Erros que o banco recusaria, antes de gravar. `hoje` e `data` em AAAA-MM-DD. */
export function validarEvento(form: FormEventoReprodutivo, hoje: string, dataCobertura?: string | null): string[] {
  const erros: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) erros.push('Informe a data do evento')
  else if (form.data > hoje) erros.push('A data do evento não pode ser futura')

  if (form.tipo === 'Diagnóstico de gestação') {
    if (!form.resultado) erros.push('Informe o resultado do diagnóstico')
    if (form.resultado === 'Prenha' && form.idadeGestacaoDias.trim() !== '') {
      const n = Number(form.idadeGestacaoDias)
      if (!Number.isInteger(n) || n < 0 || n > 300) erros.push('A idade da gestação deve ser um número inteiro de 0 a 300 dias')
    }
  }
  if (form.eventoCoberturaId && dataCobertura && dataCobertura > form.data) {
    erros.push('A cobertura escolhida deve ser anterior ao evento')
  }
  return erros
}

const texto = (v: string): string | null => (v.trim() === '' ? null : v.trim())

/** Linha para `eventos_reprodutivos`: só os campos que o tipo aceita (as constraints recusam o resto). */
export function montarEventoParaGravar(form: FormEventoReprodutivo, fazendaId: string, individuoId: string, responsavel: string | null) {
  const c = camposDoTipo(form.tipo)
  const prenha = form.tipo === 'Diagnóstico de gestação' && form.resultado === 'Prenha'
  return {
    fazenda_id: fazendaId,
    individuo_id: individuoId,
    tipo: form.tipo,
    data: form.data,
    estacao_id: c.estacao ? texto(form.estacaoId) : null,
    touro_nome: c.touro ? texto(form.touroNome) : null,
    semen_partida: c.semen ? texto(form.semenPartida) : null,
    tecnico: c.tecnico ? texto(form.tecnico) : null,
    metodo_diagnostico: c.diagnostico ? texto(form.metodoDiagnostico) : null,
    resultado: c.diagnostico ? texto(form.resultado) : null,
    idade_gestacao_dias: prenha && form.idadeGestacaoDias.trim() !== '' ? Number(form.idadeGestacaoDias) : null,
    evento_cobertura_id: c.cobertura ? texto(form.eventoCoberturaId) : null,
    observacao: texto(form.observacao),
    responsavel: texto(responsavel ?? ''),
  }
}

export interface FormEstacao {
  nome: string
  dataInicio: string
  dataFim: string
  observacao: string
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

/** Erros que o banco recusaria (nome vazio, período invertido), antes de gravar a estação de monta. */
export function validarEstacao(f: FormEstacao): string[] {
  const erros: string[] = []
  if (f.nome.trim() === '') erros.push('Informe o nome da estação')
  if (!DATA_ISO.test(f.dataInicio)) erros.push('Informe a data de início')
  if (!DATA_ISO.test(f.dataFim)) erros.push('Informe a data de fim')
  if (DATA_ISO.test(f.dataInicio) && DATA_ISO.test(f.dataFim) && f.dataFim < f.dataInicio) {
    erros.push('A data de fim não pode ser anterior à de início')
  }
  return erros
}

// ---------- Diagnóstico em grupo ----------

export interface LinhaDiagnosticoGrupo {
  individuoId: string
  /** '' = não diagnosticada agora (a linha é ignorada) */
  resultado: '' | ResultadoDiagnostico
  idadeGestacaoDias: string
  /** cobertura mais recente da fêmea (status derivado), usada como referência do diagnóstico */
  coberturaId: string | null
  coberturaData: string | null
}

export interface DadosComunsDiagnostico {
  data: string
  metodo: '' | MetodoDiagnostico
  observacao: string
}

/** Erros do lançamento em grupo, por fêmea (id) e gerais. Só valida as linhas com resultado. */
export function validarDiagnosticoEmGrupo(
  linhas: LinhaDiagnosticoGrupo[],
  comuns: DadosComunsDiagnostico,
  hoje: string
): { gerais: string[]; porFemea: Record<string, string> } {
  const gerais: string[] = []
  const porFemea: Record<string, string> = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(comuns.data)) gerais.push('Informe a data do diagnóstico')
  else if (comuns.data > hoje) gerais.push('A data do diagnóstico não pode ser futura')
  const feitas = linhas.filter((l) => l.resultado !== '')
  if (feitas.length === 0) gerais.push('Marque o resultado de ao menos uma fêmea')
  for (const l of feitas) {
    if (l.resultado === 'Prenha' && l.idadeGestacaoDias.trim() !== '') {
      const n = Number(l.idadeGestacaoDias)
      if (!Number.isInteger(n) || n < 0 || n > 300) porFemea[l.individuoId] = 'Idade da gestação de 0 a 300 dias'
    }
    if (l.coberturaData && comuns.data && l.coberturaData > comuns.data) {
      porFemea[l.individuoId] = 'A cobertura é posterior à data do diagnóstico'
    }
  }
  return { gerais, porFemea }
}

/** Linhas para `eventos_reprodutivos` (um diagnóstico por fêmea marcada), prontas para um único insert em lote. */
export function montarDiagnosticosEmGrupo(linhas: LinhaDiagnosticoGrupo[], comuns: DadosComunsDiagnostico, fazendaId: string) {
  return linhas
    .filter((l) => l.resultado !== '')
    .map((l) => ({
      fazenda_id: fazendaId,
      individuo_id: l.individuoId,
      tipo: 'Diagnóstico de gestação' as const,
      data: comuns.data,
      metodo_diagnostico: comuns.metodo === '' ? null : comuns.metodo,
      resultado: l.resultado,
      idade_gestacao_dias: l.resultado === 'Prenha' && l.idadeGestacaoDias.trim() !== '' ? Number(l.idadeGestacaoDias) : null,
      evento_cobertura_id: l.coberturaId,
      observacao: comuns.observacao.trim() === '' ? null : comuns.observacao.trim(),
    }))
}

// ---------- Resumo por estação de monta ----------

export interface EventoParaResumo {
  individuo_id: string
  tipo: TipoEventoReprodutivo
  data: string
  estacao_id: string | null
  resultado: ResultadoDiagnostico | null
}

export interface ResumoEstacao {
  estacaoId: string
  cobertas: number
  prenhes: number
  vazias: number
  inconclusivas: number
  semDiagnostico: number
  /** prenhes / cobertas (0 a 100) ou null sem cobertas */
  taxaPrenhezSobreCobertas: number | null
  /** prenhes / diagnosticadas com resultado conclusivo ou null */
  taxaPrenhezSobreDiagnosticadas: number | null
}

/**
 * Para cada estação: as fêmeas cobertas/inseminadas nela e o resultado do diagnóstico mais recente feito depois da última
 * cobertura da fêmea na estação. Fêmea com diagnóstico "Inconclusivo" não entra na taxa sobre diagnosticadas.
 */
export function resumirEstacoes(eventos: EventoParaResumo[], estacaoIds: string[]): ResumoEstacao[] {
  return estacaoIds.map((estacaoId) => {
    const ultimaCobertura = new Map<string, string>()
    for (const e of eventos) {
      if (e.estacao_id !== estacaoId || (e.tipo !== 'Cobertura' && e.tipo !== 'Inseminação')) continue
      const atual = ultimaCobertura.get(e.individuo_id)
      if (!atual || e.data > atual) ultimaCobertura.set(e.individuo_id, e.data)
    }
    let prenhes = 0
    let vazias = 0
    let inconclusivas = 0
    let semDiagnostico = 0
    for (const [individuoId, dataCob] of ultimaCobertura) {
      const diag = eventos
        .filter((e) => e.individuo_id === individuoId && e.tipo === 'Diagnóstico de gestação' && e.data >= dataCob)
        .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))[0]
      if (!diag) semDiagnostico += 1
      else if (diag.resultado === 'Prenha') prenhes += 1
      else if (diag.resultado === 'Vazia') vazias += 1
      else inconclusivas += 1
    }
    const cobertas = ultimaCobertura.size
    const conclusivas = prenhes + vazias
    return {
      estacaoId,
      cobertas,
      prenhes,
      vazias,
      inconclusivas,
      semDiagnostico,
      taxaPrenhezSobreCobertas: cobertas > 0 ? Math.round((prenhes / cobertas) * 1000) / 10 : null,
      taxaPrenhezSobreDiagnosticadas: conclusivas > 0 ? Math.round((prenhes / conclusivas) * 1000) / 10 : null,
    }
  })
}

export const CLASSE_STATUS_REPRODUTIVO: Record<StatusReprodutivo, string> = {
  Prenha: 'bg-green-500/10 text-green-800 dark:text-green-200',
  Coberta: 'bg-blue-500/10 text-blue-800 dark:text-blue-200',
  Vazia: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
  Parida: 'bg-purple-500/10 text-purple-800 dark:text-purple-200',
  'Sem registro': 'bg-surface-2 text-content-muted',
}

function diasEntre(deAAAAMMDD: string, ateAAAAMMDD: string): number {
  const a = Date.UTC(+deAAAAMMDD.slice(0, 4), +deAAAAMMDD.slice(5, 7) - 1, +deAAAAMMDD.slice(8, 10))
  const b = Date.UTC(+ateAAAAMMDD.slice(0, 4), +ateAAAAMMDD.slice(5, 7) - 1, +ateAAAAMMDD.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/** Texto da previsão de parto: "em 40 dias", "hoje", "atrasado 5 dias"; prevista (só coberta) ou confirmada (prenha). */
export function textoPrevisaoParto(previsao: string | null, confirmada: boolean, hoje: string): string | null {
  if (!previsao) return null
  const dias = diasEntre(hoje, previsao)
  const quando = dias === 0 ? 'hoje' : dias > 0 ? `em ${dias} dia(s)` : `atrasado ${-dias} dia(s)`
  return `${confirmada ? 'Parto previsto' : 'Parto previsto (sem diagnóstico)'} ${quando}`
}

export interface PendenciaReprodutiva {
  tipo: 'sem_diagnostico' | 'parto_proximo' | 'parto_atrasado' | 'vazia_ha_muito_tempo'
  texto: string
}

/**
 * Pendências de uma fêmea a partir do status derivado. Limites: diagnóstico até 60 dias após a cobertura; parto próximo
 * nos 30 dias seguintes; vazia há mais de 120 dias.
 */
export function pendenciasDaFemea(
  s: {
    status_reprodutivo: StatusReprodutivo
    dias_desde_cobertura: number | null
    previsao_parto: string | null
    ultimo_diagnostico_data: string | null
    ultima_cobertura_data: string | null
    dias_desde_ultimo_parto: number | null
  },
  hoje: string
): PendenciaReprodutiva[] {
  const out: PendenciaReprodutiva[] = []
  if (s.status_reprodutivo === 'Coberta' && (s.dias_desde_cobertura ?? 0) >= 60) {
    out.push({ tipo: 'sem_diagnostico', texto: `Sem diagnóstico há ${s.dias_desde_cobertura} dias desde a cobertura` })
  }
  if ((s.status_reprodutivo === 'Prenha' || s.status_reprodutivo === 'Coberta') && s.previsao_parto) {
    const dias = diasEntre(hoje, s.previsao_parto)
    if (dias < 0) out.push({ tipo: 'parto_atrasado', texto: `Parto previsto há ${-dias} dia(s), ainda sem registro` })
    else if (dias <= 30) out.push({ tipo: 'parto_proximo', texto: `Parto previsto em ${dias} dia(s)` })
  }
  if (s.status_reprodutivo === 'Vazia' && s.ultimo_diagnostico_data && diasEntre(s.ultimo_diagnostico_data, hoje) > 120) {
    out.push({ tipo: 'vazia_ha_muito_tempo', texto: `Vazia desde o diagnóstico de ${diasEntre(s.ultimo_diagnostico_data, hoje)} dias atrás` })
  }
  return out
}
