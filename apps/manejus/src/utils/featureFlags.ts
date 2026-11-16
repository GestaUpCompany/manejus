/**
 * Feature flags simples do painel (frontend). Liberações por fazenda ficam aqui,
 * em um único lugar, para remover a flag quando a funcionalidade for liberada geral.
 */

/** Fazenda de testes: recebe as funcionalidades em homologação. */
export const FAZENDA_TESTES_ID = 'd649c65e-16ab-4b77-a84b-df937aa41cc3'

/** Infográfico anual: liberado só na fazenda de testes. O mensal segue para todas. */
export function infograficoAnualLiberado(fazendaId: string | null | undefined): boolean {
  return fazendaId === FAZENDA_TESTES_ID
}

/** Relatório de abate: liberado só na fazenda de testes (homologação). */
export function relatorioAbateLiberado(fazendaId: string | null | undefined): boolean {
  return fazendaId === FAZENDA_TESTES_ID
}
