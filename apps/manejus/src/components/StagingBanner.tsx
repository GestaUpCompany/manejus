import { isStaging } from '../utils/ambiente'

/**
 * Selo fixo que avisa que este é o ambiente de staging. O staging usa o banco de produção:
 * testar apenas com conta vinculada à fazenda de testes. Em produção não renderiza nada.
 */
export function StagingBanner() {
  if (!isStaging()) return null

  return (
    <div
      role="status"
      title="Ambiente de staging com o banco de produção. Use apenas a fazenda de testes."
      className="pointer-events-none fixed bottom-3 left-3 z-[100] rounded-full bg-red-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg"
    >
      Staging · banco de produção · só fazenda de testes
    </div>
  )
}
