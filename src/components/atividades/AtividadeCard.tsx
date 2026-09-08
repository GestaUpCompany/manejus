import { memo } from 'react'
import { Card } from '../ui'
import { Atividade } from '../../services/atividadesService'

const PRIORIDADE_CORES: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-yellow-400',
  3: 'bg-green-500',
}

const STATUS_CORES: Record<string, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluido: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
}

const AVATAR_CORES = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500']

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function getCorAvatar(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_CORES[Math.abs(hash) % AVATAR_CORES.length]
}

function formatarData(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface AtividadeCardProps {
  atividade: Atividade
  onEdit: (atividade: Atividade) => void
  onNavigate: (path: string) => void
  onDelete: (id: string) => void
}

function AtividadeCardImpl({ atividade, onEdit, onNavigate, onDelete }: AtividadeCardProps) {
  const metaParts: string[] = []
  const periodo = atividade.data_inicio === atividade.data_fim
    ? formatarData(atividade.data_inicio)
    : `${formatarData(atividade.data_inicio)} - ${formatarData(atividade.data_fim)}`
  metaParts.push(periodo)
  if (atividade.setor_nome) metaParts.push(atividade.setor_nome)
  if (atividade.local) metaParts.push(`📍 ${atividade.local}`)

  return (
    <Card className={`bg-white p-3 border-0 shadow-sm hover:shadow-md transition-shadow ${atividade.atrasada ? 'bg-red-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${PRIORIDADE_CORES[atividade.prioridade] || 'bg-gray-400'}`} />
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 truncate text-sm">{atividade.titulo}</h3>
            {atividade.descricao && (
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{atividade.descricao}</p>
            )}
            {metaParts.length > 0 && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">{metaParts.join(' · ')}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Avatares empilhados substituindo lista de ✓ Nome */}
          {atividade.funcionarios && atividade.funcionarios.length > 0 && (
            <div className="flex -space-x-1.5 mr-1">
              {atividade.funcionarios.slice(0, 4).map((af) => {
                const ringStatus =
                  af.status_individual === 'concluida' ? 'ring-green-400' :
                  af.status_individual === 'em_andamento' ? 'ring-blue-400' :
                  af.status_individual === 'justificada' ? 'ring-amber-400' :
                  'ring-gray-300'
                return (
                  <div
                    key={af.id}
                    title={`${af.funcionario_nome} · ${STATUS_LABELS[af.status_individual] || af.status_individual}`}
                    className={`w-6 h-6 rounded-full ${getCorAvatar(af.funcionario_nome || '?')} flex items-center justify-center text-white text-[9px] font-bold ring-2 ${ringStatus}`}
                  >
                    {getIniciais(af.funcionario_nome || '?')}
                  </div>
                )
              })}
              {atividade.funcionarios.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-bold ring-2 ring-gray-200">
                  +{atividade.funcionarios.length - 4}
                </div>
              )}
            </div>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[atividade.status] || 'bg-gray-100'}`}>
            {STATUS_LABELS[atividade.status] || atividade.status}
          </span>
          {/* Botões de ação como ícones compactos */}
          <button
            onClick={() => onEdit(atividade)}
            className="text-gray-400 hover:text-primary p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Editar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button
            onClick={() => onNavigate(`/controller/monitoramento-atividades?atividade=${atividade.id}`)}
            className="text-gray-400 hover:text-primary p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Monitorar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
          <button
            onClick={() => onDelete(atividade.id)}
            className="text-gray-400 hover:text-red-500 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Excluir"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </Card>
  )
}

export const AtividadeCard = memo(AtividadeCardImpl)
