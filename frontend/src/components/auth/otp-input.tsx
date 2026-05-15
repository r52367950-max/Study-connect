'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  /** Number of digits. */
  length?: number
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  'aria-label'?: string
}

/**
 * 6-digit (configurable) one-time-code input rendered as separate boxes.
 * `value` is the joined digit string; `onChange` always emits digits only,
 * trimmed to `length`.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus,
  'aria-label': ariaLabel = '验证码',
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  const digits = React.useMemo(() => {
    const arr = value.replace(/\D/g, '').slice(0, length).split('')
    while (arr.length < length) arr.push('')
    return arr
  }, [value, length])

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const setAt = (index: number, char: string) => {
    const next = digits.slice()
    next[index] = char
    onChange(next.join(''))
  }

  const handleChange = (index: number, raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '')
    if (!onlyDigits) {
      setAt(index, '')
      return
    }
    if (onlyDigits.length === 1) {
      setAt(index, onlyDigits)
      refs.current[index + 1]?.focus()
      return
    }
    // Pasted / multi-char: spread starting at current index.
    const chars = onlyDigits.split('')
    const next = digits.slice()
    for (let i = 0; i < chars.length && index + i < length; i += 1) {
      next[index + i] = chars[i]
    }
    onChange(next.join(''))
    const focusIndex = Math.min(index + chars.length, length - 1)
    refs.current[focusIndex]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setAt(index, '')
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
        setAt(index - 1, '')
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
      e.preventDefault()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
      e.preventDefault()
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel}>
      {digits.map((digit, index) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={`${ariaLabel} 第 ${index + 1} 位`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-11 w-10 rounded-md border border-input bg-transparent text-center text-lg font-medium shadow-sm',
            'ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      ))}
    </div>
  )
}
