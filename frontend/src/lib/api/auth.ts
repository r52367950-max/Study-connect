import type { AuthResponse, OtpChannel, OtpPurpose, User } from '@/types'
import { apiClient } from './client'

/** Register with either email or phone (one required) + a fresh REGISTER OTP code. */
export interface RegisterPayload {
  email?: string
  phone?: string
  username: string
  password: string
  otpCode: string
}

/** Login by (email | phone) + (password | otpCode). */
export interface LoginPayload {
  email?: string
  phone?: string
  password?: string
  otpCode?: string
}

export interface SendOtpPayload {
  channel: OtpChannel
  /** Required when channel === 'sms'. */
  phone?: string
  /** Required when channel === 'email'. */
  email?: string
  purpose: OtpPurpose
}

export interface SendOtpResponse {
  cooldownSeconds: number
  expiresInSeconds: number
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', payload)
  return data
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload)
  return data
}

export async function sendOtp(payload: SendOtpPayload): Promise<SendOtpResponse> {
  const { data } = await apiClient.post<SendOtpResponse>('/auth/otp/send', payload)
  return data
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}
