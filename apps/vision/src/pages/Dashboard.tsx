import { useEffect, useState } from 'react'
import { useAuth, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { CardItem } from '@gestaup/ui'

const AREAS = [
  { titulo: 'Fluxo de Caixa', descricao: 'Projeção diária, mensal e anual com saldo acumulado' },
  { titulo: 'Lançamentos', descricao: 'Desembolsos realizados e previstos, receitas' },
  { titulo: 'Contas a Pagar / Receber', descricao: 'Gestão de compromissos financeiros' },
  { titulo: 'DRE', descricao: 'Demonstrativo de resultados por período' },
  { titulo: 'Orçamento', descricao: 'Orçado vs realizado por centro de custo' },
  { titulo: 'Custos do Rebanho', descricao: 'Diárias e custo por cabeça cruzando dados do Manejus' },
]

export function Dashboard() {
  const { user } = useAuth()
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => (id ? getFazendaNome(id) : null))
      .then(setFazendaNome)
      .catch(() => setFazendaNome(null))
  }, [user])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">
          {fazendaNome ? `${fazendaNome}` : 'Dashboard'}
        </h1>
        <p className="text-content-muted mt-1">
          Vision'Up em construção. A base (auth, fazenda, design system) já é compartilhada com o Manejus.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AREAS.map((a) => (
          <CardItem
            key={a.titulo}
            title={a.titulo}
            subtitle={
              <>
                <span className="block">{a.descricao}</span>
                <span className="block text-xs text-content-faint mt-3 uppercase tracking-wide">Em breve</span>
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
