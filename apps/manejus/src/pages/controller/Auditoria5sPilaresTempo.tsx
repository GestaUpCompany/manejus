import { SECOES_5S } from '../../features/relatorioAuditoria5s/itens'
import { corPercentual, rotuloDia, textoPercentual } from '../../features/relatorioAuditoria5s/apresentacao'
import type { PontoPilares } from '../../features/relatorioAuditoria5s/porSetor'

interface Props {
  /** Uma coluna por auditoria, em ordem cronológica (vem de evolucaoPilaresSetor). */
  pontos: PontoPilares[]
  onAbrirAuditoria: (id: string) => void
}

const media = (valores: (number | null)[]) => {
  const v = valores.filter((x): x is number => typeof x === 'number')
  return v.length === 0 ? null : Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
}

/**
 * Pilares ao longo do tempo como mapa de calor: uma linha por pilar, uma coluna por auditoria.
 * Substitui as linhas sobrepostas: cada célula tem o valor escrito e a cor da faixa de conformidade,
 * e leva à auditoria. Por linha, a média do período fecha a leitura.
 */
export function Auditoria5sPilaresTempo({ pontos, onAbrirAuditoria }: Props) {
  if (pontos.length === 0) return <p className="text-sm text-content-muted">Sem auditorias neste setor no período.</p>

  // Mais de uma auditoria no mesmo dia: a coluna ganha a ordem (#2, #3) para não parecer duplicada
  const dias = pontos.map((p) => rotuloDia(String(p.data).slice(0, 10)))
  const ocorrencias = dias.map((d, i) => dias.slice(0, i + 1).filter((x) => x === d).length)
  const totalPorDia = new Map<string, number>()
  dias.forEach((d) => totalPorDia.set(d, (totalPorDia.get(d) ?? 0) + 1))

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1 text-sm">
        <caption className="sr-only">
          Conformidade de cada pilar em cada auditoria do setor, da mais antiga para a mais recente. Selecione uma célula para abrir a auditoria.
        </caption>
        <thead>
          <tr className="text-xs font-medium text-content-muted">
            <th scope="col" className="px-2 py-1 text-left uppercase tracking-wider">
              Pilar
            </th>
            {pontos.map((p, i) => (
              <th key={p.id} scope="col" className="px-1 py-1 text-center font-semibold tabular-nums">
                {dias[i]}
                {(totalPorDia.get(dias[i]) ?? 0) > 1 && <span className="block text-[10px] font-normal text-content-muted">#{ocorrencias[i]}</span>}
              </th>
            ))}
            <th scope="col" className="px-2 py-1 text-center uppercase tracking-wider">
              Média
            </th>
          </tr>
        </thead>
        <tbody>
          {SECOES_5S.map((secao) => {
            const valores = pontos.map((p) => (typeof p[secao.id] === 'number' ? (p[secao.id] as number) : null))
            const mediaPilar = media(valores)
            return (
              <tr key={secao.id}>
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-content-strong">
                  {secao.titulo}
                </th>
                {pontos.map((p, i) => {
                  const valor = valores[i]
                  const cor = corPercentual(valor)
                  const data = (totalPorDia.get(dias[i]) ?? 0) > 1 ? `${dias[i]} (#${ocorrencias[i]})` : dias[i]
                  return (
                    <td key={p.id} className="p-0">
                      <button
                        type="button"
                        onClick={() => onAbrirAuditoria(p.id)}
                        aria-label={`${secao.titulo} em ${data}: ${textoPercentual(valor)}. Abrir auditoria.`}
                        title={`${secao.titulo} · ${data}: ${textoPercentual(valor)}`}
                        className="h-9 w-full min-w-[3rem] rounded-md text-xs font-bold tabular-nums text-content-strong transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        style={{ backgroundColor: `${cor}${valor === null ? '33' : '38'}` }}
                      >
                        {textoPercentual(valor)}
                      </button>
                    </td>
                  )
                })}
                <td className="px-2 py-1 text-center font-bold tabular-nums text-content-strong">
                  <span style={{ color: corPercentual(mediaPilar) }}>{textoPercentual(mediaPilar)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
