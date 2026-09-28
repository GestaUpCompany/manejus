import { supabase } from '../services/supabaseClient'

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
    .eq(field, value.trim())
    .is('deleted_at', null)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error(`Erro ao verificar duplicidade de ${field}:`, error)
    return false
  }

  return !!data
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
