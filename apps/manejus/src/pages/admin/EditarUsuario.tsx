import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getUsuarioById, updateUsuario } from '../../services/usuariosService'
import { changeUserPassword } from '../../services/authService'
import { getFazendas, Fazenda } from '../../services/fazendasService'
import { getFazendasDoUsuario, vincularFazendaAoUsuario, desvincularFazendaDoUsuario } from '../../services/usuarioFazendaService'
import { Button, Input, Card } from '../../components/ui'

export function EditarUsuario() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fazendas, setFazendas] = useState<Fazenda[]>([])
  const [fazendasSelecionadas, setFazendasSelecionadas] = useState<string[]>([])

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    papel: 'controller' as 'admin' | 'controller',
    ativo: true,
  })

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState({
    nome: '',
  })

  useEffect(() => {
    loadUsuario()
    loadFazendas()
  }, [id])

  const loadUsuario = async () => {
    if (!id) return

    setLoading(true)
    const usuario = await getUsuarioById(id)
    
    if (usuario) {
      setFormData({
        nome: usuario.nome,
        telefone: usuario.telefone || '',
        papel: usuario.papel,
        ativo: usuario.ativo,
      })

      // Carregar fazendas do usuário
      const fazendasVinculadas = await getFazendasDoUsuario(id)
      setFazendasSelecionadas(fazendasVinculadas.map(f => f.fazenda_id))
    }

    setLoading(false)
  }

  const loadFazendas = async () => {
    const data = await getFazendas()
    setFazendas(data)
  }

  const validateForm = () => {
    const newErrors = {
      nome: '',
    }

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório'
    }

    setErrors(newErrors)
    return !newErrors.nome
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!id || !validateForm()) {
      return
    }

    setSaving(true)

    // Atualizar dados do usuário
    const result = await updateUsuario(id, {
      nome: formData.nome,
      telefone: formData.telefone || undefined,
      papel: formData.papel,
      ativo: formData.ativo,
    })

    if (!result) {
      setError('Erro ao atualizar usuário')
      setSaving(false)
      return
    }

    // Atualizar senha se fornecida
    if (passwordData.newPassword) {
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setError('As senhas não coincidem')
        setSaving(false)
        return
      }

      const passwordChanged = await changeUserPassword(id, passwordData.newPassword)
      if (!passwordChanged) {
        setError('Erro ao alterar senha')
        setSaving(false)
        return
      }
    }

    // Atualizar vínculos de fazendas
    // Primeiro, desvincular todas as fazendas atuais
    const fazendasAtuais = await getFazendasDoUsuario(id)
    for (const vinculo of fazendasAtuais) {
      await desvincularFazendaDoUsuario(id, vinculo.fazenda_id)
    }

    // Vincular fazendas selecionadas
    for (const fazendaId of fazendasSelecionadas) {
      await vincularFazendaAoUsuario({
        usuario_id: id,
        fazenda_id: fazendaId,
        papel: formData.papel,
      })
    }

    setSaving(false)
    navigate('/admin/usuarios')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordData(prev => ({ ...prev, [name]: value }))
  }

  if (loading) {
    return <p className="text-gray-600">Carregando...</p>
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/usuarios')}>
          Voltar
        </Button>
      </div>

      <Card className="bg-white p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Editar Usuário</h2>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome *"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
            placeholder="Nome completo"
            error={errors.nome}
            required
          />

          <Input
            label="Telefone"
            name="telefone"
            value={formData.telefone}
            onChange={handleChange}
            placeholder="(00) 00000-0000"
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Papel *</label>
            <select
              name="papel"
              value={formData.papel}
              onChange={handleChange}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary"
              required
            >
              <option value="controller">Controller</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ativo"
              checked={formData.ativo}
              onChange={(e) => setFormData(prev => ({ ...prev, ativo: e.target.checked }))}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <label htmlFor="ativo" className="text-sm text-gray-700">
              Usuário ativo
            </label>
          </div>

          <div className="border-t-2 border-gray-200 pt-4 mt-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Alterar Senha</h3>
            <p className="text-sm text-gray-600 mb-4">Deixe em branco para manter a senha atual</p>
            
            <Input
              label="Nova Senha"
              name="newPassword"
              type="password"
              value={passwordData.newPassword}
              onChange={handlePasswordChange}
              placeholder="Mínimo 6 caracteres"
            />

            <Input
              label="Confirmar Nova Senha"
              name="confirmPassword"
              type="password"
              value={passwordData.confirmPassword}
              onChange={handlePasswordChange}
              placeholder="Digite a senha novamente"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Fazendas</label>
            {fazendas.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma fazenda cadastrada</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border-2 border-gray-300 rounded-lg p-3">
                {fazendas.map((fazenda) => (
                  <label key={fazenda.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      value={fazenda.id}
                      checked={fazendasSelecionadas.includes(fazenda.id)}
                      onChange={(e) => {
                        const value = e.target.value
                        if (e.target.checked) {
                          setFazendasSelecionadas(prev => [...prev, value])
                        } else {
                          setFazendasSelecionadas(prev => prev.filter(id => id !== value))
                        }
                      }}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">{fazenda.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/admin/usuarios')}
              disabled={saving}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
