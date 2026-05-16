'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Countdown timer for "resend OTP" buttons. `start(seconds)` (re)starts it;
 * `remaining` ticks down to 0; `active` is `remaining > 0`.
 */
export function useOtpCountdown(): {
  remaining: number
  active: boolean
  start: (seconds: number) => void
  reset: () => void
} {
  const [remaining, setRemaining] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(
    (seconds: number) => {
      clear()
      setRemaining(Math.max(0, Math.floor(seconds)))
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clear()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [clear],
  )

  const reset = useCallback(() => {
    clear()
    setRemaining(0)
  }, [clear])

  useEffect(() => clear, [clear])

  return { remaining, active: remaining > 0, start, reset }
}
