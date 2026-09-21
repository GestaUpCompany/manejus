import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import {
  Button, Card, CardSkeleton, Input, Select, Modal, ConfirmModal,
  Pagination, SearchInput, useToast,
} from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { formatDate, formatDateTime, toFarmDateOnly, FARM_TIMEZONE } from '../../utils/formatDate'

type Aba = 'tratos' | 'leituras'

interface RegistroTrato {
  id: string
  data: string
  curral_id: string
  curral_nome: string | null
  lote_id: string | null
  lote_nome: string | null
  ordem_trato: number
  kg_planejado: number | null
  kg_ofertado_real: number | null
  leitura_cocho_nota: number | null
  nome_usuario: string | null
  origem: string | null
}

interface RegistroLeitura {
  id: string
  data: string
  pasto_curral: string | null
  curral_id: string | null
  lote: string | null
  lote_id: string | null
  lote_nome: string | null
  leitura_cocho: number | null
  responsavel: string | null
  nome_usuario: string | null
}

interface Opcao {
  id: string
  nome: string
}

interface EditTratoForm {
  data: string
  hora: string
  curral_id: string
  lote_id: string
  ordem_trato: string
  kg_planejado: string
  kg_ofertado_real: string
  leitura_cocho_nota: string
}

interface EditLeituraForm {
  data: string
  hora: string
  pasto_curral: string
  curral_id: string
  lote_id: string
  leitura_cocho: string
  responsavel: string
}

const DESCRICOES_NOTA: Record<number, string> = {
  [-1]: 'Cocho vazio (lambido)',
  0: 'Cocho limpo (sem sobras)',
  1: 'Poucas sobras (rapinha)',
  2: 'Sobras moderadas',
  3: 'Sobras em excesso',
}

const NOTAS_OPCOES = [
  { value: '', label: 'Sem nota' },
  ...[-1, 0, 1, 2, 3].map(n => ({ value: String(n), label: `${n} - ${DESCRICOES_NOTA[n]}` })),
]

function notaBadgeClass(nota: number | null): string {
  switch (nota) {
    case -1: return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30'
    case 0: return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30'
    case 1: return 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
    case 2: return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30'
    case 3: return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30'
    default: return 'bg-surface-2 text-content-muted border-border-base'
  }
}

