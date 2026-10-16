/**
 * Baixa manual no painel. Gera a Saída agregada do lote (RPC baixar_individuo).
 * Venda, abate e transferência não entram aqui: a Ordem de Serviço já baixa o lote. Morte: Caderneta de Morte.
 */
export const motivosSaida = ['Doação', 'Descarte', 'Outro']

/** Status que a baixa manual aceita. Os demais são gravados por OS ou pela Caderneta de Morte. */
export const statusBaixaManual = ['Vivo', 'Doado']

/** Status que só mudam estornando a OS ou a morte que os gerou. */
export const statusBaixadosPorOutroFluxo = ['Abatido', 'Venda Vivo', 'Transferido', 'Morto']

const motivoPadraoPorStatus: Record<string, string> = {
  Doado: 'Doação',
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
  if (statusBaixadosPorOutroFluxo.includes(form.status)) {
    errors.status =
      form.status === 'Morto'
        ? 'Morte é registrada pela Caderneta de Morte.'
        : 'Venda, abate e transferência são registrados pela Ordem de Serviço.'
    return errors
  }
  if (!statusBaixaManual.includes(form.status)) {
    errors.status = 'Status inválido.'
    return errors
  }
  if (form.status === 'Vivo') return errors
  if (!form.dataSaida) errors.dataSaida = 'Informe a data da saída.'
  else if (form.dataSaida > hojeFazenda) errors.dataSaida = 'A data da saída não pode ser futura.'
  if (!form.motivoSaida) errors.motivoSaida = 'Informe o motivo da saída.'
  else if (!motivosSaida.includes(form.motivoSaida)) errors.motivoSaida = 'Motivo inválido.'
  return errors
}

/** Monta o que vai para a RPC. Vivo limpa os dados de saída. */
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
