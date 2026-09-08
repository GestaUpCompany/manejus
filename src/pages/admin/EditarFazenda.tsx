import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getFazendaById, updateFazenda } from '../../services/fazendasService'
import { getGrupos, GrupoFazenda } from '../../services/gruposService'
import { uploadLogo, deleteLogo } from '../../services/storageService'
import { Button, Input, Card } from '../../components/ui'

export function EditarFazenda() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')

  const [grupos, setGrupos] = useState<GrupoFazenda[]>([])
  const [selectedGrupo, setSelectedGrupo] = useState<string>('')

  const [formData, setFormData] = useState({
    acesso_id: '',
    nome: '',
    cnpj: '',
    endereco: '',
    telefone: '',
    email: '',
    logo_url: '',
    ativo: true,
    acesso_confinamento: false,
  })

  const [errors, setErrors] = useState({
    acesso_id: '',
    nome: '',
  })

  useEffect(() => {
    loadFazenda()
  }, [id])

  useEffect(() => {
    getGrupos().then(setGrupos)
  }, [])

  const loadFazenda = async () => {
    if (!id) return

    setLoading(true)
    const fazenda = await getFazendaById(id)

    if (fazenda) {
      setFormData({
        acesso_id: fazenda.acesso_id,
        nome: fazenda.nome,
        cnpj: fazenda.cnpj || '',
        endereco: fazenda.endereco || '',
        telefone: fazenda.telefone || '',
        email: fazenda.email || '',
        logo_url: fazenda.logo_url || '',
        ativo: fazenda.ativo,
        acesso_confinamento: fazenda.acesso_confinamento,
      })
      setSelectedGrupo(fazenda.grupo_id || '')
      setLogoPreview(fazenda.logo_url || '')
    }

    setLoading(false)
  }

  const validateForm = () => {
    const newErrors = {
      acesso_id: '',
      nome: '',
    }

    if (!formData.acesso_id.trim()) {
      newErrors.acesso_id = 'ID de acesso é obrigatório'
    }

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório'
    }

    setErrors(newErrors)
    return !newErrors.acesso_id && !newErrors.nome
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!id || !validateForm()) {
      return
    }

    setSaving(true)

    // Fazer upload do novo logo se houver
    let logoUrl = formData.logo_url
    if (logoFile) {
      // Deletar logo antigo se existir
      if (formData.logo_url) {
        await deleteLogo(formData.logo_url)
      }
      
      // Upload do novo logo
      logoUrl = await uploadLogo(logoFile) || ''
      if (!logoUrl) {
        setError('Erro ao fazer upload do logo')
        setSaving(false)
        return
      }
    }

    const result = await updateFazenda(id, {
      acesso_id: formData.acesso_id,
      nome: formData.nome,
      cnpj: formData.cnpj || undefined,
      endereco: formData.endereco || undefined,
      telefone: formData.telefone || undefined,
      email: formData.email || undefined,
      logo_url: logoUrl || undefined,
      ativo: formData.ativo,
      acesso_confinamento: formData.acesso_confinamento,
      grupo_id: selectedGrupo || null,
    })

    setSaving(false)

    if (result) {
      navigate('/admin/fazendas')
    } else {
      setError('Erro ao atualizar fazenda. Tente novamente.')
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      // Criar preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  if (loading) {
    return <p className="text-gray-600">Carregando...</p>
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/fazendas')}>
          Voltar
        </Button>
      </div>

      <Card className="bg-white p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Editar Fazenda</h2>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identidade Visual */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Identidade Visual</h3>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Preview"
                  loading="lazy"
                  className="w-24 h-24 object-cover rounded-lg border-2 border-gray-300"
                />
              ) : (
                <div className="w-24 h-24 bg-gray-200 rounded-lg border-2 border-gray-300 flex items-center justify-center">
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
          </div>

          {/* Dados Principais */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Dados Principais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ID de Acesso *"
                name="acesso_id"
                value={formData.acesso_id}
                onChange={handleChange}
                placeholder="Ex: FAZ001"
                error={errors.acesso_id}
                required
              />
              <Input
                label="Nome da Fazenda *"
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                placeholder="Ex: Fazenda Santa Maria"
                error={errors.nome}
                required
              />
              <Input
                label="CNPJ"
                name="cnpj"
                value={formData.cnpj}
                onChange={handleChange}
                placeholder="00.000.000/0000-00"
              />
              <Input
                label="Telefone"
                name="telefone"
                value={formData.telefone}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
              />
            </div>
            <Input
              label="Endereço"
              name="endereco"
              value={formData.endereco}
              onChange={handleChange}
              placeholder="Rua, número, cidade, estado"
            />
          </div>

          {/* Contato e Grupo */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Contato e Grupo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="email@exemplo.com"
              />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Grupo de Fazendas</label>
                <select
                  value={selectedGrupo}
                  onChange={(e) => setSelectedGrupo(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                >
                  <option value="">Sem grupo</option>
                  {grupos.filter(g => g.ativo).map((g) => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Configurações de Acesso */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Configurações de Acesso</h3>
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formData.ativo}
                  onChange={(e) => setFormData(prev => ({ ...prev, ativo: e.target.checked }))}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-800">Fazenda ativa</span>
                  <span className="block text-xs text-gray-500">Permite acesso aos controllers</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="acesso_confinamento"
                  checked={formData.acesso_confinamento}
                  onChange={(e) => setFormData(prev => ({ ...prev, acesso_confinamento: e.target.checked }))}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-800">Acesso ao Confinamento</span>
                  <span className="block text-xs text-gray-500">Exibe o menu e telas de confinamento no controller</span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/admin/fazendas')}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
