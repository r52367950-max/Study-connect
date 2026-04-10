/**
 * admin-guard.test.ts
 *
 * Tests for the pure getRedirectUrl / requiresAuth / requiresAdmin functions
 * extracted from middleware into auth-guard.ts.
 *
 * These tests cover:
 *   a) Unauthenticated access to /admin → blocked (→ /login)
 *   b) Non-ADMIN access to /admin       → blocked (→ /materials?forbidden=1)
 *   c) ADMIN access to /admin           → allowed
 */
import { describe, it, expect } from 'vitest'
import { getRedirectUrl, requiresAuth, requiresAdmin } from '@/lib/auth-guard'

// ─── requiresAuth ─────────────────────────────────────────────────────────────
describe('requiresAuth()', () => {
  it('protects /upload', () => {
    expect(requiresAuth('/upload')).toBe(true)
  })
  it('protects /profile', () => {
    expect(requiresAuth('/profile')).toBe(true)
  })
  it('protects /admin', () => {
    expect(requiresAuth('/admin')).toBe(true)
  })
  it('protects /admin sub-paths', () => {
    expect(requiresAuth('/admin/materials/pending')).toBe(true)
  })
  it('does not protect /materials (public)', () => {
    expect(requiresAuth('/materials')).toBe(false)
  })
  it('does not protect /login (public)', () => {
    expect(requiresAuth('/login')).toBe(false)
  })
})

// ─── requiresAdmin ────────────────────────────────────────────────────────────
describe('requiresAdmin()', () => {
  it('matches /admin', () => {
    expect(requiresAdmin('/admin')).toBe(true)
  })
  it('matches /admin sub-paths', () => {
    expect(requiresAdmin('/admin/materials/123/approve')).toBe(true)
  })
  it('does not match /materials', () => {
    expect(requiresAdmin('/materials')).toBe(false)
  })
  it('does not match /upload', () => {
    expect(requiresAdmin('/upload')).toBe(false)
  })
})

// ─── getRedirectUrl — case a: unauthenticated ─────────────────────────────────
describe('getRedirectUrl() — unauthenticated', () => {
  it('redirects unauthenticated user from /admin to login', () => {
    expect(getRedirectUrl('/admin', undefined, undefined)).toBe(
      '/login?redirect=%2Fadmin',
    )
  })

  it('redirects unauthenticated user from /upload to login', () => {
    expect(getRedirectUrl('/upload', undefined, undefined)).toBe(
      '/login?redirect=%2Fupload',
    )
  })

  it('allows unauthenticated access to /materials', () => {
    expect(getRedirectUrl('/materials', undefined, undefined)).toBeNull()
  })

  it('allows unauthenticated access to /login', () => {
    expect(getRedirectUrl('/login', undefined, undefined)).toBeNull()
  })
})

// ─── getRedirectUrl — case b: authenticated but non-ADMIN ────────────────────
describe('getRedirectUrl() — authenticated USER', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.test'

  it('blocks USER from /admin and redirects to /materials?forbidden=1', () => {
    expect(getRedirectUrl('/admin', token, 'USER')).toBe('/materials?forbidden=1')
  })

  it('blocks user without role cookie from /admin', () => {
    expect(getRedirectUrl('/admin', token, undefined)).toBe('/materials?forbidden=1')
  })

  it('allows USER to access /upload', () => {
    expect(getRedirectUrl('/upload', token, 'USER')).toBeNull()
  })

  it('allows USER to access /profile', () => {
    expect(getRedirectUrl('/profile', token, 'USER')).toBeNull()
  })

  it('allows USER to access /materials', () => {
    expect(getRedirectUrl('/materials', token, 'USER')).toBeNull()
  })
})

// ─── getRedirectUrl — case c: ADMIN ──────────────────────────────────────────
describe('getRedirectUrl() — authenticated ADMIN', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.admin'

  it('allows ADMIN to access /admin', () => {
    expect(getRedirectUrl('/admin', token, 'ADMIN')).toBeNull()
  })

  it('allows ADMIN to access /admin sub-paths', () => {
    expect(getRedirectUrl('/admin/materials/pending', token, 'ADMIN')).toBeNull()
  })

  it('allows ADMIN to access /upload', () => {
    expect(getRedirectUrl('/upload', token, 'ADMIN')).toBeNull()
  })
})
