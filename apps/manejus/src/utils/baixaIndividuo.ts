/** Motivos de saída oferecidos no painel. "Morte" fica de fora: só pela Caderneta de Morte. */
export const motivosSaida = ['Venda', 'Abate', 'Doação', 'Transferência', 'Descarte', 'Outro']

const motivoPadraoPorStatus: Record<string, string> = {
  'Venda Vivo': 'Venda',
  Abatido: 'Abate',
  Doado: 'Doação',
  Transferido: 'Transferência',
}

export function motivoPadrao(status: string): string {
  return motivoPadraoPorStatus[status] ?? ''
}

export interface BaixaForm {
  status: string
  dataSaida: string
  motivoSaida: string
  destinoSaida: string
}

export interface DadosBaixa {
  status: string
  data_saida: string | null
  motivo_saida: string | null
  destino_saida: string | null
}

/** Valida a baixa. Voltar a Vivo não exige nada. Retorna um mapa campo -> mensagem. */
export function validarBaixa(form: BaixaForm, hojeFazenda: string): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.status) {
    errors.status = 'Selecione o status.'
    return errors
  }
  if (form.status === 'Vivo') return errors
  if (!form.dataSaida) errors.dataSaida = 'Informe a data da saída.'
  else if (form.dataSaida > hojeFazenda) errors.dataSaida = 'A data da saída não pode ser futura.'
  if (!form.motivoSaida) errors.motivoSaida = 'Informe o motivo da saída.'
  else if (!motivosSaida.includes(form.motivoSaida)) errors.motivoSaida = 'Motivo inválido.'
  return errors
}

/** Monta o que vai para o banco. Vivo limpa os dados de saída. */
export function montarDadosBaixa(form: BaixaForm): DadosBaixa {
  if (form.status === 'Vivo') {
    return { status: 'Vivo', data_saida: null, motivo_saida: null, destino_saida: null }
  }
  return {
    status: form.status,
    data_saida: form.dataSaida,
    motivo_saida: form.motivoSaida,
    destino_saida: form.destinoSaida.trim() || null,
  }
}
