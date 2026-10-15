import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TabelaZootecnica } from './colunas'

export interface ConfigColunas {
  ordem: string[]
  ocultas: string[]
}

// Descarta ids que não existem mais e acrescenta ao fim os novos
export function reconciliarConfig(config: Partial<ConfigColunas> | null | undefined, ids: string[]): ConfigColunas {
  const validos = new Set(ids)
  const ordem = (config?.ordem ?? []).filter((id, i, a) => validos.has(id) && a.indexOf(id) === i)
  for (const id of ids) if (!ordem.includes(id)) ordem.push(id)
  const ocultas = (config?.ocultas ?? []).filter((id) => validos.has(id))
  // nunca deixa a tabela sem colunas
  return { ordem, ocultas: ocultas.length >= ids.length ? [] : ocultas }
}

// Move a coluna para o lado, pulando as ocultas (o efeito visível é sempre uma casa)
export function moverColunaVisivel(ordem: string[], ocultas: string[], id: string, direcao: -1 | 1): string[] {
  const i = ordem.indexOf(id)
  if (i < 0) return ordem
  for (let j = i + direcao; j >= 0 && j < ordem.length; j += direcao) {
    if (ocultas.includes(ordem[j])) continue
    const out = [...ordem]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  }
  return ordem
}

// Arrastar: a coluna assume a posição do alvo
export function moverColunaPara(ordem: string[], id: string, alvo: string): string[] {
  if (id === alvo || !ordem.includes(id) || !ordem.includes(alvo)) return ordem
  const out = ordem.filter((x) => x !== id)
  out.splice(ordem.indexOf(alvo), 0, id)
  return out
}

export function aplicarConfigColunas(tabela: TabelaZootecnica, config: ConfigColunas): TabelaZootecnica {
  const ocultas = new Set(config.ocultas)
  const indice = new Map(tabela.colunas.map((c, i) => [c.id, i]))
  const idx = config.ordem.filter((id) => !ocultas.has(id) && indice.has(id)).map((id) => indice.get(id)!)
  const pick = <T,>(arr: T[]) => idx.map((i) => arr[i])
  return {
    colunas: pick(tabela.colunas),
    geral: pick(tabela.geral),
    secoes: tabela.secoes.map((s) => ({ titulo: s.titulo, total: s.total && pick(s.total), linhas: s.linhas.map(pick) })),
  }
}

function ler(chave: string): Partial<ConfigColunas> | null {
  try {
    const raw = localStorage.getItem(chave)
    return raw ? (JSON.parse(raw) as Partial<ConfigColunas>) : null
  } catch {
    return null
  }
}

export function useConfigColunasZootecnico(chave: string, ids: string[]) {
  const chaveIds = ids.join('|')
  const [config, setConfig] = useState<ConfigColunas>(() => reconciliarConfig(ler(chave), ids))

  useEffect(() => {
    setConfig(reconciliarConfig(ler(chave), ids))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, chaveIds])

  const atualizar = useCallback(
    (fn: (c: ConfigColunas) => ConfigColunas) => {
      setConfig((atual) => {
        const novo = reconciliarConfig(fn(atual), ids)
        try {
          localStorage.setItem(chave, JSON.stringify(novo))
        } catch {
          // sem persistência: a configuração vale só nesta sessão
        }
        return novo
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave, chaveIds],
  )

  return useMemo(
    () => ({
      config,
      mover: (id: string, direcao: -1 | 1) => atualizar((c) => ({ ...c, ordem: moverColunaVisivel(c.ordem, c.ocultas, id, direcao) })),
      moverPara: (id: string, alvo: string) => atualizar((c) => ({ ...c, ordem: moverColunaPara(c.ordem, id, alvo) })),
      ocultar: (...alvos: string[]) => atualizar((c) => ({ ...c, ocultas: [...new Set([...c.ocultas, ...alvos])] })),
      mostrar: (id: string) => atualizar((c) => ({ ...c, ocultas: c.ocultas.filter((x) => x !== id) })),
      mostrarTodas: () => atualizar((c) => ({ ...c, ocultas: [] })),
      restaurarPadrao: () => atualizar(() => ({ ordem: ids, ocultas: [] })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, atualizar, chaveIds],
  )
}
