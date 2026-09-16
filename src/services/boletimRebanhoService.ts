import { supabase } from './supabaseClient'

const BUCKET = 'relatorios-gerais'
const MAX_FILE_BYTES = 10 * 1024 * 1024

function pathFor(fazendaId: string, ano: number) {
  return `${fazendaId}/boletim-rebanho/${ano}.xlsm`
}

function contentTypeFor(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  return 'application/vnd.ms-excel.sheet.macroenabled.12'
}

export async function carregarPlanilhaBoletim(fazendaId: string, ano: number): Promise<File | null> {
  const path = pathFor(fazendaId, ano)
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error) {
    if (/not found|404|object not found/i.test(error.message)) return null
    throw error
  }
  return new File([data], `${ano}.xlsm`, { type: data.type || 'application/vnd.ms-excel.sheet.macroenabled.12' })
}

export async function enviarPlanilhaBoletim(fazendaId: string, ano: number, file: File): Promise<void> {
  const extensaoValida = /\.(xlsx|xlsm|xls)$/i.test(file.name)
  if (!extensaoValida) throw new Error('Envie uma planilha Excel .xlsx, .xlsm ou .xls.')
  if (file.size > MAX_FILE_BYTES) throw new Error('A planilha não pode ultrapassar 10 MB.')

  const contentType = contentTypeFor(file)
  const body = new Blob([await file.arrayBuffer()], { type: contentType })
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(fazendaId, ano), body, {
    contentType,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw error
}
