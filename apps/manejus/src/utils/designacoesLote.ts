/**
 * Designações de lote do manejo de curral: o peão escolhe o lote de destino do animal no curral e o servidor guarda
 * isso como pendência. Só a confirmação do gestor gera a movimentação agregada (Entrevero) e liga os animais a ela.
 */
export interface DesignacaoPendente {
  id: string
  individuo_id: string
  identificacao: string
  categoria: string
  lote_origem_id: string
  lote_origem_nome: string
  lote_destino_id: string
  lote_destino_nome: string
  created_at: string
}

export interface GrupoDesignacao {
  /** origem|destino|categoria: a RPC confirma de cada vez animais com os três iguais */
  chave: string
  lote_origem_id: string
  lote_origem_nome: string
  lote_destino_id: string
  lote_destino_nome: string
  categoria: string
  pendencias: DesignacaoPendente[]
}

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Agrupa por origem, destino e categoria do animal (uma movimentação por grupo); ordena por destino e categoria. */
export function agruparDesignacoes(lista: DesignacaoPendente[]): GrupoDesignacao[] {
  const grupos = new Map<string, GrupoDesignacao>()
  for (const d of lista) {
    const chave = `${d.lote_origem_id}|${d.lote_destino_id}|${normalizar(d.categoria)}`
    const g = grupos.get(chave)
    if (g) {
      g.pendencias.push(d)
    } else {
      grupos.set(chave, {
        chave,
        lote_origem_id: d.lote_origem_id,
        lote_origem_nome: d.lote_origem_nome,
        lote_destino_id: d.lote_destino_id,
        lote_destino_nome: d.lote_destino_nome,
        categoria: d.categoria,
        pendencias: [d],
      })
    }
  }
  return [...grupos.values()].sort(
    (a, b) =>
      a.lote_destino_nome.localeCompare(b.lote_destino_nome, 'pt-BR') ||
      a.lote_origem_nome.localeCompare(b.lote_origem_nome, 'pt-BR') ||
      a.categoria.localeCompare(b.categoria, 'pt-BR')
  )
}

/** Linha da consulta pendencias_designacao_lote com os joins usados na tela. */
export interface LinhaDesignacao {
  id: string
  individuo_id: string
  lote_origem_id: string | null
  lote_destino_id: string
  created_at: string
  individuo: { id_brinco: string | null; id_chip: string | null; id_manejo: string | null; id_provisorio_cria: string | null; categoria: string | null } | null
  origem: { nome: string } | null
  destino: { nome: string } | null
}

/** Texto que identifica o animal na lista (manejo, brinco, chip ou provisório, nessa ordem). */
export function identificacaoDoAnimal(i: LinhaDesignacao['individuo']): string {
  return i?.id_manejo || i?.id_brinco || i?.id_chip || i?.id_provisorio_cria || 'Animal sem identificação'
}

/** Descarta a linha sem origem (não dá para mover de um lote que não se sabe) e converte para o formato da tela. */
export function linhasParaDesignacoes(linhas: LinhaDesignacao[]): DesignacaoPendente[] {
  return linhas
    .filter((l) => !!l.lote_origem_id)
    .map((l) => ({
      id: l.id,
      individuo_id: l.individuo_id,
      identificacao: identificacaoDoAnimal(l.individuo),
      categoria: l.individuo?.categoria || 'Sem categoria',
      lote_origem_id: l.lote_origem_id as string,
      lote_origem_nome: l.origem?.nome || 'Origem',
      lote_destino_id: l.lote_destino_id,
      lote_destino_nome: l.destino?.nome || 'Destino',
      created_at: l.created_at,
    }))
}
