import { supabase } from '@gestaup/supabase'
import type { PopSlug } from '../features/pops/pops'

const BUCKET = 'pops'

export interface PopPagina {
  id: string
  slug: PopSlug
  ordem: number
  path: string
  versao: number
  url: string
}

function urlPublica(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function listarPops(fazendaId: string): Promise<PopPagina[]> {
  const { data, error } = await supabase
    .from('fazenda_pops')
    .select('id, slug, ordem, path, versao')
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .order('slug')
    .order('ordem')
  if (error) throw error
  return (data ?? []).map((row) => ({ ...(row as Omit<PopPagina, 'url'>), url: urlPublica(row.path) }))
}

/** Substitui todas as páginas do POP: sobe as novas, troca as linhas e só então apaga os arquivos antigos. */
export async function substituirPop(fazendaId: string, slug: PopSlug, paginas: Blob[]): Promise<void> {
  const { data: atuais, error: erroAtuais } = await supabase
    .from('fazenda_pops')
    .select('id, path, versao')
    .eq('fazenda_id', fazendaId)
    .eq('slug', slug)
    .is('deleted_at', null)
  if (erroAtuais) throw erroAtuais

  const versao = Math.max(0, ...(atuais ?? []).map((row) => row.versao)) + 1
  const pasta = `${fazendaId}/${slug}/v${versao}-${Date.now()}`
  const enviados: string[] = []
  try {
    for (let i = 0; i < paginas.length; i++) {
      const path = `${pasta}/${String(i + 1).padStart(2, '0')}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(path, paginas[i], {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      })
      if (error) throw error
      enviados.push(path)
    }
  } catch (erro) {
    if (enviados.length) await supabase.storage.from(BUCKET).remove(enviados)
    throw erro
  }

  const agora = new Date().toISOString()
  if (atuais?.length) {
    const { error } = await supabase.from('fazenda_pops').update({ deleted_at: agora, updated_at: agora }).in('id', atuais.map((row) => row.id))
    if (error) {
      await supabase.storage.from(BUCKET).remove(enviados)
      throw error
    }
  }
  const { error: erroInsert } = await supabase.from('fazenda_pops').insert(
    enviados.map((path, i) => ({ fazenda_id: fazendaId, slug, ordem: i + 1, path, versao })),
  )
  if (erroInsert) throw erroInsert
  if (atuais?.length) await supabase.storage.from(BUCKET).remove(atuais.map((row) => row.path))
}

/** Restaura o POP padrão: remove as páginas personalizadas do slug. */
export async function restaurarPopPadrao(fazendaId: string, slug: PopSlug): Promise<void> {
  const { data: atuais, error: erroAtuais } = await supabase
    .from('fazenda_pops')
    .select('id, path')
    .eq('fazenda_id', fazendaId)
    .eq('slug', slug)
    .is('deleted_at', null)
  if (erroAtuais) throw erroAtuais
  if (!atuais?.length) return
  const agora = new Date().toISOString()
  const { error } = await supabase.from('fazenda_pops').update({ deleted_at: agora, updated_at: agora }).in('id', atuais.map((row) => row.id))
  if (error) throw error
  await supabase.storage.from(BUCKET).remove(atuais.map((row) => row.path))
}
