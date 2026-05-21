import type { MaterialKind } from '@/types'
import { useAuthStore } from '@/lib/auth-store'
import { apiClient, CSRF_HEADER_NAME, getCsrfTokenFromCookie } from './client'

export interface ViewEventPayload {
  materialId: string
  kind?: MaterialKind | null
  dwellMs?: number
}

// Backend caps dwellMs at 1 hour (LogViewEventDto.@Max(60 * 60 * 1000)).
const MAX_DWELL_MS = 60 * 60 * 1000

/**
 * Report a single recommendation signal to `POST /view-events`. Goes through
 * `apiClient`, so the CSRF header + cookies are attached automatically — used
 * for the in-list impression ping (no dwell). The detail-page dwell uses
 * `reportDwellEvent` (a `keepalive` fetch) instead so it can fire during unload.
 */
export async function reportViewEvent(payload: ViewEventPayload): Promise<void> {
  await apiClient.post('/view-events', {
    materialId: payload.materialId,
    kind: payload.kind ?? undefined,
    dwellMs: payload.dwellMs != null ? Math.min(payload.dwellMs, MAX_DWELL_MS) : undefined,
  })
}

export interface DwellEventPayload {
  materialId: string
  kind?: MaterialKind | null
  dwellMs: number
}

/**
 * Fire-and-forget dwell ping for the detail page, sent with `keepalive` so it
 * survives page unload (where axios / `reportViewEvent` can't run). Mirrors the
 * `apiClient` contract by hand: CSRF header from the cookie, cookies via
 * `credentials: 'include'`, and the in-memory Bearer when present (covers the
 * case where the access cookie has expired but the token is still in memory).
 * Returns `false` without sending when there's no CSRF cookie, so the caller can
 * retry on a later unload event; the caller still owns the login / min-dwell /
 * dedup checks.
 */
export function reportDwellEvent({ materialId, kind, dwellMs }: DwellEventPayload): boolean {
  const csrfToken = getCsrfTokenFromCookie()
  if (!csrfToken) return false

  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [CSRF_HEADER_NAME]: csrfToken,
  }
  const accessToken = useAuthStore.getState().accessToken
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  void fetch(`${baseUrl}/view-events`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers,
    body: JSON.stringify({
      materialId,
      kind: kind ?? undefined,
      dwellMs: Math.min(dwellMs, MAX_DWELL_MS),
    }),
  }).catch(() => undefined)

  return true
}
