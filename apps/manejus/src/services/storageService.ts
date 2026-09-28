import { supabase } from './supabaseClient'

export async function uploadLogo(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${fileName}`

    const { error } = await supabase.storage
      .from('logos')
      .upload(filePath, file)

    if (error) {
      console.error('Erro ao fazer upload:', error)
      return null
    }

    // Obter URL pública do arquivo
    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    console.error('Erro ao fazer upload:', error)
    return null
  }
}

export async function deleteLogo(url: string): Promise<boolean> {
  try {
    // Extrair o nome do arquivo da URL
    const fileName = url.split('/').pop()
    
    if (!fileName) {
      return false
    }

    const { error } = await supabase.storage
      .from('logos')
      .remove([fileName])

    if (error) {
      console.error('Erro ao deletar logo:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Erro ao deletar logo:', error)
    return false
  }
}
