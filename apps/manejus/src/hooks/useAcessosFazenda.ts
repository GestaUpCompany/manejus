import { useAuth } from '@gestaup/shared'
import { useFazenda } from './useDashboardQueries'

export interface AcessosFazenda {
  fazendaId: string | undefined
  /** fazendas.acesso_iatf (toggle no admin). Indefinido enquanto a fazenda carrega: trate como "sem acesso". */
  acessoIatf: boolean | undefined
}

/** Id e flags de acesso da fazenda do usuário, para decidir o que aparece nos menus e nas listas. */
export function useAcessosFazenda(): AcessosFazenda {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  return {
    fazendaId: fazenda?.id,
    acessoIatf: fazenda ? fazenda.acesso_iatf === true : undefined,
  }
}
