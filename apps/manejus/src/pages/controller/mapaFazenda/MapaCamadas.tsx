// Componente: todas as camadas (Source + Layer) do mapa da fazenda
import { Source, Layer, Popup } from 'react-map-gl/maplibre'
import { corPonto } from './mapaConfig'
import { gerarCirculoPrecisao } from './geometriaUtils'
import type { PontoMapa, EstradaMapa } from './types'

interface VisCamadas {
  pastos: boolean
  bebedouros: boolean
  estradas: boolean
  pontos: boolean
  fabricas: boolean
  currais: boolean
  mortes: boolean
  areas: boolean
}

interface EdicaoGeometria { pastoId: string; pastoNome: string; featureId: string }
interface EdicaoEstrada { estradaId: string; estradaNome: string; featureId: string }
interface EdicaoFabrica { fabricaId: string; fabricaNome: string; featureId: string }
interface EdicaoCurral { curralId: string; curralNome: string; featureId: string }

interface UserLocation { lng: number; lat: number; accuracy: number }
interface PopupState { lng: number; lat: number; nome: string }
interface PopupBebedouroState { lng: number; lat: number; id: string; nome: string }
interface PopupAreaState { lng: number; lat: number; id: string; nome: string; tipo: string }

interface Props {
  // Visibilidade
  visCamadas: VisCamadas
  // GeoJSON sources (do hook useMapaData)
  pastosGeoJSON: GeoJSON.FeatureCollection
  pastosLabelsGeoJSON: GeoJSON.FeatureCollection
  bebedourosGeoJSON: GeoJSON.FeatureCollection
  fabricasGeoJSON: GeoJSON.FeatureCollection
  curraisGeoJSON: GeoJSON.FeatureCollection
  areasGeoJSON: GeoJSON.FeatureCollection
  mortesGeoJSON: GeoJSON.FeatureCollection
  // Config de mortes
  agruparMortes: boolean
  areaSelecaoGeoJSON: GeoJSON.FeatureCollection | null
  morteDestaqueId: string | null
  // GeoJSON sources derivados de detalhe (do componente)
  pastosSelecionadosGeoJSON: GeoJSON.FeatureCollection
  pastoDetalheGeoJSON: GeoJSON.FeatureCollection
  estradaDetalheGeoJSON: GeoJSON.FeatureCollection
  fabricaDetalheGeoJSON: GeoJSON.FeatureCollection
  curralDetalheGeoJSON: GeoJSON.FeatureCollection
  // Dados para sources construidos inline
  estradas: EstradaMapa[]
  pontosRegulares: PontoMapa[]
  // Estado de edicao (para filtros de exclusao)
  editandoGeometria: EdicaoGeometria | null
  editandoEstrada: EdicaoEstrada | null
  editandoFabrica: EdicaoFabrica | null
  editandoCurral: EdicaoCurral | null
  // Rota
  rotaOrigem: GeoJSON.Point | null
  rotaDestinos: GeoJSON.Point[]
  rotaResultado: GeoJSON.FeatureCollection | null
  rotaSetas: GeoJSON.FeatureCollection | null
  // Import
  featuresImportadas: GeoJSON.FeatureCollection | null
  importHighlightGeoJSON: GeoJSON.FeatureCollection | null
  // Geolocalizacao
  userLocation: UserLocation | null
  // Popups
  popup: PopupState | null
  popupBebedouro: PopupBebedouroState | null
  popupArea: PopupAreaState | null
  setPopup: (p: PopupState | null) => void
  setPopupBebedouro: (p: PopupBebedouroState | null) => void
  setPopupArea: (p: PopupAreaState | null) => void
  onRemoverBebedouro: (id: string, nome: string) => void
  onRemoverArea: (id: string, nome: string) => void
}

