import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX, formatDate, toFarmDateOnly, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { PENDENCIAS_ALMOXARIFADO_EXPORT_CONFIG } from '../../utils/exportConfigs'

interface PendenciaRpc {
  item_id: string
  item_nome: string
  unidade: string | null
  retirada_id: string
  retirada_item_index: number
  quantidade_pendente: number | string
  prazo_devolucao: string | null
  quem_pegou: string | null
}

interface Pendencia {
  chave: string
  pessoa: string
  item: string
  quantidade: number
  unidade: string
  retiradaEm: string | null // YYYY-MM-DD no fuso da fazenda
  prazo: string | null // YYYY-MM-DD
  prazoTexto: string
  diasAtraso: number | null // > 0 vencida; 0 vence hoje; < 0 no prazo; null sem prazo
}

// Prazo vem do PWA como texto DD/MM/AAAA dentro do jsonb
const prazoParaIso = (texto: string | null | undefined): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((texto || '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const diasEntre = (aIso: string, bIso: string) =>
  Math.round((Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10)) -
    Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10))) / 86400000)

const situacaoTexto = (p: Pendencia) => {
  if (p.diasAtraso === null) return 'Sem prazo'
  if (p.diasAtraso > 0) return `Vencida há ${p.diasAtraso} dia${p.diasAtraso > 1 ? 's' : ''}`
  if (p.diasAtraso === 0) return 'Vence hoje'
  return `No prazo (${-p.diasAtraso} dia${p.diasAtraso < -1 ? 's' : ''})`
}

