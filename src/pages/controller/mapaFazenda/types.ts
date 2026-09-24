// Tipos do Mapa da Fazenda

export interface PastoMapa {
  id: string
  nome: string
  setor?: string | null
  tipo?: string | null
  area_total_ha?: number | null
  area_util_ha?: number | null
  especie?: string | null
  ativo: boolean
  geometria_geojson?: GeoJSON.FeatureCollection | null
  // detalhes extras para o side panel
  metragem_cocho_m?: number | null
  possui_deposito?: boolean | null
  fonte_agua_principal?: string | null
  modulo_nome?: string | null
}

export interface BebedouroMapa {
  id: string
  nome: string
  capacidade?: number | null
  geometria_geojson?: GeoJSON.FeatureCollection | null
}

export interface EstradaMapa {
  id: string
  nome: string
  geometria_geojson?: GeoJSON.FeatureCollection | null
}

export interface PontoMapa {
  id: string
  tipo: string
  nome: string
  geometria_geojson?: GeoJSON.FeatureCollection | null
}

export interface AreaMapa {
  id: string
  nome: string
  tipo: string
  geometria_geojson?: GeoJSON.FeatureCollection | null
}

export interface CurralMapa {
  id: string
  nome: string
  lote_id: string | null
  geometria_geojson?: GeoJSON.FeatureCollection | null
}

export interface CurralDetalhe extends CurralMapa {
  largura_m: number | null
  comprimento_m: number | null
  metros_cocho_m: number | null
  formulacao_nome: string | null
  lote_atual?: {
    id: string
    nome: string
    n_cabecas: number
    raca?: string | null
    sexo?: string | null
    peso_medio_atual_kg?: number | null
  } | null
}

export interface PastoDetalhe extends PastoMapa {
  bebedouros: { id: string; nome: string }[]
  lote_atual?: {
    id: string
    nome: string
    n_cabecas: number
    raca?: string | null
    sexo?: string | null
    peso_medio_atual_kg?: number | null
  } | null
}
