import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, useToast } from '../../components/ui'
import { CADERNETA_IMAGES, CADERNETA_TITLES, CADERNETA_DESCRIPTIONS } from '../../types/images'
import { useAuth } from '../../contexts/AuthContext'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { exportAllCadernetas } from '../../utils/exportAllCadernetas'

export function Cadernetas() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  const cadernetas = [
    {
      title: CADERNETA_TITLES.maternidade,
      description: CADERNETA_DESCRIPTIONS.maternidade,
      image: CADERNETA_IMAGES.maternidade,
      path: '/controller/cadernetas/maternidade',
    },
    {
      title: CADERNETA_TITLES.pastagens,
      description: CADERNETA_DESCRIPTIONS.pastagens,
      image: CADERNETA_IMAGES.pastagens,
      path: '/controller/cadernetas/pastagens',
    },
    {
      title: CADERNETA_TITLES.rodeio,
      description: CADERNETA_DESCRIPTIONS.rodeio,
      image: CADERNETA_IMAGES.rodeio,
      path: '/controller/cadernetas/rodeio',
    },
    {
      title: CADERNETA_TITLES.suplementacao,
      description: CADERNETA_DESCRIPTIONS.suplementacao,
      image: CADERNETA_IMAGES.suplementacao,
      path: '/controller/cadernetas/suplementacao',
    },
    {
      title: CADERNETA_TITLES.bebedouros,
      description: CADERNETA_DESCRIPTIONS.bebedouros,
      image: CADERNETA_IMAGES.bebedouros,
      path: '/controller/cadernetas/bebedouros',
    },
    {
      title: CADERNETA_TITLES.movimentacao,
      description: CADERNETA_DESCRIPTIONS.movimentacao,
      image: CADERNETA_IMAGES.movimentacao,
      path: '/controller/cadernetas/movimentacao',
    },
    {
      title: CADERNETA_TITLES.enfermaria,
      description: CADERNETA_DESCRIPTIONS.enfermaria,
      image: CADERNETA_IMAGES.enfermaria,
      path: '/controller/cadernetas/enfermaria',
    },
    {
      title: CADERNETA_TITLES.morte,
      description: CADERNETA_DESCRIPTIONS.morte,
      image: CADERNETA_IMAGES.morte,
      path: '/controller/cadernetas/morte',
    },
    {
      title: CADERNETA_TITLES.clima,
      description: CADERNETA_DESCRIPTIONS.clima,
      image: CADERNETA_IMAGES.clima,
      path: '/controller/cadernetas/clima',
    },
    {
      title: CADERNETA_TITLES.abastecimento,
      description: CADERNETA_DESCRIPTIONS.abastecimento,
      image: CADERNETA_IMAGES.abastecimento,
      path: '/controller/cadernetas/abastecimento',
    },
    {
      title: CADERNETA_TITLES.cantina,
      description: CADERNETA_DESCRIPTIONS.cantina,
      image: CADERNETA_IMAGES.cantina,
      path: '/controller/cadernetas/alimentacao',
    },
    {
      title: CADERNETA_TITLES.limpeza,
      description: CADERNETA_DESCRIPTIONS.limpeza,
      image: CADERNETA_IMAGES.limpeza,
      path: '/controller/cadernetas/limpeza',
    },
    {
      title: CADERNETA_TITLES['operacoes-maquinas'],
      description: CADERNETA_DESCRIPTIONS['operacoes-maquinas'],
      image: CADERNETA_IMAGES['operacoes-maquinas'],
      path: '/controller/cadernetas/operacoes-maquinas',
    },
    {
      title: CADERNETA_TITLES.almoxarifado,
      description: CADERNETA_DESCRIPTIONS.almoxarifado,
      image: CADERNETA_IMAGES.almoxarifado,
      path: '/controller/cadernetas/almoxarifado',
    },
    {
      title: CADERNETA_TITLES['manutencao-maquinas'],
      description: CADERNETA_DESCRIPTIONS['manutencao-maquinas'],
      image: CADERNETA_IMAGES['manutencao-maquinas'],
      path: '/controller/cadernetas/manutencao-maquinas',
    },
    {
      title: CADERNETA_TITLES.problemas,
      description: CADERNETA_DESCRIPTIONS.problemas,
      image: CADERNETA_IMAGES.problemas,
      path: '/controller/cadernetas/problemas',
    },
  ]

  const handleExportAll = async () => {
    if (!user || exporting) return
    setExporting(true)
    try {
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        toast.error('Fazenda não encontrada para o usuário.')
        return
      }
      await exportAllCadernetas(fazendaId)
      toast.success('Cadernetas exportadas com sucesso.')
    } catch (err: any) {
      console.error('Erro ao exportar todas as cadernetas:', err)
      toast.error(err?.message || 'Erro ao exportar cadernetas.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-800">Cadernetas</h2>
        <Button
          variant="primary"
          onClick={handleExportAll}
          disabled={exporting}
        >
          {exporting ? 'Exportando...' : 'Exportar todas (XLSX)'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cadernetas.map((caderneta) => (
          <Card
            key={caderneta.path}
            className="bg-white p-6 cursor-pointer  border-0 transition-all"
            onClick={() => navigate(caderneta.path)}
          >
            <div className="flex flex-col items-center">
              <img
                src={caderneta.image}
                alt={caderneta.title}
                loading="lazy"
                className="w-24 h-24 mb-4 rounded-[32px]"
              />
              <h3 className="text-xl font-semibold text-gray-800 mb-2 text-center">{caderneta.title}</h3>
              <p className="text-sm text-gray-500 text-center">{caderneta.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
