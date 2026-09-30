import { useEffect, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, Input, Button, useToast } from '@gestaup/ui'
import { usePlanoAtivo } from '../../services/farmplanService'
import { useSavePlano } from '../../services/cadastrosService'

export function PlanoTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: plano, isLoading } = usePlanoAtivo(fazenda?.id)
  const save = useSavePlano()
  const toast = useToast()

  const [ano, setAno] = useState('')
  const [semana1, setSemana1] = useState('')
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    if (plano) {
      setAno(String(plano.ano))
      setSemana1(plano.semana1_inicio)
    }
  }, [plano])

  if (isLoading) return null
  if (!fazenda) return <p className="text-sm text-content-muted">Selecione uma fazenda.</p>

  const mostrarForm = !plano || editando

  const salvar = () => {
    const anoNum = Number(ano)
    if (!anoNum || !semana1) {
      toast.error('Informe o ano e a segunda-feira da semana 1')
      return
    }
    const d = new Date(`${semana1}T12:00:00`)
    if (d.getDay() !== 1) {
      toast.error('A semana 1 deve começar numa segunda-feira')
      return
    }
    save.mutate(
      { id: plano?.id, fazendaId: fazenda.id, ano: anoNum, semana1Inicio: semana1 },
      {
        onSuccess: () => {
          toast.success('Plano salvo')
          setEditando(false)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar plano'),
      },
    )
  }

  return (
    <div className="space-y-4 max-w-xl">
      {plano && !editando && (
        <Card className="p-4" disableHover>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-content-strong">Plano {plano.ano}</p>
              <p className="text-sm text-content-muted mt-1">
                Semana 1 começa em {new Date(`${plano.semana1_inicio}T12:00:00`).toLocaleDateString('pt-BR')}
              </p>
              <p className="text-sm text-content-muted">
                Semana atual: {plano.semanaAtual}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              Editar
            </Button>
          </div>
        </Card>
      )}

      {mostrarForm && (
        <Card className="p-4 space-y-4" disableHover>
          <h2 className="font-semibold text-content-strong">
            {plano ? 'Editar plano' : 'Criar plano anual'}
          </h2>
          <p className="text-xs text-content-muted">
            O ano do Farm Plan tem 53 semanas. Informe a segunda-feira em que a semana 1 começa
            (ex.: 29/12/2025 para o plano de 2026).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Ano"
              type="number"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              placeholder="2026"
            />
            <Input
              label="Início da semana 1 (segunda)"
              type="date"
              value={semana1}
              onChange={(e) => setSemana1(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            {plano && (
              <Button variant="secondary" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
