import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, formatDate } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, ErrorState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { resumirSessaoManejo, type LinhaSessaoManejo, type ResumoSessaoManejo } from '../../utils/sessoesManejoCurral'

interface SessaoManejo {
  id: string
  data: string
  responsavel: string | null
  observacao: string | null
  finalizada_em: string | null
  created_at: string
  linhas: LinhaSessaoManejo[]
}

function Selo({ n, rotulo, classe }: { n: number; rotulo: string; classe: string }) {
  if (n === 0) return null
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${classe}`}>{n} {rotulo}</span>
}

function Situacao({ r }: { r: ResumoSessaoManejo }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Selo n={r.aplicadas} rotulo="aplicado(s)" classe="bg-green-500/10 text-green-800 dark:text-green-200" />
      <Selo n={r.conflitos} rotulo="conflito(s)" classe="bg-red-500/10 text-red-800 dark:text-red-200" />
      <Selo n={r.aguardando} rotulo="aguardando" classe="bg-amber-500/10 text-amber-800 dark:text-amber-200" />
      <Selo n={r.designacoesAbertas} rotulo="troca(s) de lote a confirmar" classe="bg-blue-500/10 text-blue-800 dark:text-blue-200" />
    </span>
  )
}

export function RegistrosManejoCurral() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sessoes, setSessoes] = useState<SessaoManejo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const carregar = async () => {
    if (!user) return
    setErro(null)
    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('sessoes_manejo_curral')
      .select(
        'id, data, responsavel, observacao, finalizada_em, created_at, linhas:registros_manejo_curral(id, status_processamento, pendencias:pendencias_designacao_lote(status))'
      )
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('Erro ao buscar sessões de manejo de curral:', error)
      setErro(error.message)
    } else {
      setSessoes((data ?? []) as unknown as SessaoManejo[])
    }
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const filtradas = useMemo(() => {
    const busca = searchTerm.trim().toLowerCase()
    return sessoes.filter((s) => {
      const bate = !busca || (s.responsavel ?? '').toLowerCase().includes(busca) || (s.observacao ?? '').toLowerCase().includes(busca)
      return bate && (!dataInicio || s.data >= dataInicio) && (!dataFim || s.data <= dataFim)
    })
  }, [sessoes, searchTerm, dataInicio, dataFim])

  if (loading) return <PageSkeleton variant="list" />
  if (erro) return <ErrorState message="Erro ao carregar as sessões de manejo de curral" detail={erro} onRetry={carregar} />

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Manejo de Curral</h2>
        <p className="text-sm text-content-muted mt-1 max-w-2xl">
          Sessões em que os animais foram identificados e designados a um lote de destino no curral. A mudança de lote só vale
          depois de confirmada na Conciliação de indivíduos.
        </p>
      </div>

      <FilterToolbar
        onClear={() => {
          setSearchTerm('')
          setDataInicio('')
          setDataFim('')
        }}
      >
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Responsável ou observação..." className="text-sm" />
        </FilterField>
        <FilterField label="Data Início">
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-sm" />
        </FilterField>
        <FilterField label="Data Fim">
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-sm" />
        </FilterField>
      </FilterToolbar>

      {sessoes.length === 0 ? (
        <EmptyState title="Nenhuma sessão de manejo de curral" description="As sessões feitas no app de campo aparecem aqui depois de sincronizadas." />
      ) : filtradas.length === 0 ? (
        <EmptyState title="Nenhuma sessão encontrada" description="Nenhuma sessão encontrada com os filtros aplicados" />
      ) : (
        <>
          <div className="sm:hidden space-y-3">
            {filtradas.map((s) => {
              const r = resumirSessaoManejo(s.linhas ?? [])
              return (
                <Card key={s.id} className="p-4 space-y-2" onClick={() => navigate(`/controller/cadernetas/manejo-curral/${s.id}`)}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-content-strong">{formatDate(s.data)}</span>
                    <span className="text-content-muted">{r.total} animal(is)</span>
                  </div>
                  <div className="text-xs text-content-muted">{s.responsavel || '-'}</div>
                  <Situacao r={r} />
                </Card>
              )
            })}
          </div>

          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th>Data</Th>
                  <Th>Responsável</Th>
                  <Th>Animais</Th>
                  <Th>Situação</Th>
                  <Th>Observação</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filtradas.map((s) => {
                  const r = resumirSessaoManejo(s.linhas ?? [])
                  return (
                    <Tr key={s.id} onClick={() => navigate(`/controller/cadernetas/manejo-curral/${s.id}`)} className="cursor-pointer">
                      <Td>{formatDate(s.data)}</Td>
                      <Td>{s.responsavel || '-'}</Td>
                      <Td>{r.total}</Td>
                      <Td>
                        <Situacao r={r} />
                      </Td>
                      <Td>{s.observacao || '-'}</Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
