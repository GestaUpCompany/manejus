import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, useToast } from '@gestaup/ui'
import { CADERNETA_IMAGES, CADERNETA_TITLES, CADERNETA_DESCRIPTIONS } from '../../types/images'
import { useAuth } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'
import { exportAllCadernetas } from '../../utils/exportAllCadernetas'
import { CADERNETA_GRUPOS } from '../../utils/cadernetas'

export function Cadernetas() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

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
        <h2 className="text-2xl font-bold text-content-strong">Cadernetas</h2>
        <Button
          variant="primary"
          onClick={handleExportAll}
          disabled={exporting}
        >
          {exporting ? 'Exportando...' : 'Exportar todas (XLSX)'}
        </Button>
      </div>

      {CADERNETA_GRUPOS.map((grupo) => (
        <div key={grupo.nome}>
          <h3
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: grupo.cor }}
          >
            {grupo.nome}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {grupo.itens.map((item) => {
              const id = item.id as keyof typeof CADERNETA_TITLES
              return (
                <Card
                  key={item.path}
                  className="bg-surface-1 p-6 cursor-pointer  border-0 transition-all"
                  onClick={() => navigate(item.path)}
                >
                  <div className="flex flex-col items-center">
                    <img
                      src={CADERNETA_IMAGES[id]}
                      alt={CADERNETA_TITLES[id]}
                      loading="lazy"
                      className="w-24 h-24 mb-4 rounded-[32px]"
                    />
                    <h3 className="text-xl font-semibold text-content-strong mb-2 text-center">{CADERNETA_TITLES[id]}</h3>
                    <p className="text-sm text-content-muted text-center">{CADERNETA_DESCRIPTIONS[id]}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
