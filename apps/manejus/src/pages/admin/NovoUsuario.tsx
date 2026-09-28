import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp } from '../../services/authService'
import { getFazendas, Fazenda } from '../../services/fazendasService'
import { vincularFazendaAoUsuario } from '../../services/usuarioFazendaService'
import { Button, Input, Card } from '../../components/ui'

export function NovoUsuario() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fazendas, setFazendas] = useState<Fazenda[]>([])
  const [fazendasSelecionadas, setFazendasSelecionadas] = useState<string[]>([])

  useEffect(() => {
    loadFazendas()
  }, [])

  const loadFazendas = async () => {
    const data = await getFazendas()
    setFazendas(data)
  }

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nome: '',
    telefone: '',
    papel: 'controller' as 'admin' | 'controller',
    ativo: true,
  })

  const [errors, setErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nome: '',
  })

  const validateForm = () => {
    const newErrors = {
      email: '',
      password: '',
      confirmPassword: '',
      nome: '',
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido'
    }

    if (!formData.password) {
      newErrors.password = 'Senha é obrigatória'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Senha deve ter no mínimo 6 caracteres'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirme a senha'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem'
    }

    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório'
    }

    setErrors(newErrors)
    return !newErrors.email && !newErrors.password && !newErrors.confirmPassword && !newErrors.nome
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    const result = await signUp(formData.email, formData.password, formData.nome, formData.telefone || undefined, formData.papel)

    if (!result) {
      setError('Erro ao criar usuário. O email já pode estar em uso.')
      setLoading(false)
      return
    }

    // Vincular fazendas selecionadas
    if (fazendasSelecionadas.length > 0 && result) {
      for (const fazendaId of fazendasSelecionadas) {
        await vincularFazendaAoUsuario({
          usuario_id: result.id,
          fazenda_id: fazendaId,
          papel: formData.papel,
        })
      }
    }

    setLoading(false)
    navigate('/admin/usuarios')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/usuarios')}>
          Voltar
        </Button>
      </div>

      <Card className="bg-white p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Novo Usuário</h2>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email *"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="email@exemplo.com"
            error={errors.email}
            required
          />

          <Input
            label="Senha *"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Mínimo 6 caracteres"
            error={errors.password}
            required
          />

          <Input
            label="Confirmar Senha *"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Digite a senha novamente"
            error={errors.confirmPassword}
            required
          />

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
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Criando...' : 'Criar Usuário'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/admin/usuarios')}
              disabled={loading}
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
