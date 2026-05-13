export type IdentifierKind = 'email' | 'phone'
export type CredentialMode = 'password' | 'otp'

// Loose front-end checks; the backend is the authority.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Matches the backend phone regex: /^[+\d][\d\s-]{6,19}$/
export const PHONE_RE = /^[+\d][\d\s-]{6,19}$/
