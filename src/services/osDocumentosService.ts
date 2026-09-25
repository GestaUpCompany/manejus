import { supabase } from './supabaseClient'
import { comprimirDocumento } from '../utils/comprimirDocumento'

const BUCKET = 'documentos-os'
const SIGNED_URL_TTL = 3600

export type TipoDocumentoOs = 'romaneio' | 'acerto' | 'gta' | 'nota_fiscal' | 'laudo' | 'video' | 'outro'

export interface OsDocumento {
  id: string
  os_id: string
  fazenda_id: string
  tipo: TipoDocumentoOs
  arquivo_url: string
  nome_arquivo: string | null
  uploaded_by: string | null
  os_recebimento_id: string | null
  bucket: string | null
  created_at: string
}

export interface OsDocumentoComUrl extends OsDocumento {
  signedUrl: string | null
}

export async function getDocumentoSignedUrl(path: string, bucket?: string | null): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket || BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) return null
  return data.signedUrl
}

export async function listarDocumentosOs(osId: string): Promise<OsDocumentoComUrl[]> {
  const { data, error } = await supabase
    .from('os_documentos')
    .select('*')
    .eq('os_id', osId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  return Promise.all(
    (data ?? []).map(async (doc) => ({
      ...(doc as OsDocumento),
      signedUrl: await getDocumentoSignedUrl(doc.arquivo_url, doc.bucket),
    })),
  )
}

export async function uploadDocumentoOs(
  osId: string,
  fazendaId: string,
  tipo: TipoDocumentoOs,
  file: File,
  usuarioId: string,
): Promise<OsDocumento> {
  const comprimido = await comprimirDocumento(file)
  const path = `${fazendaId}/${osId}/${Date.now()}-${comprimido.fileName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, comprimido.blob, { contentType: comprimido.contentType, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('os_documentos')
    .insert({
      os_id: osId,
      fazenda_id: fazendaId,
      tipo,
      arquivo_url: path,
      nome_arquivo: file.name,
      uploaded_by: usuarioId,
    })
    .select()
    .single()

  if (error) {
    // Não deixar arquivo órfão no bucket quando o insert falhar
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data as OsDocumento
}

export async function excluirDocumentoOs(doc: OsDocumento): Promise<void> {
  const { error: storageError } = await supabase.storage.from(doc.bucket || BUCKET).remove([doc.arquivo_url])
  if (storageError) throw storageError
  const { error } = await supabase
    .from('os_documentos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) throw error
}
