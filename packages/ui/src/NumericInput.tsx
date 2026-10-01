import { useState, useEffect, useRef } from 'react'

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: number | string
  onChange?: (value: string) => void
  label?: string
  error?: string
  decimalPlaces?: number
  prefix?: string
}

// Agrupa a parte inteira com ponto de milhar para exibição pt-BR
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function NumericInput({
  value = '',
  onChange,
  label,
  error,
  decimalPlaces = 3,
  prefix,
  className = '',
  ...props
}: NumericInputProps) {
  const [displayValue, setDisplayValue] = useState('')
  const isFocusedRef = useRef(false)

  // Format value to specified decimal places with padding.
  // Pontos são sempre tratados como separador de milhar visual e removidos;
  // a vírgula é o único separador decimal aceito.
  const formatValue = (val: string): string => {
    if (!val) return ''

    const cleaned = val.replace(/\./g, '').replace(/[^\d,]/g, '')

    if (cleaned === '') return cleaned

    const parts = cleaned.split(',')
    const integerPart = parts[0] || '0'
    const decimalPart = parts[1] || ''

    if (decimalPlaces === 0) {
      return groupThousands(integerPart)
    }

    const limitedDecimal = decimalPart.slice(0, decimalPlaces)
    const paddedDecimal = limitedDecimal.padEnd(decimalPlaces, '0')
    return `${groupThousands(integerPart)},${paddedDecimal}`
  }

  // Update display value when prop value changes (only if not focused)
  useEffect(() => {
    if (!isFocusedRef.current) {
      if (value !== undefined && value !== null && value !== '') {
        const strValue = String(value).replace('.', ',')
        const formatted = formatValue(strValue)
        setDisplayValue(formatted)
      } else {
        setDisplayValue('')
      }
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value

    // For zero decimal places, reject commas entirely
    if (decimalPlaces === 0) {
      const cleaned = newValue.replace(/\D/g, '')
      setDisplayValue(groupThousands(cleaned))
      onChange?.(cleaned)
      return
    }

    // Ponto nunca entra como dígito: no campo ele só existe como separador
    // de milhar visual. Removemos todos antes de interpretar, então
    // "9.540" digitado é sempre nove mil quinhentos e quarenta.
    const cleaned = newValue.replace(/\./g, '').replace(/[^\d,]/g, '')

    if (cleaned === '') {
      setDisplayValue('')
      onChange?.('')
      return
    }

    const commaIdx = cleaned.indexOf(',')
    const hasComma = commaIdx !== -1
    const integerPart = hasComma ? cleaned.slice(0, commaIdx) : cleaned
    let decimalPart = hasComma ? cleaned.slice(commaIdx + 1).replace(/,/g, '') : ''

    // Strictly limit decimal places while typing
    if (decimalPart.length > decimalPlaces) {
      decimalPart = decimalPart.slice(0, decimalPlaces)
    }

    const intOut = hasComma && integerPart === '' ? '0' : integerPart
    const emit = hasComma ? `${intOut},${decimalPart}` : intOut
    const display = hasComma
      ? `${groupThousands(intOut)},${decimalPart}`
      : groupThousands(intOut)

    setDisplayValue(display)
    onChange?.(emit)
  }

  const handleFocus = () => {
    isFocusedRef.current = true
  }

  const handleBlur = () => {
    isFocusedRef.current = false
    // Format on blur to ensure proper padding; emit sem milhar
    const formatted = formatValue(displayValue)
    setDisplayValue(formatted)
    onChange?.(formatted.replace(/\./g, ''))
  }

  const inputElement = (
    <input
      type="text"
      inputMode="decimal"
      className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus bg-surface-1 text-content-strong placeholder-content-faint min-h-[44px] text-sm sm:text-base ${
        error ? 'border-red-500' : 'border-surface-3'
      } ${className} ${prefix ? '!pl-10' : ''}`}
      style={prefix ? { paddingLeft: '2.5rem' } : undefined}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  )

  return (
    <div>
      {label && (
        <label className="block text-xs sm:text-sm font-semibold text-content mb-2">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {prefix ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-faint text-sm sm:text-base z-10">{prefix}</span>
          {inputElement}
        </div>
      ) : (
        inputElement
      )}
      {error && (
        <p className="text-xs sm:text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}
