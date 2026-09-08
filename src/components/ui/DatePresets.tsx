interface DatePresetsProps {
  value: string
  onChange: (preset: string) => void
  presets?: { label: string; value: string }[]
}

const DEFAULT_PRESETS = [
  { label: 'Últimas 24h', value: '24h' },
  { label: 'Últimos 7 dias', value: '7d' },
  { label: 'Últimos 30 dias', value: '30d' },
  { label: 'Personalizado', value: 'custom' },
]

/**
 * Botões de preset de data (24h, 7d, 30d, customizado).
 * Usado em AuditLog e Atividades.
 */
export function DatePresets({ value, onChange, presets = DEFAULT_PRESETS }: DatePresetsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            value === p.value
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Calcula a data de início a partir de um preset.
 */
export function presetToDate(preset: string): string {
  if (preset === '24h') {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  if (preset === '7d') {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  if (preset === '30d') {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  return ''
}
