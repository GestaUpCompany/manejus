import { describe, expect, it } from 'vitest'
import { identificacaoNovaDaLinha, resumirSessaoManejo, type LinhaSessaoManejo } from './sessoesManejoCurral'

const l = (status: LinhaSessaoManejo['status_processamento'], pend: ('aberta' | 'confirmada' | 'descartada')[] = []): LinhaSessaoManejo => ({
  id: Math.random().toString(),
  status_processamento: status,
  pendencias: pend.map((status) => ({ status })),
})

describe('resumirSessaoManejo', () => {
  it('conta linhas por situação e só as designações abertas', () => {
    const r = resumirSessaoManejo([l('aplicado', ['aberta']), l('aplicado', ['confirmada']), l('conflito'), l('pendente'), l('aplicado', ['aberta', 'descartada'])])
    expect(r).toEqual({ total: 5, aplicadas: 3, conflitos: 1, aguardando: 1, designacoesAbertas: 2 })
  })

  it('sessão vazia e linha sem pendências (null) não quebram', () => {
    expect(resumirSessaoManejo([])).toEqual({ total: 0, aplicadas: 0, conflitos: 0, aguardando: 0, designacoesAbertas: 0 })
    expect(resumirSessaoManejo([{ id: 'x', status_processamento: 'aplicado', pendencias: null }]).designacoesAbertas).toBe(0)
  })
})

describe('identificacaoNovaDaLinha', () => {
  it('junta brinco, chip e manejo; traço quando não há nada', () => {
    expect(identificacaoNovaDaLinha({ id_brinco_novo: 'B1', id_chip_novo: 'C1' })).toBe('brinco B1, chip C1')
    expect(identificacaoNovaDaLinha({})).toBe('-')
  })
})
