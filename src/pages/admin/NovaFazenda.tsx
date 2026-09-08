import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFazendaWithController } from '../../services/fazendasService'
import { getGrupos, GrupoFazenda } from '../../services/gruposService'
import { uploadLogo } from '../../services/storageService'
import { Button, Input, Card } from '../../components/ui'

export function NovaFazenda() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [showCredentials, setShowCredentials] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; senha: string } | null>(null)

  const [grupos, setGrupos] = useState<GrupoFazenda[]>([])
  const [selectedGrupo, setSelectedGrupo] = useState<string>('')

  const [formData, setFormData] = useState({
    acesso_id: '',
    nome: '',
    cnpj: '',
    endereco: '',
    telefone: '',
    email: '',
    ativo: true,
    acesso_confinamento: false,
    controller_email: '',
    criar_usuario_controller: true,
  })

  const [errors, setErrors] = useState({
    acesso_id: '',
    nome: '',
    controller_email: '',
  })

  const validateForm = () => {
    const newErrors = {
      acesso_id: '',
      nome: '',
      controller_email: '',
    }

    if (!formData.acesso_id.trim()) {
      newErrors.acesso_id = 'ID de acesso é obrigatório'
    }

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório'
    }

    if (!formData.criar_usuario_controller && !formData.controller_email.trim()) {
      newErrors.controller_email = 'Email do controller é obrigatório'
    }

    setErrors(newErrors)
    return !newErrors.acesso_id && !newErrors.nome && !newErrors.controller_email
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    // Fazer upload do logo se houver
    let logoUrl = ''
    if (logoFile) {
      logoUrl = await uploadLogo(logoFile) || ''
      if (!logoUrl) {
        setError('Erro ao fazer upload do logo')
        setLoading(false)
        return
      }
    }

    // Determinar email do controller: auto-gerado ou manual
    const controllerEmail = formData.criar_usuario_controller
      ? `controller@${formData.acesso_id}.com`
      : formData.controller_email

    const result = await createFazendaWithController({
      acesso_id: formData.acesso_id,
      nome: formData.nome,
      cnpj: formData.cnpj || undefined,
      endereco: formData.endereco || undefined,
      telefone: formData.telefone || undefined,
      email: formData.email || undefined,
      logo_url: logoUrl || undefined,
      ativo: formData.ativo,
      acesso_confinamento: formData.acesso_confinamento,
      controller_email: controllerEmail,
      controller_nome: `Controller ${formData.nome}`,
      grupo_id: selectedGrupo || undefined,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.controller) {
      setCredentials(result.controller)
      setShowCredentials(true)
    }

    setLoading(false)
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

  useEffect(() => {
    getGrupos().then(setGrupos)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleCopyCredentials = () => {
    if (credentials) {
      const text = `Email: ${credentials.email}\nSenha: ${credentials.senha}`
      navigator.clipboard.writeText(text)
    }
  }

  const handleCloseCredentials = () => {
    setShowCredentials(false)
    setCredentials(null)
    navigate('/admin/fazendas')
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/fazendas')}>
          Voltar
        </Button>
      </div>

      <Card className="bg-white p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Nova Fazenda</h2>

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

          {/* Criação de Usuário Controller */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Criação de Usuário Controller</h3>
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="criar_usuario_controller"
                  checked={formData.criar_usuario_controller}
                  onChange={(e) => setFormData(prev => ({ ...prev, criar_usuario_controller: e.target.checked }))}
                  className="w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-800">Gerar email automaticamente</span>
                  <span className="block text-xs text-gray-500">Usa controller@&lt;id de acesso&gt;.com com senha &lt;id de acesso&gt;2026</span>
                </div>
              </label>

              {formData.criar_usuario_controller ? (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-gray-500">Email do controller (gerado automaticamente):</p>
                  <p className="font-mono text-sm font-semibold text-gray-800">
                    {formData.acesso_id ? `controller@${formData.acesso_id}.com` : 'controller@<id de acesso>.com'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">Senha: <span className="font-mono font-semibold text-gray-700">{formData.acesso_id ? `${formData.acesso_id}2026` : '<id de acesso>2026'}</span></p>
                </div>
              ) : (
                <Input
                  label="Email do Controller *"
                  name="controller_email"
                  type="email"
                  value={formData.controller_email}
                  onChange={handleChange}
                  placeholder="email@controller.com"
                  error={errors.controller_email}
                  required
                />
              )}
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
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Criar Fazenda'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Modal de Credenciais */}
      {showCredentials && credentials && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800">Fazenda Criada com Sucesso!</h3>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Credenciais de acesso do controller:</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Email:</p>
                  <p className="font-mono text-sm font-semibold text-gray-800">{credentials.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Senha:</p>
                  <p className="font-mono text-sm font-semibold text-gray-800">{credentials.senha}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              <strong>Importante:</strong> Copie estas credenciais e envie ao controller. 
            </p>

            <div className="flex gap-3">
              <Button
                onClick={handleCopyCredentials}
                className="flex-1"
              >
                Copiar Credenciais
              </Button>
              <Button
                variant="secondary"
                onClick={handleCloseCredentials}
                className="flex-1"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
