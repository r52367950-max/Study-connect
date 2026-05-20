'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fades its children in on mount (~200ms, `ease-rise`). Used to soften the
 * moment loaded content replaces a skeleton on the (app) pages.
 */
export function FadeIn({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className={cn(
        'transition-opacity duration-200 ease-rise',
        shown ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Loading wrapper for client-fetched (app) pages where App Router's
 * `loading.tsx`/Suspense doesn't fire. While `isLoading`, the skeleton is held
 * back for `delayMs` (default 100ms) so fast networks don't flash it; once data
 * is ready the content fades in (~200ms, `ease-rise`).
 */
export function ContentTransition({
  isLoading,
  skeleton,
  children,
  delayMs = 100,
  className,
}: {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  delayMs?: number
  className?: string
}) {
  const [showSkeleton, setShowSkeleton] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), delayMs)
    return () => clearTimeout(timer)
  }, [isLoading, delayMs])

  if (isLoading) {
    return showSkeleton ? <>{skeleton}</> : null
  }
  return <FadeIn className={className}>{children}</FadeIn>
}
