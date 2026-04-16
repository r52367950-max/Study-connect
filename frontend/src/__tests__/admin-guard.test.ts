/**
 * admin-guard.test.ts
 *
 * Tests for the pure getRedirectUrl / requiresAuth / requiresAdmin functions
 * extracted from middleware into auth-guard.ts.
 *
 * These tests cover:
 *   a) Unauthenticated access to /admin → blocked (→ /login)
 *   b) Authenticated access to /admin   → allowed (role checked by backend 403)
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
    expect(getRedirectUrl('/admin', undefined)).toBe(
      '/login?redirect=%2Fadmin',
    )
  })

  it('redirects unauthenticated user from /upload to login', () => {
    expect(getRedirectUrl('/upload', undefined)).toBe(
      '/login?redirect=%2Fupload',
    )
  })

  it('allows unauthenticated access to /materials', () => {
    expect(getRedirectUrl('/materials', undefined)).toBeNull()
  })

  it('allows unauthenticated access to /login', () => {
    expect(getRedirectUrl('/login', undefined)).toBeNull()
  })
})

// ─── getRedirectUrl — case b: authenticated ───────────────────────────────────
describe('getRedirectUrl() — authenticated requests', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.test'

  it('allows /admin in middleware when authenticated, deferring role check to backend', () => {
    expect(getRedirectUrl('/admin', token)).toBeNull()
  })

  it('allows USER to access /upload', () => {
    expect(getRedirectUrl('/upload', token)).toBeNull()
  })

  it('allows USER to access /profile', () => {
    expect(getRedirectUrl('/profile', token)).toBeNull()
  })

  it('allows USER to access /materials', () => {
    expect(getRedirectUrl('/materials', token)).toBeNull()
  })
})

// ─── getRedirectUrl — case c: authenticated ADMIN ────────────────────────────
describe('getRedirectUrl() — authenticated ADMIN', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.admin'

  it('allows ADMIN to access /admin', () => {
    expect(getRedirectUrl('/admin', token)).toBeNull()
  })

  it('allows ADMIN to access /admin sub-paths', () => {
    expect(getRedirectUrl('/admin/materials/pending', token)).toBeNull()
  })

  it('allows ADMIN to access /upload', () => {
    expect(getRedirectUrl('/upload', token)).toBeNull()
  })
})
