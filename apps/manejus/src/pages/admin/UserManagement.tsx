import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, setAuditContext } from '../../services/supabaseClient'
import { Card } from '../../components/ui'

interface UsuarioGerenciavel {
  id: string
  email: string
  nome: string
  telefone: string | null
  papel: 'admin' | 'super_admin' | 'controller'
  ativo: boolean
  auth_id: string | null
  ultimo_acesso: string | null
  created_at: string
  fazendas: { id: string; nome: string; ativo: boolean }[]
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

function papelColor(papel: string): string {
  switch (papel) {
    case 'super_admin': return 'bg-purple-100 text-purple-700'
    case 'admin': return 'bg-blue-100 text-blue-700'
    case 'controller': return 'bg-gray-100 text-gray-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

function papelLabel(papel: string): string {
  switch (papel) {
    case 'super_admin': return 'Super Admin'
    case 'admin': return 'Admin'
    case 'controller': return 'Controller'
    default: return papel
  }
}

function formatLastAccess(date: string | null): string {
  if (!date) return 'Nunca'
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffHours / 24

  if (diffHours < 1) return 'Agora mesmo'
  if (diffHours < 24) return `Há ${Math.round(diffHours)}h`
  if (diffDays < 30) return `Há ${Math.round(diffDays)} dias`
  return d.toLocaleDateString('pt-BR')
}

export function UserManagement() {
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<UsuarioGerenciavel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [filtroPapel, setFiltroPapel] = useState<string>('')
  const [filtroAtivo, setFiltroAtivo] = useState<string>('')
  const [busca, setBusca] = useState<string>('')

  // Impersonação
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [impersonateReason, setImpersonateReason] = useState('')
  const [impersonateError, setImpersonateError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Buscar todos os usuários
      const { data: usersData, error: usersErr } = await supabase
        .from('usuarios')
        .select('*')
        .order('nome')

      if (usersErr) throw usersErr

      // Buscar vínculos usuário-fazenda
      const { data: vinculosData } = await supabase
        .from('usuario_fazenda')
        .select('usuario_id, fazenda_id, ativo, fazendas(id, nome, ativo)')

      // Mapear vínculos por usuário
      const vinculosMap = new Map<string, { id: string; nome: string; ativo: boolean }[]>()
      vinculosData?.forEach((v: any) => {
        const fazenda = Array.isArray(v.fazendas) ? v.fazendas[0] : v.fazendas
        if (!fazenda) return
        const arr = vinculosMap.get(v.usuario_id) || []
        arr.push({ id: fazenda.id, nome: fazenda.nome, ativo: fazenda.ativo })
        vinculosMap.set(v.usuario_id, arr)
      })

      const usuariosCompletos: UsuarioGerenciavel[] = (usersData || []).map((u: UsuarioGerenciavel) => ({
        ...u,
        fazendas: vinculosMap.get(u.id) || [],
      }))

      setUsuarios(usuariosCompletos)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const usuariosFiltrados = usuarios.filter((u) => {
    if (filtroPapel && u.papel !== filtroPapel) return false
    if (filtroAtivo === 'ativo' && !u.ativo) return false
    if (filtroAtivo === 'inativo' && u.ativo) return false
    if (busca) {
      const term = busca.toLowerCase()
      return u.nome.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
    }
    return true
  })

  const handleImpersonate = async (user: UsuarioGerenciavel) => {
    setImpersonating(user.id)
    setImpersonateError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão não encontrada')

      const response = await fetch(`${supabaseUrl}/functions/v1/impersonate-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: user.id,
          reason: impersonateReason || undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.erro || 'Falha na impersonação')
      }

      const result = await response.json()

      // Salvar dados da impersonação no localStorage
      localStorage.setItem('impersonation_session', JSON.stringify(result.impersonation))

      // Trocar a sessão do Supabase para o usuário alvo
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      })

      if (setSessionError) throw setSessionError

      // Setar contexto de auditoria para o usuário impersonado,
      // marcando is_impersonation=true e impersonated_by=super_admin_id
      // para que os triggers de audit_log registrem corretamente
      await setAuditContext({
        id: result.impersonation.targetUserId,
        email: result.impersonation.targetUserEmail,
        nome: result.impersonation.targetUserNome,
      })

      // Redirecionar para o dashboard apropriado
      if (result.impersonation.targetFazendaId) {
        navigate('/controller/dashboard')
      } else {
        navigate('/admin/dashboard')
      }
      // Recarregar para reinit o AuthContext com o novo usuário
      window.location.reload()
    } catch (e) {
      setImpersonateError(e instanceof Error ? e.message : 'Erro na impersonação')
    } finally {
      setImpersonating(null)
    }
  }

  const handleToggleAtivo = async (user: UsuarioGerenciavel) => {
    if (user.papel === 'super_admin') return
    try {
      const { error: err } = await supabase
        .from('usuarios')
        .update({ ativo: !user.ativo })
        .eq('id', user.id)
      if (err) throw err
      fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar status')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Gestão de Usuários</h1>
        <p className="text-sm text-gray-500 mt-1">
          Todos os usuários da plataforma ({usuarios.length} total)
        </p>
      </div>

      {/* Filtros */}
      <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Buscar</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou email..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Papel</label>
            <select
              value={filtroPapel}
              onChange={(e) => setFiltroPapel(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="controller">Controller</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              value={filtroAtivo}
              onChange={(e) => setFiltroAtivo(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {impersonateError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Erro ao impersonar: {impersonateError}
        </div>
      )}

      {/* Lista de usuários */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Carregando...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {usuariosFiltrados.map((user) => (
            <Card key={user.id} className="bg-white shadow-sm rounded-lg border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{user.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${papelColor(user.papel)}`}>
                      {papelLabel(user.papel)}
                    </span>
                    {!user.ativo && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p>{user.email}{user.telefone ? ` | ${user.telefone}` : ''}</p>
                    <p>
                      Último acesso: <span className="font-medium">{formatLastAccess(user.ultimo_acesso)}</span>
                      {' | '}Cadastrado em: <span className="font-medium">{new Date(user.created_at).toLocaleDateString('pt-BR')}</span>
                    </p>
                    {user.fazendas.length > 0 && (
                      <p>
                        Fazendas: {user.fazendas.map((f) => f.nome).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  {user.papel !== 'super_admin' && (
                    <>
                      <button
                        onClick={() => handleImpersonate(user)}
                        disabled={impersonating !== null}
                        className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                        title="Entrar no sistema como este usuário"
                      >
                        {impersonating === user.id ? 'Entrando...' : 'Impersonar'}
                      </button>
                      <button
                        onClick={() => handleToggleAtivo(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                          user.ativo
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {user.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Campo de motivo para impersonação */}
              {impersonating === user.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <input
                    type="text"
                    value={impersonateReason}
                    onChange={(e) => setImpersonateReason(e.target.value)}
                    placeholder="Motivo da impersonação (opcional, fica registrado na auditoria)"
                    className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Você entrará no sistema como {user.nome}. Um banner vermelho aparecerá no topo. A sessão expira em 1 hora.
                  </p>
                </div>
              )}
            </Card>
          ))}
          {usuariosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">Nenhum usuário encontrado com os filtros aplicados</p>
            </div>
          )}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-white p-4 shadow-sm rounded-lg border border-gray-100 text-center">
          <p className="text-2xl font-bold text-gray-800">{usuarios.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total</p>
        </Card>
        <Card className="bg-white p-4 shadow-sm rounded-lg border border-gray-100 text-center">
          <p className="text-2xl font-bold text-green-600">{usuarios.filter(u => u.ativo).length}</p>
          <p className="text-xs text-gray-500 mt-1">Ativos</p>
        </Card>
        <Card className="bg-white p-4 shadow-sm rounded-lg border border-gray-100 text-center">
          <p className="text-2xl font-bold text-blue-600">{usuarios.filter(u => u.ultimo_acesso && new Date(u.ultimo_acesso) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length}</p>
          <p className="text-xs text-gray-500 mt-1">Ativos 24h</p>
        </Card>
        <Card className="bg-white p-4 shadow-sm rounded-lg border border-gray-100 text-center">
          <p className="text-2xl font-bold text-amber-600">{usuarios.filter(u => !u.ultimo_acesso || new Date(u.ultimo_acesso) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}</p>
          <p className="text-xs text-gray-500 mt-1">Inativos 30d+</p>
        </Card>
      </div>
    </div>
  )
}
