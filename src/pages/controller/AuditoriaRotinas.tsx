import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import {
  getExecucoes,
  getResumo,
  justificarExecucao,
  dispensarExecucao,
  getHistorico,
  ExecucaoRotina,
  ResumoDia,
  HistoricoAlteracao,
  StatusExecucao,
} from '../../services/auditoriaRotinasService'
import { Button, Card, Input, Modal, Select, CardSkeleton, TableSkeleton } from '../../components/ui'
import { CADERNETAS } from '../../utils/cadernetas'

const CHECKLIST_CADERNETAS = ['bebedouros', 'suplementacao', 'rodeio', 'pastagens']
const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'no_horario', label: 'No horário' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'antecipado', label: 'Antecipado' },
  { value: 'nao_executado', label: 'Não executado' },
  { value: 'dispensado', label: 'Dispensado' },
]

const CADERNETA_OPTIONS = [
  { value: '', label: 'Todas' },
  ...CADERNETAS.filter((c) => CHECKLIST_CADERNETAS.includes(c.id)).map((c) => ({ value: c.id, label: c.label })),
]

const Hoje = new Date().toISOString().split('T')[0]

export function AuditoriaRotinas() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])

  const [execucoes, setExecucoes] = useState<ExecucaoRotina[]>([])
  const [resumo, setResumo] = useState<ResumoDia[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const [filtros, setFiltros] = useState({
    funcionarioId: '',
    dataInicio: Hoje,
    dataFim: Hoje,
    cadernetaId: '',
    status: '' as StatusExecucao | '',
  })

  const [justificarModal, setJustificarModal] = useState<{
    open: boolean
    execucao: ExecucaoRotina | null
    motivo: string
    salvando: boolean
  }>({ open: false, execucao: null, motivo: '', salvando: false })

  const [historicoModal, setHistoricoModal] = useState<{
    open: boolean
    execucao: ExecucaoRotina | null
    historico: HistoricoAlteracao[]
    loading: boolean
  }>({ open: false, execucao: null, historico: [], loading: false })

  const [dispensarModal, setDispensarModal] = useState<{
    open: boolean
    funcionarioId: string
    cadernetaId: string
    data: string
    motivo: string
    salvando: boolean
  }>({
    open: false,
    funcionarioId: '',
    cadernetaId: '',
    data: Hoje,
    motivo: '',
    salvando: false,
  })

  useEffect(() => {
    loadFazendaId()
  }, [user])

  useEffect(() => {
    if (fazendaId) {
      loadFuncionarios()
      loadExecucoes(1)
    }
  }, [fazendaId, filtros])

  const loadFazendaId = async () => {
    if (!user) return
    const fazendaId = await getFazendaIdForUser(user.id)
    if (fazendaId) setFazendaId(fazendaId)
  }

  const loadFuncionarios = async () => {
    if (!fazendaId) return
    const { data } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .eq('acessa_app', true)
      .order('nome', { ascending: true })

    setFuncionarios((data || []).map((f) => ({ id: f.id, nome: f.nome || f.id })))
  }

  const loadExecucoes = async (newPage: number) => {
    if (!fazendaId) return
    setLoading(true)
    const result = await getExecucoes({
      fazendaId,
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      funcionarioId: filtros.funcionarioId || undefined,
      cadernetaId: filtros.cadernetaId || undefined,
      status: filtros.status || undefined,
      page: newPage,
      limit,
    })
    setExecucoes(result.data)
    setTotal(result.total)
    setPage(newPage)
    setLoading(false)

    const res = await getResumo(fazendaId, {
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      funcionarioId: filtros.funcionarioId || undefined,
      cadernetaId: filtros.cadernetaId || undefined,
    })
    setResumo(res)
  }

  const handleJustificar = async () => {
    if (!justificarModal.execucao) return
    setJustificarModal((prev) => ({ ...prev, salvando: true }))
    const ok = await justificarExecucao(justificarModal.execucao.id, justificarModal.motivo, {
      observacao: justificarModal.execucao.observacao,
    })
    setJustificarModal({ open: false, execucao: null, motivo: '', salvando: false })
    if (ok) await loadExecucoes(page)
  }

  const openHistorico = async (execucao: ExecucaoRotina) => {
    setHistoricoModal({ open: true, execucao, historico: [], loading: true })
    const historico = await getHistorico(execucao.id)
    setHistoricoModal((prev) => ({ ...prev, historico, loading: false }))
  }

  const handleDispensar = async () => {
    if (!fazendaId || !dispensarModal.funcionarioId || !dispensarModal.cadernetaId || !dispensarModal.data) return
    setDispensarModal((prev) => ({ ...prev, salvando: true }))
    const ok = await dispensarExecucao(
      {
        fazenda_id: fazendaId,
        funcionario_id: dispensarModal.funcionarioId,
        caderneta_id: dispensarModal.cadernetaId,
        data: dispensarModal.data,
        observacao: dispensarModal.motivo,
      },
      dispensarModal.motivo
    )
    setDispensarModal({
      open: false,
      funcionarioId: '',
      cadernetaId: '',
      data: Hoje,
      motivo: '',
      salvando: false,
    })
    if (ok) await loadExecucoes(1)
  }

  const formatDate = (date: string) => {
    const [ano, mes, dia] = date.split('-')
    return `${dia}/${mes}/${ano}`
  }

  const formatTime = (value: string | null) => {
    if (!value) return '-'
    return value.substring(0, 5)
  }

  const formatDateTime = (utcValue: string | null, localValue?: string | null) => {
    if (!utcValue) return '-'
    const d = new Date(utcValue)
    if (localValue) {
      const [h, m] = localValue.split(':')
      d.setHours(parseInt(h || '0', 10), parseInt(m || '0', 10))
    }
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  const statusBadge = (status: StatusExecucao) => {
    const map: Record<StatusExecucao, { label: string; className: string }> = {
      no_horario: { label: 'No horário', className: 'bg-green-500/10 text-green-800 dark:text-green-200' },
      atrasado: { label: 'Atrasado', className: 'bg-red-500/10 text-red-800 dark:text-red-200' },
      antecipado: { label: 'Antecipado', className: 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-200' },
      nao_executado: { label: 'Não executado', className: 'bg-surface-2 text-content' },
      dispensado: { label: 'Dispensado', className: 'bg-primary/10 text-primary dark:text-primary-light' },
    }
    const config = map[status] || map.nao_executado
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>{config.label}</span>
    )
  }

  const funcionarioOptions = useMemo(
    () => [{ value: '', label: 'Todos' }, ...funcionarios.map((f) => ({ value: f.id, label: f.nome }))],
    [funcionarios]
  )

  const resumoGeral = useMemo(() => {
    const acc = {
      programadas: 0,
      no_horario: 0,
      atrasadas: 0,
      antecipadas: 0,
      nao_executadas: 0,
      dispensadas: 0,
    }
    resumo.forEach((r) => {
      acc.programadas += Number(r.programadas)
      acc.no_horario += Number(r.no_horario)
      acc.atrasadas += Number(r.atrasadas)
      acc.antecipadas += Number(r.antecipadas)
      acc.nao_executadas += Number(r.nao_executadas)
      acc.dispensadas += Number(r.dispensadas)
    })
    return acc
  }, [resumo])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Auditoria de Rotinas</h1>
          <p className="text-sm text-content-muted mt-1">Acompanhe a execução das rotinas pelos funcionários.</p>
        </div>
        <Button onClick={() => setDispensarModal((prev) => ({ ...prev, open: true }))}>+ Dispensar dia</Button>
      </div>

      <Card className="bg-surface-1 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Funcionário</label>
            <Select
              options={funcionarioOptions}
              value={filtros.funcionarioId}
              onChange={(value) => setFiltros((prev) => ({ ...prev, funcionarioId: value, status: '' }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data início</label>
            <Input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros((prev) => ({ ...prev, dataInicio: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data fim</label>
            <Input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => setFiltros((prev) => ({ ...prev, dataFim: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Caderneta</label>
            <Select
              options={CADERNETA_OPTIONS}
              value={filtros.cadernetaId}
              onChange={(value) => setFiltros((prev) => ({ ...prev, cadernetaId: value, status: '' }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Status</label>
            <Select
              options={STATUS_OPTIONS}
              value={filtros.status}
              onChange={(value) => setFiltros((prev) => ({ ...prev, status: value as StatusExecucao | '' }))}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">Programadas</p>
          <p className="text-2xl font-bold text-content-strong">{resumoGeral.programadas}</p>
        </Card>
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">No horário</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">{resumoGeral.no_horario}</p>
        </Card>
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">Atrasadas</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{resumoGeral.atrasadas}</p>
        </Card>
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">Antecipadas</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{resumoGeral.antecipadas}</p>
        </Card>
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">Não executadas</p>
          <p className="text-2xl font-bold text-content-muted">{resumoGeral.nao_executadas}</p>
        </Card>
        <Card className="bg-surface-1 p-4">
          <p className="text-xs text-content-muted uppercase">Dispensadas</p>
          <p className="text-2xl font-bold text-primary dark:text-primary-light">{resumoGeral.dispensadas}</p>
        </Card>
      </div>

      <Card className="bg-surface-1 p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-4">
            <TableSkeleton rows={5} />
          </div>
        ) : execucoes.length === 0 ? (
          <div className="p-8 text-center text-content-muted">Nenhuma execução encontrada para os filtros.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-2 text-content-muted font-medium border-b border-border-base">
                  <tr>
                    <th className="px-4 py-3">Funcionário</th>
                    <th className="px-4 py-3">Caderneta</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Programado</th>
                    <th className="px-4 py-3">1º acesso</th>
                    <th className="px-4 py-3">1º registro</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Observação</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {execucoes.map((exec) => (
                    <tr key={exec.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3 font-medium text-content-strong">{exec.funcionario_nome}</td>
                      <td className="px-4 py-3 text-content">
                        {CADERNETAS.find((c) => c.id === exec.caderneta_id)?.label || exec.caderneta_id}
                      </td>
                      <td className="px-4 py-3 text-content">{formatDate(exec.data)}</td>
                      <td className="px-4 py-3 text-content">{formatTime(exec.horario_programado)}</td>
                      <td className="px-4 py-3 text-content">
                        {formatDateTime(exec.primeiro_acesso, exec.primeiro_acesso_local)}
                      </td>
                      <td className="px-4 py-3 text-content">
                        {formatDateTime(exec.primeiro_registro, exec.primeiro_registro_local)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(exec.status)}</td>
                      <td className="px-4 py-3 text-content max-w-xs truncate" title={exec.observacao || ''}>
                        {exec.observacao || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openHistorico(exec)}
                          >
                            Histórico
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setJustificarModal({
                                open: true,
                                execucao: exec,
                                motivo: exec.observacao || '',
                                salvando: false,
                              })
                            }
                          >
                            Justificar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border-subtle">
              <p className="text-sm text-content-muted">
                Página {page} de {totalPages || 1} — {total} registros
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadExecucoes(page - 1)}
                  disabled={page <= 1 || loading}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadExecucoes(page + 1)}
                  disabled={page >= totalPages || loading}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modal Justificar */}
      <Modal
        isOpen={justificarModal.open}
        onClose={() => setJustificarModal({ open: false, execucao: null, motivo: '', salvando: false })}
        title="Justificar execução"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-content">
            Informe o motivo da justificativa para{' '}
            <strong>{CADERNETAS.find((c) => c.id === justificarModal.execucao?.caderneta_id)?.label}</strong> em{' '}
            {justificarModal.execucao?.data && formatDate(justificarModal.execucao.data)}.
          </p>
          <textarea
            value={justificarModal.motivo}
            onChange={(e) => setJustificarModal((prev) => ({ ...prev, motivo: e.target.value }))}
            className="w-full min-h-[120px] px-3 py-2 border border-surface-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="Motivo da justificativa"
          />
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border-subtle">
            <Button
              variant="secondary"
              onClick={() => setJustificarModal({ open: false, execucao: null, motivo: '', salvando: false })}
              disabled={justificarModal.salvando}
            >
              Cancelar
            </Button>
            <Button onClick={handleJustificar} disabled={justificarModal.salvando || !justificarModal.motivo.trim()}>
              {justificarModal.salvando ? 'Salvando...' : 'Salvar justificativa'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Histórico */}
      <Modal
        isOpen={historicoModal.open}
        onClose={() => setHistoricoModal({ open: false, execucao: null, historico: [], loading: false })}
        title="Histórico de alterações"
        size="md"
      >
        <div className="space-y-3">
          {historicoModal.loading ? (
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : historicoModal.historico.length === 0 ? (
            <p className="text-sm text-content-muted">Nenhuma alteração manual registrada.</p>
          ) : (
            historicoModal.historico.map((h) => (
              <div key={h.id} className="p-3 bg-surface-2 rounded-lg">
                <p className="text-sm font-medium text-content-strong">
                  {h.acao === 'justificativa' ? 'Justificativa' : 'Dispensa'}
                </p>
                <p className="text-sm text-content mt-1">{h.motivo}</p>
                <p className="text-xs text-content-muted mt-1">
                  {new Date(h.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))
          )}
          <div className="flex justify-end pt-4 border-t border-border-subtle">
            <Button
              variant="secondary"
              onClick={() => setHistoricoModal({ open: false, execucao: null, historico: [], loading: false })}
            >
              Fechar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Dispensar */}
      <Modal
        isOpen={dispensarModal.open}
        onClose={() =>
          setDispensarModal({
            open: false,
            funcionarioId: '',
            cadernetaId: '',
            data: Hoje,
            motivo: '',
            salvando: false,
          })
        }
        title="Dispensar execução"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Funcionário</label>
            <Select
              options={funcionarioOptions}
              value={dispensarModal.funcionarioId}
              onChange={(value) => setDispensarModal((prev) => ({ ...prev, funcionarioId: value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Caderneta</label>
            <Select
              options={CADERNETA_OPTIONS}
              value={dispensarModal.cadernetaId}
              onChange={(value) => setDispensarModal((prev) => ({ ...prev, cadernetaId: value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data</label>
            <Input
              type="date"
              value={dispensarModal.data}
              onChange={(e) => setDispensarModal((prev) => ({ ...prev, data: e.target.value }))}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Motivo</label>
            <textarea
              value={dispensarModal.motivo}
              onChange={(e) => setDispensarModal((prev) => ({ ...prev, motivo: e.target.value }))}
              className="w-full min-h-[100px] px-3 py-2 border border-surface-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Motivo da dispensa"
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border-subtle">
            <Button
              variant="secondary"
              onClick={() =>
                setDispensarModal({
                  open: false,
                  funcionarioId: '',
                  cadernetaId: '',
                  data: Hoje,
                  motivo: '',
                  salvando: false,
                })
              }
              disabled={dispensarModal.salvando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDispensar}
              disabled={
                dispensarModal.salvando ||
                !dispensarModal.funcionarioId ||
                !dispensarModal.cadernetaId ||
                !dispensarModal.data ||
                !dispensarModal.motivo.trim()
              }
            >
              {dispensarModal.salvando ? 'Salvando...' : 'Dispensar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
