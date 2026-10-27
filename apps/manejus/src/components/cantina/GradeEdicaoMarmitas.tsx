import { Button, Input } from '@gestaup/ui'
import {
  REFEICOES_MARMITA,
  empresaVazia,
  paraDetalhe,
  totaisDetalhe,
  type CampoRefeicaoMarmita,
  type GradeMarmitasForm,
} from '../../utils/cantinaMarmitas'

interface GradeEdicaoMarmitasProps {
  grade: GradeMarmitasForm
  onChange: (grade: GradeMarmitasForm) => void
}

// Edição da divisão de marmitas (funcionários x empresas terceirizadas) por refeição.
// O servidor recalcula o total e o destinatário a partir desta grade.
export default function GradeEdicaoMarmitas({ grade, onChange }: GradeEdicaoMarmitasProps) {
  const totais = totaisDetalhe(paraDetalhe(grade))

  const setInterna = (campo: CampoRefeicaoMarmita, valor: string) =>
    onChange({ ...grade, interna: { ...grade.interna, [campo]: valor } })

  const setEmpresa = (id: string, patch: Partial<GradeMarmitasForm['terceirizadas'][number]>) =>
    onChange({ ...grade, terceirizadas: grade.terceirizadas.map((t) => (t.id === id ? { ...t, ...patch } : t)) })

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-sm font-medium text-content-strong">Funcionários (interna)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REFEICOES_MARMITA.map(({ campo, label }) => (
            <Input
              key={campo}
              label={label}
              type="number"
              min={0}
              step={1}
              value={grade.interna[campo]}
              onChange={(e) => setInterna(campo, e.target.value)}
            />
          ))}
        </div>
      </div>

      {grade.terceirizadas.map((linha, indice) => (
        <div key={linha.id} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={`Empresa terceirizada ${indice + 1}`}
                value={linha.empresa}
                onChange={(e) => setEmpresa(linha.id, { empresa: e.target.value })}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => onChange({ ...grade, terceirizadas: grade.terceirizadas.filter((t) => t.id !== linha.id) })}
            >
              Remover
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {REFEICOES_MARMITA.map(({ campo, label }) => (
              <Input
                key={campo}
                label={label}
                type="number"
                min={0}
                step={1}
                value={linha[campo]}
                onChange={(e) => setEmpresa(linha.id, { [campo]: e.target.value })}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => onChange({ ...grade, terceirizadas: [...grade.terceirizadas, empresaVazia()] })}>
          Adicionar empresa terceirizada
        </Button>
        <p className="text-sm text-content-muted">
          {totais.internas} int. + {totais.terceirizadas} terc. = <span className="font-medium text-content-strong">{totais.geral}</span>
        </p>
      </div>
    </div>
  )
}
