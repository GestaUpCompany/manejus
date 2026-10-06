import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroClima {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  responsavel: string
  temperatura_media?: number
  tempo_atual?: string
  umidade_relativa?: number
  esvaziou_pluviometros?: boolean | null
  choveu?: boolean | null
  observacao?: string
  medicoes?: any[]
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

// Valores de tempo_atual gravados pela tela nova do PWA
const TEMPO_ATUAL_LABELS: Record<string, string> = {
  sol: 'Sol',
  nublado: 'Nublado',
  chuva_fraca: 'Chuva fraca',
  chuva_forte: 'Chuva forte',
  temporal: 'Temporal',
  vento_forte: 'Vento forte',
  frio: 'Frio',
  seco_poeira: 'Seco / poeira',
}

function boolSimNao(valor?: boolean | null): string {
  if (valor === null || valor === undefined) return '-'
  return valor ? 'Sim' : 'Não'
}

export function RegistrosClimaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroClima | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('registros_clima')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setRegistro(null)
      } else {
        console.error('Erro ao buscar registro:', error)
        setLoadError(error.message || 'Erro ao buscar registro')
      }
    } else {
      setRegistro(data as RegistroClima)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/clima'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Clima"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                <DetailField label="Temperatura Média" value={registro!.temperatura_media ? `${registro!.temperatura_media}°C` : '-'} />
                <DetailField label="Tempo Atual" value={registro!.tempo_atual ? (TEMPO_ATUAL_LABELS[registro!.tempo_atual] ?? registro!.tempo_atual) : '-'} />
                <DetailField label="Umidade Relativa" value={registro!.umidade_relativa != null ? `${registro!.umidade_relativa}%` : '-'} />
                <DetailField label="Esvaziou Pluviômetros" value={boolSimNao(registro!.esvaziou_pluviometros)} />
                {registro!.choveu !== null && registro!.choveu !== undefined && (
                  <DetailField label="Choveu desde Última Leitura" value={boolSimNao(registro!.choveu)} />
                )}
              </div>
            </DetailSection>

            {/* Medições */}
            {registro!.medicoes && registro!.medicoes.length > 0 && (
              <DetailSection title="Medições">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border-base">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Pluviômetro</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Localização</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Medição (mm)</th>
                        {registro!.medicoes.some((m: any) => m.temperatura !== null && m.temperatura !== undefined) && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Temperatura (°C)</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-surface-1 divide-y divide-border-base">
                      {registro!.medicoes.map((medicao: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                            {formatValue(medicao.pluviometro_nome)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                            {formatValue(medicao.pluviometro_localizacao)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                            {medicao.medicao !== undefined ? `${medicao.medicao} mm` : '-'}
                          </td>
                          {registro!.medicoes!.some((m: any) => m.temperatura !== null && m.temperatura !== undefined) && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-content-strong">
                              {medicao.temperatura !== null && medicao.temperatura !== undefined ? `${medicao.temperatura}°C` : '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            )}

            {/* Observação */}
            {registro!.observacao && (
              <DetailSection title="Observação" highlighted>
                <p className="text-sm">{registro!.observacao}</p>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
