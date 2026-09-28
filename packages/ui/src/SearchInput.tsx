import { useEffect, useRef, useState } from 'react'
import { Input } from './Input'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

/**
 * Input de busca com debounce opcional.
 * Sem debounce: comporta como Input normal (filtro em memória a cada keystroke).
 * Com debounce: só notifica o parent após o usuário parar de digitar.
 */
export function SearchInput({ value, onChange, placeholder, debounceMs = 0, className }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza quando o parent muda o valor externamente (ex: botão Limpar)
  useEffect(() => {
    if (value !== localValue) setLocalValue(value)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (newValue: string) => {
    setLocalValue(newValue)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (debounceMs > 0) {
      timerRef.current = setTimeout(() => onChange(newValue), debounceMs)
    } else {
      onChange(newValue)
    }
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      className={className}
    />
  )
}
