/**
 * Sessões do manejo de curral (caderneta do PWA): cabeçalho e linhas por animal. O servidor marca cada linha como
 * aplicada ou em conflito; a mudança de lote vira pendência de designação, resolvida na Conciliação.
 */
export type StatusLinhaManejo = 'pendente' | 'aplicado' | 'conflito'

export interface LinhaSessaoManejo {
  id: string
  status_processamento: StatusLinhaManejo
  pendencias?: { status: 'aberta' | 'confirmada' | 'descartada' }[] | null
}

export interface ResumoSessaoManejo {
  total: number
  aplicadas: number
  conflitos: number
  aguardando: number
  designacoesAbertas: number
}

/** Contagens da sessão: linhas, aplicadas, em conflito, ainda sem processar e designações de lote abertas. */
export function resumirSessaoManejo(linhas: LinhaSessaoManejo[]): ResumoSessaoManejo {
  return {
    total: linhas.length,
    aplicadas: linhas.filter((l) => l.status_processamento === 'aplicado').length,
    conflitos: linhas.filter((l) => l.status_processamento === 'conflito').length,
    aguardando: linhas.filter((l) => l.status_processamento === 'pendente').length,
    designacoesAbertas: linhas.reduce((n, l) => n + (l.pendencias ?? []).filter((p) => p.status === 'aberta').length, 0),
  }
}

export const ROTULO_STATUS_LINHA: Record<StatusLinhaManejo, string> = {
  pendente: 'Aguardando processamento',
  aplicado: 'Aplicado',
  conflito: 'Conflito',
}

export const ROTULO_MOTIVO_TROCA: Record<string, string> = {
  definitivo: 'Brinco definitivo',
  perdido: 'Brinco perdido',
  trocado: 'Brinco trocado',
}

/** Identificação nova da linha em texto curto (brinco, chip e manejo que a sessão definiu). */
export function identificacaoNovaDaLinha(l: { id_brinco_novo?: string | null; id_chip_novo?: string | null; id_manejo_novo?: string | null }): string {
  const partes = [
    l.id_brinco_novo && `brinco ${l.id_brinco_novo}`,
    l.id_chip_novo && `chip ${l.id_chip_novo}`,
    l.id_manejo_novo && `manejo ${l.id_manejo_novo}`,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '-'
}
