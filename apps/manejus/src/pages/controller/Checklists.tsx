import { useNavigate } from 'react-router-dom'
import { Card } from '@gestaup/ui'
import { CADERNETA_IMAGES, CADERNETA_TITLES, CADERNETA_DESCRIPTIONS } from '../../types/images'
import { CHECKLIST_ITENS } from '../../utils/cadernetas'

/** Checklists e auditorias periódicas da fazenda (fora das cadernetas de registro de campo). */
export function Checklists() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-content-strong">Checklists</h2>
        <p className="text-sm text-content-muted mt-1">Auditorias e verificações periódicas da fazenda.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CHECKLIST_ITENS.map((item) => (
          <Card
            key={item.path}
            className="bg-surface-1 p-6 cursor-pointer border-0 transition-all"
            onClick={() => navigate(item.path)}
          >
            <div className="flex flex-col items-center">
              <img
                src={CADERNETA_IMAGES[item.id]}
                alt={CADERNETA_TITLES[item.id]}
                loading="lazy"
                className="w-24 h-24 mb-4 rounded-[32px]"
              />
              <h3 className="text-xl font-semibold text-content-strong mb-2 text-center">{CADERNETA_TITLES[item.id]}</h3>
              <p className="text-sm text-content-muted text-center">{CADERNETA_DESCRIPTIONS[item.id]}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
