import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GeralTab } from '../components/cadastros/GeralTab'
import { AtividadesTab } from '../components/cadastros/AtividadesTab'
import { CriteriosTab } from '../components/cadastros/CriteriosTab'
import { EquipesTab } from '../components/cadastros/EquipesTab'
import { PessoasTab } from '../components/cadastros/PessoasTab'
import { TemplatesTab } from '../components/cadastros/TemplatesTab'
import { DadosTab } from '../components/cadastros/DadosTab'

type Aba = 'geral' | 'atividades' | 'criterios' | 'equipes' | 'pessoas' | 'templates' | 'dados'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'geral', label: 'Geral e setores' },
  { id: 'atividades', label: 'Biblioteca de atividades' },
  { id: 'criterios', label: 'Critérios de comportamento' },
  { id: 'equipes', label: 'Equipes do app' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'templates', label: 'Templates' },
  { id: 'dados', label: 'Dados' },
]

export function Cadastros() {
  const [searchParams] = useSearchParams()
  const abaParam = searchParams.get('aba') as Aba | null
  const [aba, setAba] = useState<Aba>(
    abaParam && ABAS.some((a) => a.id === abaParam) ? abaParam : 'geral',
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">O que hoje fica nas abas Cadastros, Equipe e Cargos e Funções</p>
        <h1 className="text-[28px] font-bold font-display text-content-strong tracking-tight leading-tight">
          Cadastros gerais
        </h1>
      </div>

      <div className="flex gap-1 border-b border-border-base overflow-x-auto" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              aba === a.id
                ? 'border-primary text-primary dark:text-white'
                : 'border-transparent text-content-muted hover:text-content-strong'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'geral' && <GeralTab />}
      {aba === 'atividades' && <AtividadesTab />}
      {aba === 'criterios' && <CriteriosTab />}
      {aba === 'equipes' && <EquipesTab />}
      {aba === 'pessoas' && <PessoasTab />}
      {aba === 'templates' && <TemplatesTab />}
      {aba === 'dados' && <DadosTab />}
    </div>
  )
}
