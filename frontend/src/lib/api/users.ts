import type { Profile, UpdateProfilePayload } from '@/types'
import { apiClient } from './client'

export async function getMyProfile(): Promise<Profile> {
  const { data } = await apiClient.get<Profile>('/users/me/profile')
  return data
}

export async function updateMyProfile(payload: UpdateProfilePayload): Promise<Profile> {
  const { data } = await apiClient.put<Profile>('/users/me/profile', payload)
  return data
}