export function PendenciasAlmoxarifado() {
  const { user } = useAuth()
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [somenteVencidas, setSomenteVencidas] = useState(false)

  useEffect(() => {
    const carregar = async () => {
      if (!user) return
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) { setLoading(false); return }
      getFazendaNome(fazendaId).then(setFazendaNome)

      const { data, error } = await supabase.rpc('get_itens_pendentes_devolucao', {
        p_fazenda_id: fazendaId,
        p_quem_pegou: null,
      })
      if (error) {
        setErro(error.message)
        setLoading(false)
        return
      }
      const linhas = (data || []) as PendenciaRpc[]

      // A RPC não devolve a data da retirada: busca nos registros de origem
      const ids = [...new Set(linhas.map((l) => l.retirada_id))]
      const datas = new Map<string, string>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data: regs } = await supabase
          .from('registros_almoxarifado')
          .select('id,data')
          .in('id', ids.slice(i, i + 200))
        ;(regs || []).forEach((r: any) => datas.set(r.id, r.data))
      }

      const hoje = toFarmDateOnly(new Date().toISOString()) || new Date().toISOString().slice(0, 10)
      setPendencias(linhas.map((l) => {
        const prazo = prazoParaIso(l.prazo_devolucao)
        return {
          chave: `${l.retirada_id}-${l.retirada_item_index}`,
          pessoa: l.quem_pegou || '-',
          item: l.item_nome,
          quantidade: Number(l.quantidade_pendente),
          unidade: l.unidade || 'un',
          retiradaEm: toFarmDateOnly(datas.get(l.retirada_id)),
          prazo,
          prazoTexto: l.prazo_devolucao || '',
          diasAtraso: prazo ? diasEntre(hoje, prazo) : null,
        }
      }).sort((a, b) =>
        (b.diasAtraso ?? -99999) - (a.diasAtraso ?? -99999) || a.pessoa.localeCompare(b.pessoa)))
      setLoading(false)
    }
    carregar()
  }, [user])

  const filtradas = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase()
    return pendencias.filter((p) =>
      (!termo || p.pessoa.toLowerCase().includes(termo) || p.item.toLowerCase().includes(termo)) &&
      (!somenteVencidas || (p.diasAtraso !== null && p.diasAtraso > 0)))
  }, [pendencias, searchTerm, somenteVencidas])

  const vencidas = pendencias.filter((p) => p.diasAtraso !== null && p.diasAtraso > 0).length
  const pessoas = new Set(pendencias.map((p) => p.pessoa)).size

  if (loading) return <PageSkeleton variant="list" />

  const exportar = () => exportToXLSX(
    filtradas.map((p) => ({
      pessoa: p.pessoa,
      item: p.item,
      quantidade: `${p.quantidade.toLocaleString('pt-BR')} ${p.unidade}`,
      retirada_em: p.retiradaEm,
      prazo: p.prazo,
      situacao: situacaoTexto(p),
    })),
    PENDENCIAS_ALMOXARIFADO_EXPORT_CONFIG,
    fazendaNome,
  )

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Pendências de Devolução</h2>
        <p className="text-sm text-content-muted">Itens retirados com devolução prevista que ainda não voltaram ao almoxarifado.</p>
      </div>

      {erro && <Card className="p-4 bg-red-500/10" disableHover><p className="text-sm text-red-700">{erro}</p></Card>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4" disableHover><p className="text-xs text-content-muted">Itens pendentes</p><p className="text-2xl font-bold">{pendencias.length}</p></Card>
        <Card className="p-4" disableHover><p className="text-xs text-content-muted">Pessoas com itens</p><p className="text-2xl font-bold">{pessoas}</p></Card>
        <Card className="p-4" disableHover><p className="text-xs text-content-muted">Vencidas</p><p className={`text-2xl font-bold ${vencidas > 0 ? 'text-red-600' : 'text-content-strong'}`}>{vencidas}</p></Card>
      </div>

      <FilterToolbar
        onExport={exportar}
        exportDisabled={filtradas.length === 0}
        onClear={() => { setSearchTerm(''); setSomenteVencidas(false) }}
      >
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Pessoa ou item..." className="text-sm" />
        </FilterField>
        <FilterField label="Situação">
          <label className="flex min-h-[2.5rem] items-center gap-2 text-sm text-content">
            <input type="checkbox" checked={somenteVencidas} onChange={(e) => setSomenteVencidas(e.target.checked)} />
            Somente vencidas
          </label>
        </FilterField>
      </FilterToolbar>

      {pendencias.length === 0 ? (
        <EmptyState title="Nenhuma pendência de devolução" description="Tudo que foi retirado com devolução prevista já voltou." />
      ) : filtradas.length === 0 ? (
        <EmptyState title="Nenhuma pendência encontrada" description="Nenhum item com os filtros aplicados" />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filtradas.map((p) => (
              <Card key={p.chave} className="p-4" disableHover>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-content-strong">{p.item}</p>
                    <p className="text-xs text-content-muted">{p.pessoa}</p>
                  </div>
                  <span className="text-sm font-semibold">{p.quantidade.toLocaleString('pt-BR')} {p.unidade}</span>
                </div>
                <div className="mt-3 flex justify-between text-xs">
                  <span className="text-content-muted">Retirada {p.retiradaEm ? formatDate(p.retiradaEm) : '-'} · prazo {p.prazoTexto || '-'}</span>
                  <span className={p.diasAtraso !== null && p.diasAtraso > 0 ? 'font-semibold text-red-600' : 'text-content-muted'}>{situacaoTexto(p)}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th>Pessoa</Th>
                  <Th>Item</Th>
                  <Th>Pendente</Th>
                  <Th>Retirada</Th>
                  <Th>Prazo</Th>
                  <Th>Situação</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filtradas.map((p) => (
                  <Tr key={p.chave}>
                    <Td>{p.pessoa}</Td>
                    <Td>{p.item}</Td>
                    <Td>{p.quantidade.toLocaleString('pt-BR')} {p.unidade}</Td>
                    <Td>{p.retiradaEm ? formatDate(p.retiradaEm) : '-'}</Td>
                    <Td>{p.prazoTexto || '-'}</Td>
                    <Td className={p.diasAtraso !== null && p.diasAtraso > 0 ? 'font-semibold text-red-600' : p.diasAtraso === 0 ? 'font-semibold text-amber-600' : 'text-content-muted'}>
                      {situacaoTexto(p)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