export function MapaCamadas({
  visCamadas,
  pastosGeoJSON, pastosLabelsGeoJSON, bebedourosGeoJSON, fabricasGeoJSON, curraisGeoJSON, areasGeoJSON, mortesGeoJSON,
  agruparMortes,
  areaSelecaoGeoJSON,
  morteDestaqueId,
  pastosSelecionadosGeoJSON, pastoDetalheGeoJSON, estradaDetalheGeoJSON,
  fabricaDetalheGeoJSON, curralDetalheGeoJSON,
  estradas, pontosRegulares,
  editandoGeometria, editandoEstrada, editandoFabrica, editandoCurral,
  rotaOrigem, rotaDestinos, rotaResultado, rotaSetas,
  featuresImportadas, importHighlightGeoJSON,
  userLocation,
  popup, popupBebedouro, popupArea, setPopup, setPopupBebedouro, setPopupArea,
  onRemoverBebedouro, onRemoverArea,
}: Props) {
  return (
    <>
      {/* Source: pastos com geometria (esconde o pasto em edição para evitar duplicação) */}
      <Source id="pastos-source" type="geojson" data={pastosGeoJSON}>
        <Layer
          id="pastos-fill"
          type="fill"
          layout={{ visibility: visCamadas.pastos ? 'visible' : 'none' }}
          paint={{
            'fill-color': '#22c55e',
            'fill-opacity': 0.25,
          }}
          filter={editandoGeometria
            ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoGeometria.pastoId]]
            : ['==', '$type', 'Polygon']}
        />
        <Layer
          id="pastos-line"
          type="line"
          layout={{ visibility: visCamadas.pastos ? 'visible' : 'none' }}
          paint={{
            'line-color': '#16a34a',
            'line-width': 2,
          }}
          filter={editandoGeometria
            ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoGeometria.pastoId]]
            : ['==', '$type', 'Polygon']}
        />
      </Source>

      {/* Source: labels dos pastos (nome + áreas no centróide) */}
      <Source id="pastos-labels-source" type="geojson" data={pastosLabelsGeoJSON}>
        <Layer
          id="pastos-labels"
          type="symbol"
          layout={{
            'text-field': ['concat', ['get', 'nome'], '\n', ['get', 'sublabel']],
            'text-anchor': 'center',
            'text-justify': 'center',
            'text-allow-overlap': true,
            'text-size': 13,
            visibility: visCamadas.pastos ? 'visible' : 'none',
          }}
          paint={{
            'text-color': '#15803d',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          }}
          filter={editandoGeometria
            ? ['!=', 'id', editandoGeometria.pastoId]
            : ['has', 'nome']}
        />
      </Source>

      {/* Source: pastos selecionados (highlight em laranja) */}
      {pastosSelecionadosGeoJSON.features.length > 0 && (
        <Source id="pastos-selecionados-source" type="geojson" data={pastosSelecionadosGeoJSON}>
          <Layer
            id="pastos-selecionados-fill"
            type="fill"
            paint={{
              'fill-color': '#f97316',
              'fill-opacity': 0.4,
            }}
            filter={['==', '$type', 'Polygon']}
          />
          <Layer
            id="pastos-selecionados-line"
            type="line"
            paint={{
              'line-color': '#ea580c',
              'line-width': 3,
            }}
            filter={['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: highlight do pasto em detalhe (contorno azul grosso) */}
      {pastoDetalheGeoJSON.features.length > 0 && (
        <Source id="pasto-detalhe-highlight" type="geojson" data={pastoDetalheGeoJSON}>
          <Layer
            id="pasto-detalhe-line"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 4,
              'line-opacity': 0.9,
            }}
            filter={['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: highlight da estrada em detalhe (contorno azul grosso) */}
      {estradaDetalheGeoJSON.features.length > 0 && (
        <Source id="estrada-detalhe-highlight" type="geojson" data={estradaDetalheGeoJSON}>
          <Layer
            id="estrada-detalhe-line"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 5,
              'line-opacity': 0.9,
            }}
            filter={['==', '$type', 'LineString']}
          />
        </Source>
      )}

      {/* Source: bebedouros com geometria */}
      <Source id="bebedouros-source" type="geojson" data={bebedourosGeoJSON}>
        <Layer
          id="bebedouros-circle"
          type="circle"
          layout={{ visibility: visCamadas.bebedouros ? 'visible' : 'none' }}
          paint={{
            'circle-radius': 6,
            'circle-color': '#3b82f6',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
          filter={['==', '$type', 'Point']}
        />
      </Source>

      {/* Source: estradas */}
      {estradas.length > 0 && (() => {
        const estradasGeoJSON: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: estradas
            .filter((e) => e.geometria_geojson?.features?.[0])
            .map((e) => {
              const f = e.geometria_geojson!.features[0]
              return {
                type: 'Feature' as const,
                properties: { id: e.id, nome: e.nome },
                geometry: f.geometry,
              }
            }),
        }
        return (
          <Source id="estradas-source" type="geojson" data={estradasGeoJSON}>
            <Layer
              id="estradas-line"
              type="line"
              layout={{ visibility: visCamadas.estradas ? 'visible' : 'none' }}
              paint={{
                'line-color': '#d97706',
                'line-width': 3,
                'line-opacity': 0.9,
              }}
              filter={editandoEstrada
                ? ['all', ['==', '$type', 'LineString'], ['!=', 'id', editandoEstrada.estradaId]]
                : ['==', '$type', 'LineString']}
            />
            <Layer
              id="estradas-casing"
              type="line"
              layout={{ visibility: visCamadas.estradas ? 'visible' : 'none' }}
              paint={{
                'line-color': '#ffffff',
                'line-width': 5,
                'line-opacity': 0.4,
              }}
              filter={editandoEstrada
                ? ['all', ['==', '$type', 'LineString'], ['!=', 'id', editandoEstrada.estradaId]]
                : ['==', '$type', 'LineString']}
              beforeId="estradas-line"
            />
          </Source>
        )
      })()}

      {/* Source: pontos de interesse (exclui fábricas, que têm layer própria) */}
      {pontosRegulares.length > 0 && (() => {
        const pontosGeoJSON: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: pontosRegulares
            .filter((p) => p.geometria_geojson?.features?.[0])
            .map((p) => {
              const f = p.geometria_geojson!.features[0]
              return {
                type: 'Feature' as const,
                properties: { id: p.id, tipo: p.tipo, nome: p.nome, cor: corPonto(p.tipo) },
                geometry: f.geometry,
              }
            }),
        }
        return (
          <Source id="pontos-source" type="geojson" data={pontosGeoJSON}>
            <Layer
              id="pontos-circle"
              type="circle"
              layout={{ visibility: visCamadas.pontos ? 'visible' : 'none' }}
              paint={{
                'circle-radius': 8,
                'circle-color': ['coalesce', ['get', 'cor'], '#7c3aed'],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              }}
              filter={['==', '$type', 'Point']}
            />
          </Source>
        )
      })()}

      {/* Source: fábricas (polígonos roxos) */}
      {fabricasGeoJSON.features.length > 0 && (
        <Source id="fabricas-source" type="geojson" data={fabricasGeoJSON}>
          <Layer
            id="fabricas-fill"
            type="fill"
            layout={{ visibility: visCamadas.fabricas ? 'visible' : 'none' }}
            paint={{
              'fill-color': '#7c3aed',
              'fill-opacity': 0.3,
            }}
            filter={editandoFabrica
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoFabrica.fabricaId]]
              : ['==', '$type', 'Polygon']}
          />
          <Layer
            id="fabricas-line"
            type="line"
            layout={{ visibility: visCamadas.fabricas ? 'visible' : 'none' }}
            paint={{
              'line-color': '#5b21b6',
              'line-width': 2,
              'line-opacity': 0.9,
            }}
            filter={editandoFabrica
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoFabrica.fabricaId]]
              : ['==', '$type', 'Polygon']}
          />
          <Layer
            id="fabricas-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'nome'],
              'text-anchor': 'center',
              'text-justify': 'center',
              'text-allow-overlap': true,
              'text-size': 12,
              visibility: visCamadas.fabricas ? 'visible' : 'none',
            }}
            paint={{
              'text-color': '#5b21b6',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
            }}
            filter={editandoFabrica
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoFabrica.fabricaId]]
              : ['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: currais (polígonos marrom) */}
      {curraisGeoJSON.features.length > 0 && (
        <Source id="currais-source" type="geojson" data={curraisGeoJSON}>
          <Layer
            id="currais-fill"
            type="fill"
            layout={{ visibility: visCamadas.currais ? 'visible' : 'none' }}
            paint={{
              'fill-color': '#92400e',
              'fill-opacity': 0.3,
            }}
            filter={editandoCurral
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoCurral.curralId]]
              : ['==', '$type', 'Polygon']}
          />
          <Layer
            id="currais-line"
            type="line"
            layout={{ visibility: visCamadas.currais ? 'visible' : 'none' }}
            paint={{
              'line-color': '#78350f',
              'line-width': 2,
              'line-opacity': 0.9,
            }}
            filter={editandoCurral
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoCurral.curralId]]
              : ['==', '$type', 'Polygon']}
          />
          <Layer
            id="currais-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'nome'],
              'text-anchor': 'center',
              'text-justify': 'center',
              'text-allow-overlap': true,
              'text-size': 12,
              visibility: visCamadas.currais ? 'visible' : 'none',
            }}
            paint={{
              'text-color': '#78350f',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
            }}
            filter={editandoCurral
              ? ['all', ['==', '$type', 'Polygon'], ['!=', 'id', editandoCurral.curralId]]
              : ['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: highlight da fábrica em detalhe */}
      {fabricaDetalheGeoJSON.features.length > 0 && (
        <Source id="fabrica-detalhe-highlight" type="geojson" data={fabricaDetalheGeoJSON}>
          <Layer
            id="fabrica-detalhe-line"
            type="line"
            paint={{ 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 }}
            filter={['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: highlight do curral em detalhe */}
      {curralDetalheGeoJSON.features.length > 0 && (
        <Source id="curral-detalhe-highlight" type="geojson" data={curralDetalheGeoJSON}>
          <Layer
            id="curral-detalhe-line"
            type="line"
            paint={{ 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 }}
            filter={['==', '$type', 'Polygon']}
          />
        </Source>
      )}

      {/* Source: marcadores de origem e destinos da rota */}
      {(rotaOrigem || rotaDestinos.length > 0) && (
        <Source id="rota-marcadores" type="geojson" data={{
          type: 'FeatureCollection',
          features: [
            ...(rotaOrigem ? [{ type: 'Feature' as const, properties: { tipo: 'origem', label: 'Origem' }, geometry: rotaOrigem }] : []),
            ...rotaDestinos.map((d, i) => ({
              type: 'Feature' as const,
              properties: { tipo: 'destino', label: `Parada ${i + 1}` },
              geometry: d,
            })),
          ],
        }}>
          <Layer
            id="rota-marcadores-circle"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': ['match', ['get', 'tipo'], 'origem', '#16a34a', '#dc2626'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="rota-marcadores-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
            }}
            paint={{
              'text-color': '#1e3a8a',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
            }}
          />
        </Source>
      )}

      {/* Source: linha da rota calculada */}
      {rotaResultado && rotaResultado.features.length > 0 && (
        <Source id="rota-line" type="geojson" data={rotaResultado}>
          <Layer
            id="rota-line-casing"
            type="line"
            paint={{
              'line-color': '#ffffff',
              'line-width': 8,
              'line-opacity': 0.6,
            }}
          />
          <Layer
            id="rota-line-main"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 4,
              'line-opacity': 0.9,
              'line-dasharray': [1, 0],
            }}
          />
        </Source>
      )}

      {/* Source: setas direcionais ao longo da rota */}
      {rotaSetas && rotaSetas.features.length > 0 && (
        <Source id="rota-setas" type="geojson" data={rotaSetas}>
          <Layer
            id="rota-setas-symbol"
            type="symbol"
            layout={{
              'symbol-placement': 'point',
              'text-field': '➤',
              'text-size': 18,
              'text-rotate': ['-', ['get', 'bearing'], 90],
              'text-rotation-alignment': 'map',
              'text-allow-overlap': true,
              'text-anchor': 'center',
            }}
            paint={{
              'text-color': '#1d4ed8',
              'text-opacity': 0.9,
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
            }}
          />
        </Source>
      )}

      {/* Source: mortes com coordenadas GPS (com clustering) */}
      {/* key força recriacao da source quando o toggle muda (MapLibre nao atualiza cluster dinamicamente) */}
      <Source
        id="mortes-source"
        type="geojson"
        data={mortesGeoJSON}
        cluster={agruparMortes}
        clusterRadius={40}
        clusterMaxZoom={16}
        key={`mortes-source-${agruparMortes}`}
      >
        {/* Pontos individuais (nao-clusterizados) */}
        <Layer
          id="mortes-circle"
          type="circle"
          layout={{ visibility: visCamadas.mortes ? 'visible' : 'none' }}
          paint={{
            'circle-radius': 7,
            'circle-color': '#991b1b',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          }}
          filter={['!', ['has', 'point_count']]}
        />
        {/* Halo de destaque para morte vinda da notificacao */}
        {morteDestaqueId && (
          <Layer
            id="mortes-destaque"
            type="circle"
            layout={{ visibility: visCamadas.mortes ? 'visible' : 'none' }}
            paint={{
              'circle-radius': 16,
              'circle-color': '#fbbf24',
              'circle-stroke-color': '#f59e0b',
              'circle-stroke-width': 3,
              'circle-opacity': 0.4,
            }}
            filter={['==', ['get', 'id'], morteDestaqueId]}
          />
        )}
        {/* Círculo do cluster */}
        <Layer
          id="mortes-cluster-circle"
          type="circle"
          layout={{ visibility: visCamadas.mortes ? 'visible' : 'none' }}
          paint={{
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              5, 22,
              10, 28,
              20, 34,
            ],
            'circle-color': '#991b1b',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.85,
          }}
          filter={['has', 'point_count']}
        />
        {/* Texto do cluster (quantidade) */}
        <Layer
          id="mortes-cluster-label"
          type="symbol"
          layout={{
            visibility: visCamadas.mortes ? 'visible' : 'none',
            'text-field': '{point_count_abbreviated}',
            'text-size': 13,
            'text-font': ['Noto Sans Regular'],
          }}
          paint={{
            'text-color': '#ffffff',
          }}
          filter={['has', 'point_count']}
        />
      </Source>

      {/* Source: retângulo de seleção de área (persistente após seleção) */}
      {areaSelecaoGeoJSON && (
        <Source id="area-selecao-source" type="geojson" data={areaSelecaoGeoJSON}>
          <Layer
            id="area-selecao-fill"
            type="fill"
            paint={{
              'fill-color': '#dc2626',
              'fill-opacity': 0.08,
            }}
          />
          <Layer
            id="area-selecao-line"
            type="line"
            paint={{
              'line-color': '#dc2626',
              'line-width': 2,
              'line-dasharray': [2, 1],
            }}
          />
        </Source>
      )}

      {/* Source: features importadas (camada temporária) */}
      {featuresImportadas && (
        <Source id="import-source" type="geojson" data={featuresImportadas}>
          <Layer
            id="import-fill"
            type="fill"
            paint={{
              'fill-color': '#f59e0b',
              'fill-opacity': 0.2,
            }}
            filter={['==', '$type', 'Polygon']}
          />
          <Layer
            id="import-line"
            type="line"
            paint={{
              'line-color': '#d97706',
              'line-width': 2,
              'line-dasharray': [2, 1],
            }}
            filter={['==', '$type', 'Polygon']}
          />
          <Layer
            id="import-point"
            type="circle"
            paint={{
              'circle-radius': 5,
              'circle-color': '#f59e0b',
            }}
            filter={['==', '$type', 'Point']}
          />
          <Layer
            id="import-line-string"
            type="line"
            paint={{
              'line-color': '#d97706',
              'line-width': 2,
            }}
            filter={['==', '$type', 'LineString']}
          />
        </Source>
      )}

      {/* Source: áreas genéricas do mapa (lavoura, reserva, APP) — não são pastos */}
      <Source id="areas-source" type="geojson" data={areasGeoJSON}>
        <Layer
          id="areas-fill"
          type="fill"
          layout={{ visibility: visCamadas.areas ? 'visible' : 'none' }}
          paint={{
            'fill-color': '#0d9488',
            'fill-opacity': 0.15,
          }}
          filter={['==', '$type', 'Polygon']}
        />
        <Layer
          id="areas-line"
          type="line"
          layout={{ visibility: visCamadas.areas ? 'visible' : 'none' }}
          paint={{
            'line-color': '#0f766e',
            'line-width': 1.5,
            'line-dasharray': [3, 2],
          }}
          filter={['==', '$type', 'Polygon']}
        />
        <Layer
          id="areas-labels"
          type="symbol"
          layout={{
            'text-field': ['get', 'nome'],
            'text-size': 11,
            'text-allow-overlap': false,
            visibility: visCamadas.areas ? 'visible' : 'none',
          }}
          paint={{
            'text-color': '#0f766e',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          }}
          filter={['==', '$type', 'Polygon']}
        />
      </Source>

      {/* Source: destaque do item focado na revisão de importação */}
      {importHighlightGeoJSON && (
        <Source id="import-highlight" type="geojson" data={importHighlightGeoJSON}>
          <Layer
            id="import-highlight-fill"
            type="fill"
            paint={{ 'fill-color': '#22d3ee', 'fill-opacity': 0.25 }}
            filter={['==', '$type', 'Polygon']}
          />
          <Layer
            id="import-highlight-line"
            type="line"
            paint={{ 'line-color': '#0891b2', 'line-width': 3 }}
            filter={['==', '$type', 'Polygon']}
          />
          <Layer
            id="import-highlight-line-string"
            type="line"
            paint={{ 'line-color': '#0891b2', 'line-width': 4 }}
            filter={['==', '$type', 'LineString']}
          />
          <Layer
            id="import-highlight-point"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': 'rgba(34, 211, 238, 0.3)',
              'circle-stroke-color': '#0891b2',
              'circle-stroke-width': 3,
            }}
            filter={['==', '$type', 'Point']}
          />
        </Source>
      )}

      {/* Source: localização atual do dispositivo com círculo de precisão */}
      {userLocation && (
        <Source
          id="user-location"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { label: 'Você está aqui' },
                geometry: {
                  type: 'Point',
                  coordinates: [userLocation.lng, userLocation.lat],
                },
              },
            ],
          }}
        >
          <Layer
            id="user-location-circle"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#2563eb',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            }}
          />
          <Layer
            id="user-location-pulse"
            type="circle"
            paint={{
              'circle-radius': 20,
              'circle-color': '#2563eb',
              'circle-opacity': 0.2,
            }}
          />
        </Source>
      )}

      {/* Source: círculo de precisão (accuracy) da geolocalização */}
      {userLocation && userLocation.accuracy > 20 && (
        <Source
          id="user-accuracy"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [gerarCirculoPrecisao(userLocation.lng, userLocation.lat, userLocation.accuracy)],
                },
              },
            ],
          }}
        >
          <Layer
            id="user-accuracy-fill"
            type="fill"
            paint={{
              'fill-color': '#2563eb',
              'fill-opacity': 0.08,
            }}
          />
          <Layer
            id="user-accuracy-line"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 1,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
      )}

      {/* Popup ao clicar em pasto */}
      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          closeOnClick={false}
          onClose={() => setPopup(null)}
          anchor="bottom"
        >
          <div className="p-1">
            <p className="font-semibold text-sm">{popup.nome}</p>
          </div>
        </Popup>
      )}

      {/* Popup ao clicar em bebedouro */}
      {popupBebedouro && (
        <Popup
          longitude={popupBebedouro.lng}
          latitude={popupBebedouro.lat}
          closeOnClick={false}
          onClose={() => setPopupBebedouro(null)}
          anchor="bottom"
        >
          <div className="p-2 min-w-[160px]">
            <p className="font-semibold text-sm mb-2">{popupBebedouro.nome}</p>
            <button
              onClick={() => {
                onRemoverBebedouro(popupBebedouro.id, popupBebedouro.nome)
                setPopupBebedouro(null)
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remover do mapa
            </button>
          </div>
        </Popup>
      )}
      {/* Popup ao clicar em área genérica do mapa */}
      {popupArea && (
        <Popup
          longitude={popupArea.lng}
          latitude={popupArea.lat}
          closeOnClick={false}
          onClose={() => setPopupArea(null)}
          anchor="bottom"
        >
          <div className="p-2 min-w-[160px]">
            <p className="font-semibold text-sm">{popupArea.nome}</p>
            <p className="text-xs text-content-muted mb-2">{popupArea.tipo}</p>
            <button
              onClick={() => {
                onRemoverArea(popupArea.id, popupArea.nome)
                setPopupArea(null)
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remover do mapa
            </button>
          </div>
        </Popup>
      )}
    </>
  )
}
