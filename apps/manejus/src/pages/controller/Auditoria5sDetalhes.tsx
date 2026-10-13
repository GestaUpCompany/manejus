import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, formatDate, getFazendaIdForUser } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { SECOES_5S } from '../../features/relatorioAuditoria5s/itens'
import { resultadoRegistro, type RegistroAuditoria5s } from '../../features/relatorioAuditoria5s/agregacao'

interface RegistroRow extends RegistroAuditoria5s {
  fazenda_id: string
  created_at: string
}

const textoPercentual = (p: number | null) => (p === null ? '-' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

export function Auditoria5sDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const carregar = async () => {
      if (!id || !user) return
      setLoadError(null)
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('registros_auditoria_5s')
        .select('*')
        .eq('id', id)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          setRegistro(null)
        } else {
          console.error('Erro ao buscar auditoria 5S:', error)
          setLoadError(error.message || 'Erro ao buscar registro')
        }
      } else {
        setRegistro(data as RegistroRow)
      }
      setLoading(false)
    }
    carregar()
  }, [id, user])

  const resultado = registro ? resultadoRegistro(registro) : null

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/checklists/auditoria-5s')}
      title="Detalhes da Auditoria 5S"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Setor" value={formatValue(registro!.setor)} />
                <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                <DetailField label="Registrado por" value={formatValue(registro!.nome_usuario)} />
              </div>
            </DetailSection>

            <DetailSection title="Resultado" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Conformidade" value={textoPercentual(resultado!.percentual)} />
                <DetailField label="Itens conformes (C)" value={String(resultado!.conformes)} />
                <DetailField label="Itens não conformes (N)" value={String(resultado!.naoConformes)} />
                <DetailField label="Não se aplica (–)" value={String(resultado!.naoAplicaveis)} />
              </div>
            </DetailSection>

            {SECOES_5S.map((secao, indice) => {
              const res = resultado!.secoes[indice]
              const obs = registro!.observacoes?.[secao.id]
              return (
                <DetailSection key={secao.id} title={`${secao.titulo} (${textoPercentual(res.percentual)})`}>
                  <ul className="grid w-fit max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 text-sm">
                    {secao.itens.map((item, i) => {
                      const resposta = registro!.itens?.[item.chave]
                      return (
                        <li key={item.chave} className="contents">
                          <span className="text-content-strong">
                            {i + 1}) {item.texto}
                          </span>
                          <span
                            title={resposta === 'NA' ? 'Não se aplica' : undefined}
                            className={`rounded px-2 py-0.5 text-center text-xs font-bold ${
                              resposta === 'C'
                                ? 'bg-green-100 text-green-800'
                                : resposta === 'N'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-surface-2 text-content-muted'
                            }`}
                          >
                            {resposta === 'NA' ? '–' : resposta || '-'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  {obs && (
                    <p className="mt-3 border-t pt-2 text-sm text-content-muted">
                      <span className="font-medium">Observações:</span> {obs}
                    </p>
                  )}
                </DetailSection>
              )
            })}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
