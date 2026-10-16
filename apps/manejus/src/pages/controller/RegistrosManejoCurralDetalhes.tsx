import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, formatDate, formatDateTime } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, DetailLayout, DetailSection, DetailField, Table, Thead, Tbody, Tr, Th, Td, formatValue } from '@gestaup/ui'
import {
  identificacaoNovaDaLinha,
  resumirSessaoManejo,
  ROTULO_MOTIVO_TROCA,
  ROTULO_STATUS_LINHA,
  type StatusLinhaManejo,
} from '../../utils/sessoesManejoCurral'

interface LinhaDetalhe {
  id: string
  ordem: number | null
  individuo_id: string | null
  identificador_lido: string | null
  id_provisorio_anterior: string | null
  id_brinco_novo: string | null
  id_chip_novo: string | null
  id_manejo_novo: string | null
  motivo_troca: string | null
  peso_kg: number | null
  sexo: string | null
  categoria: string | null
  raca: string | null
  observacao: string | null
  sem_tratamento: boolean
  status_processamento: StatusLinhaManejo
  erro: string | null
  lote: { nome: string } | null
  pendencias: { status: 'aberta' | 'confirmada' | 'descartada' }[] | null
}

interface SessaoDetalhe {
  id: string
  data: string
  responsavel: string | null
  observacao: string | null
  iniciada_em: string | null
  finalizada_em: string | null
  tratamento_tipo: string | null
  tratamento_produto_nome: string | null
  tratamento_dose: string | null
  tratamento_via: string | null
  tratamento_lote_produto: string | null
  tratamento_validade: string | null
  tratamento_carencia_dias: number | null
  tratamento_intervalo_dias: number | null
  tratamento_diagnostico: string | null
  linhas: LinhaDetalhe[]
}

const CLASSE_STATUS: Record<StatusLinhaManejo, string> = {
  aplicado: 'bg-green-500/10 text-green-800 dark:text-green-200',
  conflito: 'bg-red-500/10 text-red-800 dark:text-red-200',
  pendente: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
}

const ROTULO_DESIGNACAO = { aberta: 'A confirmar', confirmada: 'Confirmada', descartada: 'Descartada' } as const

