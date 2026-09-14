import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import { updateFazenda } from '../../services/fazendasService'
import { uploadLogo, deleteLogo } from '../../services/storageService'
import { Card } from '../../components/ui'

export function Configuracoes() {
  const { user } = useAuth()
  const { data: fazenda, isLoading, refetch } = useFazenda(user?.id)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const currentLogo = fazenda?.logo_url || ''
  const previewSrc = logoPreview || currentLogo

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setSuccess(false)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!fazenda || !logoFile) return

    setError('')
    setSaving(true)

    try {
      // Deletar logo antigo se existir
      if (currentLogo) {
        await deleteLogo(currentLogo)
      }

      const newLogoUrl = await uploadLogo(logoFile)
      if (!newLogoUrl) {
        setError('Erro ao fazer upload do logo')
        setSaving(false)
        return
      }

      const result = await updateFazenda(fazenda.id, { logo_url: newLogoUrl })
      if (!result) {
        setError('Erro ao salvar o logo da fazenda')
        setSaving(false)
        return
      }

      setLogoFile(null)
      setLogoPreview('')
      setSuccess(true)
      refetch()
    } catch {
      setError('Erro inesperado ao salvar o logo')
    }

    setSaving(false)
  }

  if (isLoading) {
    return <p className="text-gray-600">Carregando...</p>
  }

  if (!fazenda) {
    return <p className="text-gray-600">Nenhuma fazenda vinculada ao usuário.</p>
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Configurações</h2>
        <p className="text-sm text-gray-500 mt-1">Identidade visual da fazenda</p>
      </div>

      <Card className="bg-white p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Logo da Fazenda</h3>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-600">Logo atualizado com sucesso.</p>
            </div>
          )}

          <div className="flex items-center gap-4">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Logo da fazenda"
                loading="lazy"
                className="w-48 h-32 object-contain rounded-lg border-2 border-gray-300 bg-gray-50"
              />
            ) : (
              <div className="w-48 h-32 bg-gray-200 rounded-lg border-2 border-gray-300 flex items-center justify-center">
                <span className="text-gray-400 text-sm">Sem logo</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/80"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleSave}
              disabled={!logoFile || saving}
              className="px-4 py-2.5 rounded-lg font-semibold text-white bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar Logo'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
