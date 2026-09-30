import { useState } from 'react'
import { PlanoTab } from '../components/cadastros/PlanoTab'
import { AtividadesTab } from '../components/cadastros/AtividadesTab'
import { TemplatesTab } from '../components/cadastros/TemplatesTab'
import { PessoasTab } from '../components/cadastros/PessoasTab'
import { EquipesTab } from '../components/cadastros/EquipesTab'
import { SetoresTab } from '../components/cadastros/SetoresTab'

type Aba = 'plano' | 'atividades' | 'templates' | 'pessoas' | 'equipes' | 'setores'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'plano', label: 'Plano anual' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'templates', label: 'Templates' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'equipes', label: 'Equipes' },
  { id: 'setores', label: 'Setores' },
]

export function Cadastros() {
  const [aba, setAba] = useState<Aba>('plano')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Cadastros</h1>
        <p className="text-content-muted mt-1">
          Plano anual, atividades, pessoas, equipes e setores do Farm Plan.
        </p>
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

      {aba === 'plano' && <PlanoTab />}
      {aba === 'atividades' && <AtividadesTab />}
      {aba === 'templates' && <TemplatesTab />}
      {aba === 'pessoas' && <PessoasTab />}
      {aba === 'equipes' && <EquipesTab />}
      {aba === 'setores' && <SetoresTab />}
    </div>
  )
}
