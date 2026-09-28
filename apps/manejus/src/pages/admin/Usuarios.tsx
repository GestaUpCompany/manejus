import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUsuarios, Usuario } from '../../services/usuariosService'
import { Button, Card } from '../../components/ui'

const ONLINE_THRESHOLD_MINUTES = 5

function getStatusInfo(ultimoAcesso?: string) {
  if (!ultimoAcesso) {
    return { online: false, text: 'Nunca acessou' }
  }

  const lastAccess = new Date(ultimoAcesso)
  const now = new Date()
  const diffMs = now.getTime() - lastAccess.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < ONLINE_THRESHOLD_MINUTES) {
    return { online: true, text: 'Online' }
  }

  if (diffMinutes < 60) {
    return { online: false, text: `Há ${diffMinutes} min` }
  }

  if (diffHours < 24) {
    return { online: false, text: `Há ${diffHours}h` }
  }

  return { online: false, text: `Há ${diffDays} dia${diffDays === 1 ? '' : 's'}` }
}

export function UsuariosList() {
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsuarios()
  }, [])

  const loadUsuarios = async () => {
    setLoading(true)
    const data = await getUsuarios()
    setUsuarios(data)
    setLoading(false)
  }

  const stats = {
    totalUsuarios: usuarios.length,
    admins: usuarios.filter(u => u.papel === 'admin').length,
    controllers: usuarios.filter(u => u.papel === 'controller').length,
    ativos: usuarios.filter(u => u.ativo).length,
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Usuários</h2>
        <Button onClick={() => navigate('/admin/usuarios/novo')} className="w-full sm:w-auto text-sm">
          Novo Usuário
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
        <Card className="bg-white p-3 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-800 mb-1 sm:mb-2">Total</h3>
          <p className="text-2xl sm:text-4xl font-bold text-primary">{stats.totalUsuarios}</p>
        </Card>
        <Card className="bg-white p-3 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-800 mb-1 sm:mb-2">Admins</h3>
          <p className="text-2xl sm:text-4xl font-bold text-blue-600">{stats.admins}</p>
        </Card>
        <Card className="bg-white p-3 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-800 mb-1 sm:mb-2">Controllers</h3>
          <p className="text-2xl sm:text-4xl font-bold text-green-600">{stats.controllers}</p>
        </Card>
        <Card className="bg-white p-3 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-800 mb-1 sm:mb-2">Ativos</h3>
          <p className="text-2xl sm:text-4xl font-bold text-purple-600">{stats.ativos}</p>
        </Card>
      </div>

      {loading ? (
        <p className="text-gray-600">Carregando...</p>
      ) : usuarios.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center">
          <p className="text-gray-600 mb-4">Nenhum usuário cadastrado</p>
          <Button onClick={() => navigate('/admin/usuarios/novo')} className="text-sm">
            Criar Primeiro Usuário
          </Button>
        </Card>
      ) : (
        <Card className="bg-white p-4 sm:p-6">
          <div className="space-y-2 sm:space-y-3">
            {usuarios.map((usuario) => {
              const status = getStatusInfo(usuario.ultimo_acesso)
              return (
                <div
                  key={usuario.id}
                  className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg cursor-pointer"
                  onClick={() => navigate(`/admin/usuarios/${usuario.id}`)}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm sm:text-lg">
                        {usuario.nome.charAt(0).toUpperCase()}
                      </span>
                      {status.online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-800 text-sm sm:text-base truncate">{usuario.nome}</h3>
                      <p className="text-xs sm:text-sm text-gray-600 truncate">{usuario.email}</p>
                      {usuario.telefone && (
                        <p className="text-xs sm:text-sm text-gray-600 truncate">{usuario.telefone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${
                        status.online
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${status.online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      {status.text}
                    </span>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm capitalize ${
                        usuario.papel === 'admin'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {usuario.papel}
                    </span>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${
                        usuario.ativo
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
