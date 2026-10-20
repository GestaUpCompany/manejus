import { useMemo, useState } from 'react'
import { exportToXLSX } from '@gestaup/shared'
import { Button, Card, EmptyState, PageSkeleton, Select } from '@gestaup/ui'
import { useRelatorioIatf } from '../../hooks/useProtocolosIatf'
import {
  DIMENSOES_IATF,
  RELATORIO_IATF_EXPORT_CONFIG,
  agruparTentativas,
  formatarTaxa,
  tentativasIatf,
  totalIatf,
  type DimensaoIatf,
  type LinhaRelatorioIatf,
} from '../../utils/relatorioIatf'

const cabecalhos = ['Inseminadas', 'Prenhes', 'Vazias', 'Inconclusivas', 'Sem diagnóstico', 'Taxa / inseminadas', 'Taxa / diagnosticadas']

function Linha({ l, destaque = false }: { l: LinhaRelatorioIatf; destaque?: boolean }) {
  const classe = destaque ? 'font-semibold text-content-strong bg-surface-2' : 'text-content'
  return (
    <tr className={classe}>
      <td className="px-3 py-2 text-sm">{l.chave}</td>
      <td className="px-3 py-2 text-sm">{l.inseminadas}</td>
      <td className="px-3 py-2 text-sm">{l.prenhes}</td>
      <td className="px-3 py-2 text-sm">{l.vazias}</td>
      <td className="px-3 py-2 text-sm">{l.inconclusivas}</td>
      <td className="px-3 py-2 text-sm">{l.semDiagnostico}</td>
      <td className="px-3 py-2 text-sm">{formatarTaxa(l.taxaSobreInseminadas)}</td>
      <td className="px-3 py-2 text-sm">{formatarTaxa(l.taxaSobreDiagnosticadas)}</td>
    </tr>
  )
}

export function RelatorioIatf({ fazendaId, fazendaNome }: { fazendaId: string | undefined; fazendaNome: string | null }) {
  const dados = useRelatorioIatf(fazendaId)
  const [dimensao, setDimensao] = useState<DimensaoIatf>('protocolo')

  const tentativas = useMemo(
    () => (dados.data ? tentativasIatf(dados.data.inseminacoes, dados.data.eventos) : []),
    [dados.data]
  )
  const linhas = useMemo(() => agruparTentativas(tentativas, dimensao), [tentativas, dimensao])
  const total = useMemo(() => totalIatf(tentativas), [tentativas])

  if (dados.isLoading) return <PageSkeleton variant="list" />
  if (dados.isError) return <EmptyState title="Não foi possível carregar o relatório" description={String(dados.error)} />
  if (tentativas.length === 0)
    return (
      <EmptyState
        title="Nenhuma inseminação de protocolo ainda"
        description="O relatório aparece depois que a IA de um lote de protocolo for registrada."
      />
    )

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4" disableHover>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-64">
            <Select
              label="Agrupar por"
              value={dimensao}
              onChange={(v) => setDimensao(v as DimensaoIatf)}
              options={DIMENSOES_IATF.map((d) => ({ value: d.value, label: d.label }))}
            />
          </div>
          <Button variant="secondary" onClick={() => exportToXLSX([...linhas, total], RELATORIO_IATF_EXPORT_CONFIG, fazendaNome)}>
            Exportar Excel
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-2 border-b border-border-base">
              <tr>
                {['Grupo', ...cabecalhos].map((t) => (
                  <th key={t} className="px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {linhas.map((l) => (
                <Linha key={l.chave} l={l} />
              ))}
              <Linha l={total} destaque />
            </tbody>
          </table>
        </div>
        <p className="text-xs text-content-muted">
          Cada inseminação de um lote de protocolo é uma tentativa. O resultado é o diagnóstico mais recente da fêmea feito depois da IA e antes
          da próxima cobertura ou IA dela. &quot;Taxa / diagnosticadas&quot; ignora as sem diagnóstico e as inconclusivas.
        </p>
      </Card>
    </div>
  )
}

export default RelatorioIatf
