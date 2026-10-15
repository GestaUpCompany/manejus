import { useEffect, useState } from 'react'
import { useAuth, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { buscarTodasAsPaginas } from '../features/relatorioAuditoria5s/paginar'
import type { RegistroAuditoria5s } from '../features/relatorioAuditoria5s/agregacao'

export interface RegistroAuditoria5sRow extends RegistroAuditoria5s {
  fazenda_id: string
  created_at: string
  local_id?: string | null
}

export interface SetorCadastrado {
  id: string
  nome: string
}

// Só o que as telas usam (sem `select('*')`); `itens` e `nao_conformidades` são jsonb pequenos.
const COLUNAS =
  'id, fazenda_id, created_at, local_id, data, setor, setor_id, responsavel, nome_usuario, itens, observacoes, nao_conformidades, nota_geral, total_itens, total_conformes, total_nao_conformes, percentual_conformidade'

/**
 * Carrega TODAS as auditorias 5S da fazenda (em páginas, para não truncar em 1.000 linhas) e os setores cadastrados.
 * Uma carga por visita à tela; as abas compartilham o resultado e filtram em memória.
 */
export function useAuditorias5s() {
  const { user } = useAuth()
  const [registros, setRegistros] = useState<RegistroAuditoria5sRow[]>([])
  const [setores, setSetores] = useState<SetorCadastrado[]>([])
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    const carregar = async () => {
      if (!user) return
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        if (!cancelado) setLoading(false)
        return
      }
      getFazendaNome(fazendaId).then((n) => !cancelado && setFazendaNome(n))

      try {
        const [regs, sets] = await Promise.all([
          buscarTodasAsPaginas<RegistroAuditoria5sRow>(async (de, ate) => {
            const { data, error } = await supabase
              .from('registros_auditoria_5s')
              .select(COLUNAS)
              .eq('fazenda_id', fazendaId)
              .is('deleted_at', null)
              .order('data', { ascending: false })
              .order('id', { ascending: true })
              .range(de, ate)
            return { data: data as unknown as RegistroAuditoria5sRow[] | null, error }
          }),
          supabase.from('setores').select('id, nome').eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null),
        ])
        if (cancelado) return
        setRegistros(regs)
        if (!sets.error) setSetores((sets.data ?? []) as SetorCadastrado[])
      } catch (e) {
        console.error('Erro ao buscar auditorias 5S:', e)
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao buscar auditorias')
      }
      if (!cancelado) setLoading(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [user])

  return { registros, setores, fazendaNome, loading, erro }
}
