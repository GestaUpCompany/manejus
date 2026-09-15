import { supabase } from './supabaseClient'
import { normalizarImagemCapa, sanitizarNomeImagem } from '../features/relatorioGeral/imagens'

const BUCKET = 'relatorios-gerais'

export interface ImagemCapa {
  nome: string
  path: string
  previewUrl: string
  criadoEm: string | null
}

export async function listarImagensCapa(fazendaId: string): Promise<ImagemCapa[]> {
  const pasta = `${fazendaId}/capas`
  const { data, error } = await supabase.storage.from(BUCKET).list(pasta, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error
  return Promise.all((data ?? []).filter((item) => item.name.endsWith('.webp')).map(async (item) => {
    const path = `${pasta}/${item.name}`
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (signedError) throw signedError
    return {
      nome: item.name.replace(/^\d+-/, '').replace(/\.webp$/, '').replace(/-/g, ' '),
      path,
      previewUrl: signed.signedUrl,
      criadoEm: item.created_at ?? null,
    }
  }))
}

export async function enviarImagemCapa(fazendaId: string, file: File): Promise<void> {
  const blob = await normalizarImagemCapa(file)
  const path = `${fazendaId}/capas/${Date.now()}-${sanitizarNomeImagem(file.name)}.webp`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '3600',
  })
  if (error) throw error
}

export async function excluirImagemCapa(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
