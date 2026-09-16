import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import { setSelectedFazendaId } from '../../utils/fazendaContext'
import { Modal } from '../ui'

interface FazendaSimplificada {
  id: string
  nome: string
  acesso_id: string
  grupo_id: string | null
}

interface GrupoInfo {
  id: string
  nome: string
}

export function FarmSwitcher() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const [grupo, setGrupo] = useState<GrupoInfo | null>(null)
  const [fazendasDoGrupo, setFazendasDoGrupo] = useState<FazendaSimplificada[]>([])
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [selectedFazenda, setSelectedFazenda] = useState<FazendaSimplificada | null>(null)
  const [password, setPassword] = useState('')
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fazenda?.grupo_id) {
      setGrupo(null)
      setFazendasDoGrupo([])
      return
    }

    const loadData = async () => {
      const { data: grupoData } = await supabase
        .from('grupos_fazenda')
        .select('id, nome')
        .eq('id', fazenda.grupo_id!)
        .single()

      if (grupoData) setGrupo(grupoData)

      const { data: fazendasData } = await supabase
        .from('fazendas')
        .select('id, nome, acesso_id, grupo_id')
        .eq('grupo_id', fazenda.grupo_id!)
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (fazendasData) setFazendasDoGrupo(fazendasData)
    }

    loadData()
  }, [fazenda?.grupo_id])

  // Usa fazenda.id (do hook useFazenda, assincrono) como unica fonte de verdade.
  // Antes usava getSelectedFazendaId() || fazenda?.id, que podia ser undefined
  // no primeiro render e fazer a fazenda atual aparecer na lista de troca.
  const currentFazendaId = fazenda?.id

  const outrasFazendas = currentFazendaId
    ? fazendasDoGrupo.filter(f => f.id !== currentFazendaId)
    : []

  const handleSwitchClick = (target: FazendaSimplificada) => {
    setSelectedFazenda(target)
    setPassword('')
    setError('')
    setShowSwitchModal(true)
  }

  const handleSwitch = async () => {
    if (!selectedFazenda || !user || !fazenda?.id) return
    setSwitching(true)
    setError('')

    try {
      // Buscar o email do controller da fazenda de destino via RPC
      // (bypassa RLS de usuario_fazenda, mas valida que as fazendas
      // pertencem ao mesmo grupo)
      const { data: controllerEmail, error: rpcError } = await supabase
        .rpc('get_controller_email_fazenda_grupo', {
          p_fazenda_origem_id: fazenda.id,
          p_fazenda_destino_id: selectedFazenda.id,
        })

      if (rpcError) {
        setError('Erro ao buscar controller da fazenda')
        setSwitching(false)
        return
      }

      if (!controllerEmail) {
        setError('Nenhum controller encontrado para esta fazenda')
        setSwitching(false)
        return
      }

      // Validar senha tentando signIn SEM deslogar antes.
      // Se a senha estiver errada, a sessão atual permanece intacta e o erro
      // fica contido no modal. Se estiver certa, o Supabase substitui a sessão
      // automaticamente.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: controllerEmail,
        password: password,
      })

      if (authError) {
        setError('Senha incorreta. Verifique e tente novamente.')
        setSwitching(false)
        return
      }

      // Atualizar o selectedFazendaId no localStorage
      setSelectedFazendaId(selectedFazenda.id)

      // Recarregar a página para re-inicializar o contexto
      window.location.href = '/controller/dashboard'
    } catch (err) {
      setError('Erro ao trocar de fazenda')
      setSwitching(false)
    }
  }

  if (!grupo) return null

  return (
    <>
      <div className="border-t-2 border-border-base p-4">
        <div className="bg-primary/10 p-3 rounded-lg space-y-3">
          <div>
            <p className="text-[10px] text-primary dark:text-white font-semibold uppercase tracking-wider">Grupo</p>
            <p className="text-sm font-medium text-content-strong truncate">{grupo.nome}</p>
          </div>
          <div className="border-t border-primary/20 pt-2">
            <p className="text-[10px] text-content dark:text-content-strong uppercase tracking-wider">Fazenda atual</p>
            <p className="text-sm font-medium text-content-strong truncate">{fazenda?.nome || '...'}</p>
          </div>
          {outrasFazendas.length > 0 && (
            <div className="border-t border-primary/20 pt-2">
              <p className="text-[10px] text-content dark:text-content-strong uppercase tracking-wider mb-1.5">Trocar para</p>
              <div className="space-y-0.5">
                {outrasFazendas.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleSwitchClick(f)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-content-strong hover:bg-primary/20 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-primary dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span className="truncate">{f.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showSwitchModal}
        onClose={() => setShowSwitchModal(false)}
        title="Trocar de Fazenda"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-content-muted mb-2">
              Você está prestes a trocar para a fazenda:
            </p>
            <p className="font-bold text-content-strong">{selectedFazenda?.nome}</p>
            <p className="text-xs text-content-muted">Acesso: {selectedFazenda?.acesso_id}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-content mb-1">
              Senha do Controller *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha"
              autoFocus
              className="w-full px-4 py-3 bg-surface-1 text-content-strong placeholder-content-faint border-2 border-surface-3 rounded-lg focus:outline-none focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && !switching) {
                  handleSwitch()
                }
              }}
            />
            <p className="text-xs text-content-muted mt-1">
              O email do controller desta fazenda já é conhecido. Você só precisa digitar a senha.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowSwitchModal(false)}
              className="px-4 py-2 text-sm font-medium text-content bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSwitch}
              disabled={switching || !password}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {switching ? 'Trocando...' : 'Trocar Fazenda'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
