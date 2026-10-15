import { useCallback, useEffect, useState } from 'react'
import { reconciliarConfig, type ConfigColunas } from './configColunas'

export interface Predefinicao extends ConfigColunas {
  id: string
  nome: string
}

interface EstadoPredefinicoes {
  lista: Predefinicao[]
  ativa: string | null
}

export function mesmaConfig(a: ConfigColunas, b: ConfigColunas): boolean {
  const oc = (c: ConfigColunas) => [...c.ocultas].sort().join('|')
  return a.ordem.join('|') === b.ordem.join('|') && oc(a) === oc(b)
}

// Mesmo nome (sem diferenciar maiúsculas) substitui a predefinição existente
export function salvarPredefinicao(lista: Predefinicao[], nome: string, config: ConfigColunas): { lista: Predefinicao[]; id: string } | null {
  const limpo = nome.trim().slice(0, 40)
  if (!limpo) return null
  const existente = lista.find((p) => p.nome.toLowerCase() === limpo.toLowerCase())
  const id = existente?.id ?? `p${Date.now().toString(36)}`
  const nova: Predefinicao = { id, nome: existente?.nome ?? limpo, ordem: [...config.ordem], ocultas: [...config.ocultas] }
  return { lista: existente ? lista.map((p) => (p.id === id ? nova : p)) : [...lista, nova], id }
}

function lerPredefinicoes(chave: string): EstadoPredefinicoes {
  try {
    const raw = JSON.parse(localStorage.getItem(chave) ?? 'null') as Partial<EstadoPredefinicoes> | null
    const lista = Array.isArray(raw?.lista) ? raw.lista.filter((p) => p && typeof p.id === 'string' && typeof p.nome === 'string') : []
    return { lista, ativa: lista.some((p) => p.id === raw?.ativa) ? (raw?.ativa as string) : null }
  } catch {
    return { lista: [], ativa: null }
  }
}

export function usePredefinicoesColunas(chave: string, ids: string[]) {
  const [estado, setEstado] = useState<EstadoPredefinicoes>(() => lerPredefinicoes(chave))
  useEffect(() => setEstado(lerPredefinicoes(chave)), [chave])

  const gravar = useCallback(
    (novo: EstadoPredefinicoes) => {
      setEstado(novo)
      try {
        localStorage.setItem(chave, JSON.stringify(novo))
      } catch {
        // sem persistência: vale só nesta sessão
      }
    },
    [chave],
  )

  return {
    lista: estado.lista,
    ativa: estado.lista.find((p) => p.id === estado.ativa) ?? null,
    // reconcilia com as colunas atuais (ids removidos somem, novos entram ao fim)
    configDe: (p: Predefinicao) => reconciliarConfig(p, ids),
    salvar: (nome: string, config: ConfigColunas) => {
      const r = salvarPredefinicao(estado.lista, nome, config)
      if (r) gravar({ lista: r.lista, ativa: r.id })
      return !!r
    },
    atualizarAtiva: (config: ConfigColunas) => {
      if (!estado.ativa) return
      const lista = estado.lista.map((p) => (p.id === estado.ativa ? { ...p, ordem: [...config.ordem], ocultas: [...config.ocultas] } : p))
      gravar({ ...estado, lista })
    },
    marcarAtiva: (id: string | null) => gravar({ ...estado, ativa: id }),
    excluir: (id: string) => gravar({ lista: estado.lista.filter((p) => p.id !== id), ativa: estado.ativa === id ? null : estado.ativa }),
  }
}
