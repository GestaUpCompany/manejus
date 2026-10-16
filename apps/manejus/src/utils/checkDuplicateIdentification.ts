import { supabase } from '@gestaup/supabase'
import { escapeLikeTerm } from './postgrestFilter'

export type IdentificationField = 'id_brinco' | 'id_chip' | 'id_manejo'

export async function checkDuplicateIdentification(
  fazendaId: string,
  field: IdentificationField,
  value: string,
  excludeId?: string
): Promise<boolean> {
  if (!value || value.trim() === '') return false

  let query = supabase
    .from('individuos')
    .select('id')
    .eq('fazenda_id', fazendaId)
    .ilike(field, escapeLikeTerm(value.trim()))
    .is('deleted_at', null)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  // limit(1) em vez de maybeSingle(): com 2 ou mais linhas iguais o maybeSingle devolve erro e o check dizia "sem duplicata"
  const { data, error } = await query.limit(1)

  if (error) {
    console.error(`Erro ao verificar duplicidade de ${field}:`, error)
    return false
  }

  return (data?.length ?? 0) > 0
}

export function getIdentificationLabel(field: IdentificationField): string {
  switch (field) {
    case 'id_brinco':
      return 'Brinco'
    case 'id_chip':
      return 'Chip'
    case 'id_manejo':
      return 'ID Manejo'
  }
}
