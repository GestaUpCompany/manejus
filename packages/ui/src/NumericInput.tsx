import { useState, useEffect, useRef } from 'react'

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: number | string
  onChange?: (value: string) => void
  label?: string
  error?: string
  decimalPlaces?: number
  prefix?: string
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

  // Format value to specified decimal places with padding
  const formatValue = (val: string): string => {
    if (!val) return ''
    
    // Remove non-numeric characters except comma (no negative signs or letters)
    const cleaned = val.replace(/[^\d,]/g, '').replace('.', ',')
    
    if (cleaned === '') return cleaned
    
    // Split by comma
    const parts = cleaned.split(',')
    const integerPart = parts[0] || '0'
    const decimalPart = parts[1] || ''
    
    // Handle zero decimal places: return only integer part
    if (decimalPlaces === 0) {
      return integerPart
    }
    
    // Limit decimal places
    const limitedDecimal = decimalPart.slice(0, decimalPlaces)
    
    // Always pad to the required number of places
    const paddedDecimal = limitedDecimal.padEnd(decimalPlaces, '0')
    return `${integerPart},${paddedDecimal}`
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
      const cleaned = newValue.replace(/[^\d]/g, '')
      setDisplayValue(cleaned)
      onChange?.(cleaned)
      return
    }
    
    // Allow typing freely, just replace dots with commas
    const withComma = newValue.replace('.', ',')
    
    // Remove any non-numeric characters except comma (no negative signs or letters)
    const cleaned = withComma.replace(/[^\d,]/g, '')
    
    if (cleaned === '') {
      setDisplayValue(cleaned)
      onChange?.(cleaned)
      return
    }
    
    // Split by comma to check decimal places
    const parts = cleaned.split(',')
    const integerPart = parts[0] || '0'
    const decimalPart = parts[1] || ''
    
    // Strictly limit decimal places while typing
    if (decimalPart.length > decimalPlaces) {
      const limited = `${integerPart},${decimalPart.slice(0, decimalPlaces)}`
      setDisplayValue(limited)
      onChange?.(limited)
    } else {
      setDisplayValue(cleaned)
      onChange?.(cleaned)
    }
  }

  const handleFocus = () => {
    isFocusedRef.current = true
  }

  const handleBlur = () => {
    isFocusedRef.current = false
    // Format on blur to ensure proper padding
    const formatted = formatValue(displayValue)
    setDisplayValue(formatted)
    onChange?.(formatted)
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
