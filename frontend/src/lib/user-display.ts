export function identifierLabel(user: {
  email?: string | null
  phone?: string | null
  username: string
}): string {
  return user.email || user.phone || user.username
}
