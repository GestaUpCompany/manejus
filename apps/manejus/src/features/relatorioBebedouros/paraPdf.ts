// Conversões dos resultados de calculos.ts para o payload do PDF de Bebedouros.
import type { LimpezaDoDiaPDF, OcorrenciaPDF, StatusBebedouroPDF } from '../../utils/relatorioBebedourosPDF'
import type { ItemCronograma, LimpezaDoDiaItem, OcorrenciaCalculada } from './calculos'

export function cronogramaParaPDF(i: ItemCronograma): StatusBebedouroPDF {
  return {
    nome: i.nome,
    dias: i.dias,
    cor: i.status.cor,
    meta: i.meta,
    ultimaLimpeza: i.ultimaLimpeza,
    limpezasNoPeriodo: i.limpezasNoPeriodo,
    statusLabel: i.status.label,
    simbolo: i.status.simbolo,
    proximaLimpeza: i.proximaLimpeza,
    diasParaProxima: i.diasParaProxima,
    responsavelUltima: i.responsavelUltima,
    observacaoUltima: i.observacaoUltima,
  }
}

export function limpezaDoDiaParaPDF(l: LimpezaDoDiaItem): LimpezaDoDiaPDF {
  return {
    nome: l.nome,
    intervalo: l.intervalo,
    cor: l.statusCor,
    meta: l.meta,
    dataLimpeza: l.dataLimpeza,
    dataLimpezaAnterior: l.dataLimpezaAnterior,
    statusLabel: l.statusLabel,
    responsavel: l.responsavel,
    simbolo: l.simbolo,
    proximaPrevista: l.proximaPrevista,
  }
}

export function ocorrenciaParaPDF(o: OcorrenciaCalculada): OcorrenciaPDF {
  return {
    data: o.data,
    bebedouro: o.bebedouro,
    itensNegativos: o.itens.map((i) => i.label).join(', '),
    obsItens: o.itens.map((i) => i.obs).filter(Boolean).join('; '),
    obsGeral: o.obsGeral,
    responsavel: o.responsavel,
    itens: o.itens,
  }
}