function formatKg(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Meia-noite do dia (YYYY-MM-DD) no fuso da fazenda, como ISO UTC. */
function farmDayStartIso(dateStr: string): string {
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: FARM_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const offset = (offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '')
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString()
}

/** Converte data + hora de parede no fuso da fazenda para ISO UTC. */
function farmDateTimeToIso(dateStr: string, timeStr: string): string {
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: FARM_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${dateStr}T${timeStr || '00:00'}:00Z`))
  const offset = (offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-04:00').replace('GMT', '')
  return new Date(`${dateStr}T${timeStr || '00:00'}:00${offset}`).toISOString()
}

/** Extrai hora (HH:mm) de um timestamptz no fuso da fazenda. */
function toFarmTimeOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return '00:00'
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FARM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateStr))
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00'
  return `${get('hour')}:${get('minute')}`
}

const PER_PAGE = 25

export function RegistrosTratosLeituras() {
  const { user } = useAuth()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [aba, setAba] = useState<Aba>('tratos')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hoje = new Date()
  const trintaAtras = new Date()
  trintaAtras.setDate(trintaAtras.getDate() - 30)
  const [dataInicio, setDataInicio] = useState(formatDateInput(trintaAtras))
  const [dataFim, setDataFim] = useState(formatDateInput(hoje))
  const [loteFiltro, setLoteFiltro] = useState('')
  const [curralFiltro, setCurralFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)

  const [lotes, setLotes] = useState<Opcao[]>([])
  const [currais, setCurrais] = useState<Opcao[]>([])
  const [tratos, setTratos] = useState<RegistroTrato[]>([])
  const [leituras, setLeituras] = useState<RegistroLeitura[]>([])

  const [editTrato, setEditTrato] = useState<RegistroTrato | null>(null)
  const [editLeitura, setEditLeitura] = useState<RegistroLeitura | null>(null)
  const [formTrato, setFormTrato] = useState<EditTratoForm | null>(null)
  const [formLeitura, setFormLeitura] = useState<EditLeituraForm | null>(null)
  const [deleteTrato, setDeleteTrato] = useState<RegistroTrato | null>(null)
  const [deleteLeitura, setDeleteLeitura] = useState<RegistroLeitura | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const canManage = !!user && (user.papel === 'admin' || user.papel === 'controller')

  const loadFazenda = useCallback(async () => {
    if (!user) {
      setLoadingFazenda(false)
      return
    }
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    setLoadingFazenda(false)
  }, [user])

  useEffect(() => {
    loadFazenda()
  }, [loadFazenda])

  useEffect(() => {
    if (!fazendaId) return
    supabase
      .from('lotes')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setLotes((data || []) as Opcao[]))
    supabase
      .from('currais')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setCurrais((data || []) as Opcao[]))
  }, [fazendaId])

  const loadData = useCallback(async () => {
    if (!fazendaId || !dataInicio || !dataFim) return
    if (dataInicio > dataFim) {
      setError('A data de início deve ser anterior ou igual à data de fim.')
      return
    }
    setLoading(true)
    setError(null)
    setPage(1)

    try {
      const inicioIso = farmDayStartIso(dataInicio)
      const fimDate = new Date(`${dataFim}T00:00:00`)
      fimDate.setDate(fimDate.getDate() + 1)
      const fimIso = farmDayStartIso(formatDateInput(fimDate))

      if (aba === 'tratos') {
        let query = supabase
          .from('registros_oferta_trato')
          .select('id, data, curral_id, lote_id, ordem_trato, kg_planejado, kg_ofertado_real, leitura_cocho_nota, nome_usuario, origem, lotes(nome), currais(nome)')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .gte('data', inicioIso)
          .lt('data', fimIso)
          .order('data', { ascending: false })
          .order('ordem_trato', { ascending: true })
          .limit(1000)

        if (loteFiltro) query = query.eq('lote_id', loteFiltro)
        if (curralFiltro) query = query.eq('curral_id', curralFiltro)

        const { data, error: err } = await query
        if (err) throw err
        setTratos((data || []).map((r: any) => ({
          id: r.id,
          data: r.data,
          curral_id: r.curral_id,
          curral_nome: r.currais?.nome ?? null,
          lote_id: r.lote_id,
          lote_nome: r.lotes?.nome ?? null,
          ordem_trato: r.ordem_trato,
          kg_planejado: r.kg_planejado,
          kg_ofertado_real: r.kg_ofertado_real,
          leitura_cocho_nota: r.leitura_cocho_nota,
          nome_usuario: r.nome_usuario,
          origem: r.origem,
        })))
      } else {
        let query = supabase
          .from('registros_leitura_cocho')
          .select('id, data, pasto_curral, curral_id, lote, lote_id, leitura_cocho, responsavel, nome_usuario, lotes(nome)')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .gte('data', inicioIso)
          .lt('data', fimIso)
          .order('data', { ascending: false })
          .limit(1000)

        if (loteFiltro) query = query.eq('lote_id', loteFiltro)
        if (curralFiltro) query = query.eq('curral_id', curralFiltro)

        const { data, error: err } = await query
        if (err) throw err
        setLeituras((data || []).map((r: any) => ({
          id: r.id,
          data: r.data,
          pasto_curral: r.pasto_curral,
          curral_id: r.curral_id,
          lote: r.lote,
          lote_id: r.lote_id,
          lote_nome: r.lotes?.nome ?? r.lote ?? null,
          leitura_cocho: r.leitura_cocho,
          responsavel: r.responsavel,
          nome_usuario: r.nome_usuario,
        })))
      }
    } catch (err) {
      console.error('Erro ao carregar registros:', err)
      setError('Não foi possível carregar os registros. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [fazendaId, aba, dataInicio, dataFim, loteFiltro, curralFiltro])

  useEffect(() => {
    if (fazendaId) loadData()
  }, [fazendaId, aba, loadData])

  const tratosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return tratos
    return tratos.filter(t =>
      t.curral_nome?.toLowerCase().includes(termo) ||
      t.lote_nome?.toLowerCase().includes(termo) ||
      t.nome_usuario?.toLowerCase().includes(termo)
    )
  }, [tratos, busca])

  const leiturasFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return leituras
    return leituras.filter(l =>
      l.pasto_curral?.toLowerCase().includes(termo) ||
      l.lote_nome?.toLowerCase().includes(termo) ||
      l.responsavel?.toLowerCase().includes(termo) ||
      l.nome_usuario?.toLowerCase().includes(termo)
    )
  }, [leituras, busca])

  const openEditTrato = (t: RegistroTrato) => {
    setFormTrato({
      data: toFarmDateOnly(t.data) || '',
      hora: toFarmTimeOnly(t.data),
      curral_id: t.curral_id,
      lote_id: t.lote_id || '',
      ordem_trato: String(t.ordem_trato),
      kg_planejado: t.kg_planejado?.toString() || '',
      kg_ofertado_real: t.kg_ofertado_real?.toString() || '',
      leitura_cocho_nota: t.leitura_cocho_nota != null ? String(t.leitura_cocho_nota) : '',
    })
    setFormError(null)
    setEditTrato(t)
  }

  const openEditLeitura = (l: RegistroLeitura) => {
    setFormLeitura({
      data: toFarmDateOnly(l.data) || '',
      hora: toFarmTimeOnly(l.data),
      pasto_curral: l.pasto_curral || '',
      curral_id: l.curral_id || '',
      lote_id: l.lote_id || '',
      leitura_cocho: l.leitura_cocho != null ? String(l.leitura_cocho) : '',
      responsavel: l.responsavel || '',
    })
    setFormError(null)
    setEditLeitura(l)
  }

  const handleSaveTrato = async () => {
    if (!editTrato || !formTrato || !user || !fazendaId || submitting) return
    if (!formTrato.data || !formTrato.curral_id) {
      setFormError('Data e curral são obrigatórios.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const campos: Record<string, unknown> = {
        data: farmDateTimeToIso(formTrato.data, formTrato.hora),
        curral_id: formTrato.curral_id,
        lote_id: formTrato.lote_id || null,
        ordem_trato: parseInt(formTrato.ordem_trato, 10) || 1,
        kg_planejado: formTrato.kg_planejado ? parseFloat(formTrato.kg_planejado) : null,
        kg_ofertado_real: formTrato.kg_ofertado_real ? parseFloat(formTrato.kg_ofertado_real) : null,
        leitura_cocho_nota: formTrato.leitura_cocho_nota !== '' ? parseInt(formTrato.leitura_cocho_nota, 10) : null,
      }
      const { error } = await supabase.rpc('editar_registro_oferta_trato', {
        p_id: editTrato.id,
        p_fazenda_id: fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_campos: campos,
      })
      if (error) {
        setFormError(error.code === '23505'
          ? 'Já existe um trato para este curral nesta data e ordem.'
          : error.message || 'Erro ao salvar edição')
        return
      }
      toast.success('Trato atualizado com sucesso.')
      setEditTrato(null)
      loadData()
    } catch (err) {
      console.error('Erro ao editar trato:', err)
      setFormError('Erro inesperado ao salvar edição')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveLeitura = async () => {
    if (!editLeitura || !formLeitura || !user || !fazendaId || submitting) return
    if (!formLeitura.data) {
      setFormError('Data é obrigatória.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const loteSelecionado = lotes.find(l => l.id === formLeitura.lote_id)
      const campos: Record<string, unknown> = {
        data: farmDateTimeToIso(formLeitura.data, formLeitura.hora),
        pasto_curral: formLeitura.pasto_curral || null,
        curral_id: formLeitura.curral_id || null,
        lote_id: formLeitura.lote_id || null,
        lote: loteSelecionado?.nome || null,
        leitura_cocho: formLeitura.leitura_cocho !== '' ? parseInt(formLeitura.leitura_cocho, 10) : null,
        responsavel: formLeitura.responsavel || null,
      }
      const { error } = await supabase.rpc('editar_registro_leitura_cocho', {
        p_id: editLeitura.id,
        p_fazenda_id: fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
        p_campos: campos,
      })
      if (error) {
        setFormError(error.code === '23505'
          ? 'Já existe uma leitura para este curral nesta data.'
          : error.message || 'Erro ao salvar edição')
        return
      }
      toast.success('Leitura atualizada com sucesso.')
      setEditLeitura(null)
      loadData()
    } catch (err) {
      console.error('Erro ao editar leitura:', err)
      setFormError('Erro inesperado ao salvar edição')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTrato = async () => {
    if (!deleteTrato || !user || !fazendaId) return
    const { error } = await supabase.rpc('excluir_registro_oferta_trato', {
      p_id: deleteTrato.id,
      p_fazenda_id: fazendaId,
      p_usuario_id: user.id,
      p_usuario_email: user.email,
    })
    if (error) {
      toast.error(error.message || 'Erro ao excluir trato')
      return
    }
    toast.success('Trato excluído com sucesso.')
    setTratos(prev => prev.filter(t => t.id !== deleteTrato.id))
  }

  const handleDeleteLeitura = async () => {
    if (!deleteLeitura || !user || !fazendaId) return
    const { error } = await supabase.rpc('excluir_registro_leitura_cocho', {
      p_id: deleteLeitura.id,
      p_fazenda_id: fazendaId,
      p_usuario_id: user.id,
      p_usuario_email: user.email,
    })
    if (error) {
      toast.error(error.message || 'Erro ao excluir leitura')
      return
    }
    toast.success('Leitura excluída com sucesso.')
    setLeituras(prev => prev.filter(l => l.id !== deleteLeitura.id))
  }

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <CardSkeleton />
      </div>
    )
  }

  const registrosAtivos = aba === 'tratos' ? tratosFiltrados : leiturasFiltradas
  const pageItems = registrosAtivos.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Registros de Tratos e Leituras</h1>
        <p className="text-sm text-content-muted mt-1">
          Edite ou exclua registros de oferta de trato e leituras de cocho lançados pelo aplicativo ou pelo painel.
          Todas as alterações ficam registradas na auditoria.
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-border-base">
        {(['tratos', 'leituras'] as Aba[]).map(a => (
          <button
            key={a}
            onClick={() => { setAba(a); setPage(1); setBusca('') }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              aba === a
                ? 'bg-surface-1 text-content-strong border border-b-0 border-border-base'
                : 'text-content-muted hover:text-content-strong'
            }`}
          >
            {a === 'tratos' ? 'Tratos' : 'Leituras de cocho'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input
            label="Data início"
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
          />
          <Input
            label="Data fim"
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
          />
          <Select
            label="Lote"
            options={[{ value: '', label: 'Todos' }, ...lotes.map(l => ({ value: l.id, label: l.nome }))]}
            value={loteFiltro}
            onChange={setLoteFiltro}
          />
          <Select
            label="Curral"
            options={[{ value: '', label: 'Todos' }, ...currais.map(c => ({ value: c.id, label: c.nome }))]}
            value={curralFiltro}
            onChange={setCurralFiltro}
          />
          <div>
            <label className="block text-sm font-medium text-content mb-1">Buscar</label>
            <SearchInput
              value={busca}
              onChange={setBusca}
              placeholder={aba === 'tratos' ? 'Curral, lote ou usuário' : 'Curral, lote ou responsável'}
            />
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <CardSkeleton />
      ) : registrosAtivos.length === 0 ? (
        <div className="p-6 bg-surface-2 rounded-xl border-2 border-border-base text-center">
          <p className="text-sm text-content-muted">Nenhum registro encontrado no período.</p>
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-content-muted">
                <th className="p-3 font-medium">Data</th>
                {aba === 'tratos' ? (
                  <>
                    <th className="p-3 font-medium">Curral</th>
                    <th className="p-3 font-medium">Lote</th>
                    <th className="p-3 font-medium">Trato</th>
                    <th className="p-3 font-medium text-right">Kg planejado</th>
                    <th className="p-3 font-medium text-right">Kg real</th>
                    <th className="p-3 font-medium">Leitura</th>
                    <th className="p-3 font-medium">Usuário</th>
                    <th className="p-3 font-medium">Origem</th>
                  </>
                ) : (
                  <>
                    <th className="p-3 font-medium">Pasto/Curral</th>
                    <th className="p-3 font-medium">Lote</th>
                    <th className="p-3 font-medium">Nota</th>
                    <th className="p-3 font-medium">Responsável</th>
                    <th className="p-3 font-medium">Usuário</th>
                  </>
                )}
                {canManage && <th className="p-3 font-medium text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {aba === 'tratos'
                ? (pageItems as RegistroTrato[]).map(t => (
                    <tr key={t.id} className="border-b border-border-subtle hover:bg-surface-2">
                      <td className="p-3 text-content whitespace-nowrap">{formatDateTime(t.data)}</td>
                      <td className="p-3 text-content">{t.curral_nome || '—'}</td>
                      <td className="p-3 text-content">{t.lote_nome || '—'}</td>
                      <td className="p-3 text-content">{t.ordem_trato}º</td>
                      <td className="p-3 text-content text-right">{formatKg(t.kg_planejado)}</td>
                      <td className="p-3 text-content text-right">{formatKg(t.kg_ofertado_real)}</td>
                      <td className="p-3">
                        {t.leitura_cocho_nota != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${notaBadgeClass(t.leitura_cocho_nota)}`}>
                            {t.leitura_cocho_nota}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-content-muted">{t.nome_usuario || '—'}</td>
                      <td className="p-3 text-content-muted">{t.origem || '—'}</td>
                      {canManage && (
                        <td className="p-3 text-right whitespace-nowrap">
                          <Button variant="secondary" size="sm" onClick={() => openEditTrato(t)}>Editar</Button>{' '}
                          <Button variant="danger" size="sm" onClick={() => setDeleteTrato(t)}>Excluir</Button>
                        </td>
                      )}
                    </tr>
                  ))
                : (pageItems as RegistroLeitura[]).map(l => (
                    <tr key={l.id} className="border-b border-border-subtle hover:bg-surface-2">
                      <td className="p-3 text-content whitespace-nowrap">{formatDateTime(l.data)}</td>
                      <td className="p-3 text-content">{l.pasto_curral || '—'}</td>
                      <td className="p-3 text-content">{l.lote_nome || '—'}</td>
                      <td className="p-3">
                        {l.leitura_cocho != null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${notaBadgeClass(l.leitura_cocho)}`}
                            title={DESCRICOES_NOTA[l.leitura_cocho]}
                          >
                            {l.leitura_cocho}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-3 text-content">{l.responsavel || '—'}</td>
                      <td className="p-3 text-content-muted">{l.nome_usuario || '—'}</td>
                      {canManage && (
                        <td className="p-3 text-right whitespace-nowrap">
                          <Button variant="secondary" size="sm" onClick={() => openEditLeitura(l)}>Editar</Button>{' '}
                          <Button variant="danger" size="sm" onClick={() => setDeleteLeitura(l)}>Excluir</Button>
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={page}
        totalItems={registrosAtivos.length}
        perPage={PER_PAGE}
        onPageChange={setPage}
      />

      {/* Modal edição de trato */}
      <Modal
        isOpen={!!editTrato}
        onClose={() => setEditTrato(null)}
        title="Editar trato"
        size="md"
      >
        {formTrato && (
          <div className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Data"
                type="date"
                value={formTrato.data}
                onChange={e => setFormTrato({ ...formTrato, data: e.target.value })}
              />
              <Input
                label="Hora"
                type="time"
                value={formTrato.hora}
                onChange={e => setFormTrato({ ...formTrato, hora: e.target.value })}
              />
            </div>
            <Select
              label="Curral"
              options={currais.map(c => ({ value: c.id, label: c.nome }))}
              value={formTrato.curral_id}
              onChange={v => setFormTrato({ ...formTrato, curral_id: v })}
            />
            <Select
              label="Lote"
              options={[{ value: '', label: 'Sem lote' }, ...lotes.map(l => ({ value: l.id, label: l.nome }))]}
              value={formTrato.lote_id}
              onChange={v => setFormTrato({ ...formTrato, lote_id: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ordem do trato"
                type="number"
                min={1}
                value={formTrato.ordem_trato}
                onChange={e => setFormTrato({ ...formTrato, ordem_trato: e.target.value })}
              />
              <Select
                label="Leitura de cocho"
                options={NOTAS_OPCOES}
                value={formTrato.leitura_cocho_nota}
                onChange={v => setFormTrato({ ...formTrato, leitura_cocho_nota: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Kg planejado"
                type="number"
                step="0.1"
                min={0}
                value={formTrato.kg_planejado}
                onChange={e => setFormTrato({ ...formTrato, kg_planejado: e.target.value })}
              />
              <Input
                label="Kg ofertado (real)"
                type="number"
                step="0.1"
                min={0}
                value={formTrato.kg_ofertado_real}
                onChange={e => setFormTrato({ ...formTrato, kg_ofertado_real: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditTrato(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSaveTrato} disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal edição de leitura */}
      <Modal
        isOpen={!!editLeitura}
        onClose={() => setEditLeitura(null)}
        title="Editar leitura de cocho"
        size="md"
      >
        {formLeitura && (
          <div className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Data"
                type="date"
                value={formLeitura.data}
                onChange={e => setFormLeitura({ ...formLeitura, data: e.target.value })}
              />
              <Input
                label="Hora"
                type="time"
                value={formLeitura.hora}
                onChange={e => setFormLeitura({ ...formLeitura, hora: e.target.value })}
              />
            </div>
            <Select
              label="Curral (confinamento)"
              options={[{ value: '', label: 'Nenhum (leitura de pasto)' }, ...currais.map(c => ({ value: c.id, label: c.nome }))]}
              value={formLeitura.curral_id}
              onChange={v => setFormLeitura({ ...formLeitura, curral_id: v })}
            />
            {!formLeitura.curral_id && (
              <Input
                label="Pasto/Curral (texto livre)"
                value={formLeitura.pasto_curral}
                onChange={e => setFormLeitura({ ...formLeitura, pasto_curral: e.target.value })}
              />
            )}
            <Select
              label="Lote"
              options={[{ value: '', label: 'Sem lote' }, ...lotes.map(l => ({ value: l.id, label: l.nome }))]}
              value={formLeitura.lote_id}
              onChange={v => setFormLeitura({ ...formLeitura, lote_id: v })}
            />
            <Select
              label="Nota de leitura"
              options={NOTAS_OPCOES.filter(o => o.value !== '')}
              value={formLeitura.leitura_cocho}
              onChange={v => setFormLeitura({ ...formLeitura, leitura_cocho: v })}
            />
            <Input
              label="Responsável"
              value={formLeitura.responsavel}
              onChange={e => setFormLeitura({ ...formLeitura, responsavel: e.target.value })}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditLeitura(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSaveLeitura} disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmações de exclusão */}
      <ConfirmModal
        isOpen={!!deleteTrato}
        onClose={() => setDeleteTrato(null)}
        onConfirm={handleDeleteTrato}
        title="Excluir trato"
        message={`Confirma a exclusão do trato ${deleteTrato?.ordem_trato}º de ${deleteTrato?.curral_nome || 'curral'} em ${deleteTrato ? formatDate(deleteTrato.data) : ''}?\n\nO registro será marcado como excluído e sairá dos relatórios. A operação fica registrada na auditoria.`}
        confirmText="Excluir"
        variant="danger"
      />
      <ConfirmModal
        isOpen={!!deleteLeitura}
        onClose={() => setDeleteLeitura(null)}
        onConfirm={handleDeleteLeitura}
        title="Excluir leitura de cocho"
        message={`Confirma a exclusão da leitura de ${deleteLeitura?.pasto_curral || 'curral'} em ${deleteLeitura ? formatDate(deleteLeitura.data) : ''}?\n\nO registro será marcado como excluído e sairá dos relatórios. A operação fica registrada na auditoria.`}
        confirmText="Excluir"
        variant="danger"
      />
    </div>
  )
}
