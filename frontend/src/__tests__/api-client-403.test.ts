/**
 * api-client-403.test.ts
 *
 * Tests for the handle403() function exported from api/client.ts.
 *
 * Covers:
 *   c) API returns 403 → unified handling logic:
 *      - /admin endpoint 403  → redirect to /materials?forbidden=1
 *      - other endpoint 403   → no redirect (error propagates to component)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { handle403 } from '@/lib/api/client'

describe('handle403()', () => {
  let capturedHref: string

  beforeEach(() => {
    capturedHref = ''
    // Replace window.location with a simple stub that captures href assignments
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return capturedHref
        },
        set href(v: string) {
          capturedHref = v
        },
      },
    })
  })

  // ── Admin endpoint 403 triggers redirect ────────────────────────────────────
  it('redirects to /materials?forbidden=1 for /admin endpoint 403', () => {
    handle403('/admin/materials/pending')
    expect(capturedHref).toBe('/materials?forbidden=1')
  })

  it('redirects for any /admin sub-path', () => {
    handle403('/admin/materials/abc-123/approve')
    expect(capturedHref).toBe('/materials?forbidden=1')
  })

  // ── Non-admin endpoint 403 does NOT redirect ─────────────────────────────────
  it('does NOT redirect for /materials 403', () => {
    handle403('/materials/some-id/download')
    expect(capturedHref).toBe('')
  })

  it('does NOT redirect for empty URL (unknown origin)', () => {
    handle403('')
    expect(capturedHref).toBe('')
  })

  it('does NOT redirect for /auth 403', () => {
    handle403('/auth/me')
    expect(capturedHref).toBe('')
  })
})