export function RegistrosManejoCurralDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sessao, setSessao] = useState<SessaoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const carregar = async () => {
      if (!id || !user) return
      setLoadError(null)
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) return
      const { data, error } = await supabase
        .from('sessoes_manejo_curral')
        .select(
          'id, data, responsavel, observacao, iniciada_em, finalizada_em, tratamento_tipo, tratamento_produto_nome, tratamento_dose, tratamento_via, tratamento_lote_produto, tratamento_validade, tratamento_carencia_dias, tratamento_intervalo_dias, tratamento_diagnostico, linhas:registros_manejo_curral(id, sem_tratamento, ordem, individuo_id, identificador_lido, id_provisorio_anterior, id_brinco_novo, id_chip_novo, id_manejo_novo, motivo_troca, peso_kg, sexo, categoria, raca, observacao, status_processamento, erro, lote:lotes(nome), pendencias:pendencias_designacao_lote(status))'
        )
        .eq('id', id)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .single()
      if (error) {
        if (error.code === 'PGRST116') setSessao(null)
        else setLoadError(error.message || 'Erro ao buscar a sessão')
      } else {
        const s = data as unknown as SessaoDetalhe
        setSessao({ ...s, linhas: [...(s.linhas ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)) })
      }
      setLoading(false)
    }
    carregar()
  }, [id, user])

  const resumo = sessao ? resumirSessaoManejo(sessao.linhas) : null
  const comTratamento = !!sessao?.tratamento_produto_nome

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!sessao}
      onBack={() => navigate('/controller/cadernetas/manejo-curral')}
      title="Detalhes do Manejo de Curral"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(sessao!.data)} />
                <DetailField label="Responsável" value={formatValue(sessao!.responsavel)} />
                <DetailField label="Início" value={sessao!.iniciada_em ? formatDateTime(sessao!.iniciada_em) : '-'} />
                <DetailField label="Fim" value={sessao!.finalizada_em ? formatDateTime(sessao!.finalizada_em) : '-'} />
                <DetailField label="Animais" value={String(resumo!.total)} />
                <DetailField label="Aplicados" value={String(resumo!.aplicadas)} />
                <DetailField label="Conflitos" value={String(resumo!.conflitos)} />
                <DetailField label="Trocas de lote a confirmar" value={String(resumo!.designacoesAbertas)} />
              </div>
              {sessao!.observacao && <DetailField label="Observação" value={sessao!.observacao} />}
              {resumo!.designacoesAbertas > 0 && (
                <div className="mt-3">
                  <Button size="sm" variant="secondary" onClick={() => navigate('/controller/individuos/conciliacao')}>
                    Confirmar na Conciliação
                  </Button>
                </div>
              )}
            </DetailSection>

            {comTratamento && (
              <DetailSection title="Tratamento da sessão">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <DetailField label="Tipo" value={formatValue(sessao!.tratamento_tipo)} />
                  <DetailField label="Produto" value={sessao!.tratamento_produto_nome ?? '-'} />
                  <DetailField label="Dose" value={formatValue(sessao!.tratamento_dose)} />
                  <DetailField label="Via" value={formatValue(sessao!.tratamento_via)} />
                  <DetailField label="Partida" value={formatValue(sessao!.tratamento_lote_produto)} />
                  <DetailField label="Validade" value={sessao!.tratamento_validade ? formatDate(sessao!.tratamento_validade) : '-'} />
                  <DetailField label="Carência (dias)" value={formatValue(sessao!.tratamento_carencia_dias)} />
                  <DetailField label="Reaplicar em (dias)" value={formatValue(sessao!.tratamento_intervalo_dias)} />
                </div>
                {sessao!.tratamento_diagnostico && <DetailField label="Diagnóstico" value={sessao!.tratamento_diagnostico} />}
                <p className="text-xs text-content-muted mt-2">
                  {sessao!.linhas.filter((l) => !l.sem_tratamento).length} de {sessao!.linhas.length} animais receberam; cada um virou uma aplicação sanitária na ficha do animal.
                </p>
              </DetailSection>
            )}

            <DetailSection title="Animais da sessão" highlighted>
              <div className="overflow-x-auto">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>#</Th>
                      <Th>Animal</Th>
                      <Th>Identificação nova</Th>
                      <Th>Motivo</Th>
                      <Th>Lote de destino</Th>
                      <Th>Peso (kg)</Th>
                      <Th>Situação</Th>
                      <Th>Troca de lote</Th>
                      {comTratamento && <Th>Tratamento</Th>}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sessao!.linhas.map((l, i) => (
                      <Tr key={l.id}>
                        <Td>{l.ordem ?? i + 1}</Td>
                        <Td>
                          {l.individuo_id ? (
                            <button
                              type="button"
                              className="text-brand-700 underline"
                              onClick={() => navigate(`/controller/individuos/${l.individuo_id}`)}
                            >
                              {l.identificador_lido || l.id_provisorio_anterior || 'Abrir animal'}
                            </button>
                          ) : (
                            l.identificador_lido || l.id_provisorio_anterior || '-'
                          )}
                        </Td>
                        <Td>{identificacaoNovaDaLinha(l)}</Td>
                        <Td>{l.motivo_troca ? ROTULO_MOTIVO_TROCA[l.motivo_troca] ?? l.motivo_troca : '-'}</Td>
                        <Td>{l.lote?.nome || '-'}</Td>
                        <Td>{l.peso_kg != null ? Number(l.peso_kg).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '-'}</Td>
                        <Td>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CLASSE_STATUS[l.status_processamento]}`}>
                            {ROTULO_STATUS_LINHA[l.status_processamento]}
                          </span>
                          {l.erro && <div className="text-xs text-red-700 mt-1">{l.erro}</div>}
                        </Td>
                        <Td>{l.pendencias && l.pendencias.length > 0 ? ROTULO_DESIGNACAO[l.pendencias[l.pendencias.length - 1].status] : '-'}</Td>
                        {comTratamento && <Td>{l.sem_tratamento ? 'Não recebeu' : 'Recebeu'}</Td>}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
