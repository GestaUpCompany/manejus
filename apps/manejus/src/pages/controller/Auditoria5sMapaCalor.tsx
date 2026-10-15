import { SECOES_5S } from '../../features/relatorioAuditoria5s/itens'
import type { LinhaMatriz } from '../../features/relatorioAuditoria5s/porSetor'
import { corPercentual, textoPercentual } from '../../features/relatorioAuditoria5s/apresentacao'

interface Props {
  linhas: LinhaMatriz[]
  onAbrirSetor: (chave: string) => void
}

/** Mapa de calor: conformidade % por setor × pilar. Cada célula leva ao setor. */
export function Auditoria5sMapaCalor({ linhas, onAbrirSetor }: Props) {
  if (linhas.length === 0) return <p className="text-sm text-content-muted">Sem auditorias no período.</p>

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr className="text-xs font-medium uppercase tracking-wider text-content-muted">
            <th className="px-2 py-1 text-left">Setor</th>
            {SECOES_5S.map((s) => (
              <th key={s.id} className="px-2 py-1 text-center">
                {s.titulo}
              </th>
            ))}
            <th className="px-2 py-1 text-center">Geral</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave}>
              <td className="max-w-[160px] truncate px-2 py-1 font-medium text-content-strong" title={l.nome}>
                {l.nome}
              </td>
              {[...l.pilares, l.percentual].map((p, i) => {
                const cor = corPercentual(p)
                const rotulo = i < SECOES_5S.length ? SECOES_5S[i].titulo : 'Geral'
                return (
                  <td key={i} className="p-0">
                    <button
                      type="button"
                      onClick={() => onAbrirSetor(l.chave)}
                      title={`${l.nome} · ${rotulo}: ${textoPercentual(p)}`}
                      className="h-9 w-full min-w-[64px] rounded-md text-xs font-bold text-content-strong transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      style={{ backgroundColor: `${cor}${p === null ? '33' : '38'}`, border: i === SECOES_5S.length ? `1px solid ${cor}` : undefined }}
                    >
                      {textoPercentual(p)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
