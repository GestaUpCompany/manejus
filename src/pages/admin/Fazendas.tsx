import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFazendas, Fazenda, updateFazenda } from '../../services/fazendasService'
import { getGrupos, GrupoFazenda } from '../../services/gruposService'
import { Button, Card } from '../../components/ui'

export function FazendasList() {
  const navigate = useNavigate()
  const [fazendas, setFazendas] = useState<Fazenda[]>([])
  const [grupos, setGrupos] = useState<GrupoFazenda[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFazendas()
    getGrupos().then(setGrupos)
  }, [])

  const loadFazendas = async () => {
    setLoading(true)
    const data = await getFazendas()
    setFazendas(data)
    setLoading(false)
  }

  const toggleAtivo = async (fazenda: Fazenda) => {
    const result = await updateFazenda(fazenda.id, { ativo: !fazenda.ativo })
    if (result) {
      loadFazendas()
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Fazendas</h2>
        <Button onClick={() => navigate('/admin/fazendas/nova')} className="w-full sm:w-auto text-sm">
          Nova Fazenda
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-600">Carregando...</p>
      ) : fazendas.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center">
          <p className="text-gray-600 mb-4">Nenhuma fazenda cadastrada</p>
          <Button onClick={() => navigate('/admin/fazendas/nova')} className="text-sm">
            Criar Primeira Fazenda
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {fazendas.map((fazenda) => (
            <Card
              key={fazenda.id}
              className="bg-white p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/admin/fazendas/${fazenda.id}/detalhes`)}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                {fazenda.logo_url ? (
                  <img
                    src={fazenda.logo_url}
                    alt={fazenda.nome}
                    loading="lazy"
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl sm:text-2xl text-gray-400">F</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 mb-1 text-sm sm:text-base truncate">{fazenda.nome}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2">ID: {fazenda.acesso_id}</p>
                  {fazenda.grupo_id && (
                    <p className="text-xs text-blue-600 mb-1">
                      {grupos.find(g => g.id === fazenda.grupo_id)?.nome || 'Grupo'}
                    </p>
                  )}
                  {fazenda.email && (
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{fazenda.email}</p>
                  )}
                  {fazenda.telefone && (
                    <p className="text-xs sm:text-sm text-gray-600 truncate">{fazenda.telefone}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <span
                  className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm ${
                    fazenda.ativo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {fazenda.ativo ? 'Ativa' : 'Inativa'}
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleAtivo(fazenda)
                    }}
                    className="flex-1 sm:flex-none text-xs sm:text-sm"
                  >
                    {fazenda.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/admin/fazendas/${fazenda.id}`)
                    }}
                    className="flex-1 sm:flex-none text-xs sm:text-sm"
                  >
                    Editar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
