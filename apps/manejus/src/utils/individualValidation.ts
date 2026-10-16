interface IndividuoForm {
  id_manejo?: string
  id_brinco?: string
  id_chip?: string
  id_provisorio_cria?: string
  sexo?: string
  categoria?: string
  raca?: string
  data_nascimento?: string
  peso_nascimento_kg?: number | string
  status?: string
  origem?: string
  data_entrada_fazenda?: string
  pv_entrada_kg?: number | string
  preco_entrada_reais_kg?: number | string
  preco_entrada_reais_arroba?: number | string
  preco_entrada_reais_cabeca?: number | string
  preco_arroba_boi_gordo?: number | string
  agio_desagio?: number | string
  data_formacao_lote?: string
  lote_atual?: string
  protocolo_sanitario?: string
  fornecedor?: string
  propriedade_origem?: string
  propriedade_atual?: string
  pai?: string
  mae?: string
  estrategia_nutricional_tipo?: string
  estrategia_nutricional_id?: string
  estrategia_nutricional_nome?: string
  gmd_kg_cab_dia?: number | string
  peso_meta_kg?: number | string
  data_desmama?: string
  peso_desmama_kg?: number | string
  pasto_atual?: string
  setor_atual?: string
  data_insercao_rastreabilidade?: string
  data_liberacao_sisbov?: string
  codigo_sisbov?: string
  codigo_pnib?: string
  dispositivo_tipo?: string
  data_identificacao?: string
  data_vacina_brucelose?: string
}

// Espelham o CHECK de categoria e o trigger trg_individuos_validar_sexo_categoria (20260916270000_caderneta_pesagem.sql)
export const categoriasMacho = [
  'Bezerro ao Pé',
  'Bezerro Desmama',
  'Bezerro',
  'Garrote',
  'Boi Magro',
  'Boi Gordo',
  'Tourinho',
  'Touro',
]

export const categoriasFemea = [
  'Bezerra ao Pé',
  'Bezerra Desmama',
  'Bezerra',
  'Novilha',
  'Primípara',
  'Vaca Parida',
  'Vaca Prenha',
  'Vaca Vazia',
  'Vaca Descarte',
  'Vaca',
  'Tropa',
]

export const categoriasTodas = [...categoriasMacho, ...categoriasFemea]

export const sexos = ['Macho', 'Fêmea']

// Dispositivos de identificação aceitos pelo banco (individuos_dispositivo_tipo_check)
export const dispositivosIdentificacao = [
  { value: 'brinco', label: 'Brinco visual' },
  { value: 'brinco_eletronico', label: 'Brinco eletrônico' },
  { value: 'botton', label: 'Botton' },
  { value: 'bolus', label: 'Bolus ruminal' },
  { value: 'outro', label: 'Outro' },
]

/**
 * Código SISBOV (IN MAPA 51/2018): 15 dígitos numéricos; os 3 primeiros são o código do Brasil (076).
 * Devolve a mensagem de erro, ou null quando vazio ou válido.
 */
export function validarCodigoSisbov(valor?: string | null): string | null {
  const v = (valor ?? '').trim()
  if (!v) return null
  if (!/^\d+$/.test(v)) return 'O código SISBOV tem apenas números.'
  if (v.length !== 15) return 'O código SISBOV tem 15 dígitos.'
  if (!v.startsWith('076')) return 'O código SISBOV começa com 076 (código do Brasil).'
  return null
}

export const statusList = [
  'Vivo',
  'Abatido',
  'Doado',
  'Morto',
  'Transferido',
  'Venda Vivo',
]

// Status que o gestor pode atribuir no formulário. Morto só pela Caderneta de Morte.
export const statusEditaveis = statusList.filter((s) => s !== 'Morto')

export const origens = ['Compra', 'Doação', 'Nascimento', 'Transferência', 'Cadastro Manual']

export const estrategiaNutricionalTipos = ['insumo', 'mineral', 'proteinado', 'racao']

// O NumericInput emite texto pt-BR com vírgula decimal ("32,000"); valores do banco chegam como number
export function toNumber(value: number | string): number {
  if (typeof value === 'number') return value
  return Number(value.replace(',', '.'))
}

export interface OpcoesValidacaoIndividuo {
  /** Status gravado no banco ao abrir a edição. Morto só é aceito se o animal já estava Morto. */
  statusOriginal?: string
}

