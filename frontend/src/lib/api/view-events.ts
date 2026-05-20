import type { MaterialKind } from '@/types'
import { apiClient } from './client'

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
 * for the in-list impression ping (no dwell). The detail-page dwell uses a
 * `keepalive` fetch instead so it can fire during page unload.
 */
export async function reportViewEvent(payload: ViewEventPayload): Promise<void> {
  await apiClient.post('/view-events', {
    materialId: payload.materialId,
    kind: payload.kind ?? undefined,
    dwellMs: payload.dwellMs != null ? Math.min(payload.dwellMs, MAX_DWELL_MS) : undefined,
  })
}