export function validateIndividuo(form: IndividuoForm, opcoes: OpcoesValidacaoIndividuo = {}): Record<string, string> {
  const errors: Record<string, string> = {}

  const temIdentificacao =
    (form.id_manejo && form.id_manejo.trim() !== '') ||
    (form.id_brinco && form.id_brinco.trim() !== '') ||
    (form.id_chip && form.id_chip.trim() !== '') ||
    (form.id_provisorio_cria && form.id_provisorio_cria.trim() !== '')

  if (!temIdentificacao) {
    errors.identificacao = 'Informe pelo menos uma identificação (brinco, chip, manejo ou provisório).'
  }

  if (!form.sexo) {
    errors.sexo = 'Selecione o sexo.'
  }

  if (!form.categoria) {
    errors.categoria = 'Selecione a categoria.'
  }

  if (form.sexo && form.categoria) {
    if (form.sexo === 'Macho' && !categoriasMacho.includes(form.categoria)) {
      errors.categoria = `Categoria ${form.categoria} não permitida para machos.`
    }
    if (form.sexo === 'Fêmea' && !categoriasFemea.includes(form.categoria)) {
      errors.categoria = `Categoria ${form.categoria} não permitida para fêmeas.`
    }
  }

  if (!form.raca) {
    errors.raca = 'Selecione a raça.'
  }

  if (!form.data_nascimento) {
    errors.data_nascimento = 'Informe a data de nascimento.'
  } else {
    const nascimento = new Date(form.data_nascimento)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (nascimento > hoje) {
      errors.data_nascimento = 'A data de nascimento não pode ser futura.'
    }
  }

  if (form.peso_nascimento_kg !== undefined && form.peso_nascimento_kg !== '') {
    const peso = toNumber(form.peso_nascimento_kg)
    if (isNaN(peso) || peso < 0) {
      errors.peso_nascimento_kg = 'Informe um peso válido.'
    }
  }

  if (!form.status) {
    errors.status = 'Selecione o status.'
  } else if (form.status === 'Morto' && opcoes.statusOriginal !== 'Morto') {
    // Bloqueia a TRANSIÇÃO para Morto. Um animal já Morto (baixado pela Caderneta de Morte) continua editável.
    errors.status = 'O status Morto deve ser registrado exclusivamente pela Caderneta de Morte.'
  }

  const validarNaoNegativo = (
    field: keyof IndividuoForm,
    label: string
  ) => {
    const value = form[field]
    if (value !== undefined && value !== '') {
      const num = toNumber(value)
      if (isNaN(num) || num < 0) {
        errors[field] = `${label} não pode ser negativo.`
      }
    }
  }

  validarNaoNegativo('pv_entrada_kg', 'PV entrada')
  validarNaoNegativo('preco_entrada_reais_kg', 'Preço entrada (R$/kg)')
  validarNaoNegativo('preco_entrada_reais_arroba', 'Preço entrada (R$/@)')
  validarNaoNegativo('preco_entrada_reais_cabeca', 'Preço entrada (R$/cabeça)')
  validarNaoNegativo('preco_arroba_boi_gordo', 'Preço arroba boi gordo')
  validarNaoNegativo('gmd_kg_cab_dia', 'GMD')
  validarNaoNegativo('peso_meta_kg', 'Peso meta')
  validarNaoNegativo('peso_desmama_kg', 'Peso na desmama')

  if (form.data_entrada_fazenda) {
    const entrada = new Date(form.data_entrada_fazenda)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (entrada > hoje) {
      errors.data_entrada_fazenda = 'A data de entrada não pode ser futura.'
    }
    if (form.data_nascimento) {
      const nascimento = new Date(form.data_nascimento)
      if (entrada < nascimento) {
        errors.data_entrada_fazenda = 'A entrada não pode ser anterior ao nascimento.'
      }
    }
  }

  if (form.data_desmama) {
    const desmama = new Date(form.data_desmama)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (desmama > hoje) {
      errors.data_desmama = 'A data de desmama não pode ser futura.'
    }
    if (form.data_nascimento) {
      const nascimento = new Date(form.data_nascimento)
      if (desmama < nascimento) {
        errors.data_desmama = 'A desmama não pode ser anterior ao nascimento.'
      }
    }
  }

  if (form.data_insercao_rastreabilidade) {
    const rastreabilidade = new Date(form.data_insercao_rastreabilidade)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (rastreabilidade > hoje) {
      errors.data_insercao_rastreabilidade = 'A data não pode ser futura.'
    }
  }

  if (form.data_liberacao_sisbov) {
    const liberacao = new Date(form.data_liberacao_sisbov)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    if (liberacao > hoje) {
      errors.data_liberacao_sisbov = 'A data não pode ser futura.'
    }
  }

  const erroSisbov = validarCodigoSisbov(form.codigo_sisbov)
  if (erroSisbov) errors.codigo_sisbov = erroSisbov

  for (const campo of ['data_identificacao', 'data_vacina_brucelose'] as const) {
    const valor = form[campo]
    if (valor) {
      const data = new Date(valor)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      if (data > hoje) errors[campo] = 'A data não pode ser futura.'
    }
  }

  return errors
}

export function calculateCompletenessScore(form: IndividuoForm): number {
  const camposEssenciais = [
    form.id_manejo,
    form.id_brinco,
    form.id_chip,
    form.id_provisorio_cria,
  ]
  const temIdentificacao = camposEssenciais.some((v) => v && v.trim() !== '')

  const camposObrigatorios = [
    temIdentificacao,
    form.data_nascimento,
    form.sexo,
    form.categoria,
    form.raca,
    form.peso_nascimento_kg !== undefined && form.peso_nascimento_kg !== '',
    form.status,
  ]

  const preenchidos = camposObrigatorios.filter(Boolean).length
  return Math.round((preenchidos / camposObrigatorios.length) * 100)
}

export function getSyncStatusFromScore(score: number): string {
  return score >= 100 ? 'manual_completo' : 'manual_incompleto'
}
