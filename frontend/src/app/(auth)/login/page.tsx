'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { login, sendOtp, type LoginPayload } from '@/lib/api/auth'
import { getMyProfile } from '@/lib/api/users'
import { getErrorMessage } from '@/lib/api/client'
import { safeRedirect } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OtpInput } from '@/components/auth/otp-input'
import { useOtpCountdown } from '@/components/auth/use-otp-countdown'
import {
  EMAIL_RE,
  PHONE_RE,
  type IdentifierKind,
  type CredentialMode,
} from '@/components/auth/identifier'

function FallbackBox() {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FallbackBox />}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoggedIn, setAuth } = useAuth()
  const redirect = safeRedirect(searchParams.get('redirect'))

  const [idKind, setIdKind] = useState<IdentifierKind>('email')
  const [mode, setMode] = useState<CredentialMode>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [otpNotice, setOtpNotice] = useState<string | null>(null)

  const countdown = useOtpCountdown()

  const identifierValid = idKind === 'email' ? EMAIL_RE.test(identifier) : PHONE_RE.test(identifier)

  const sendOtpMutation = useMutation({
    mutationFn: () =>
      sendOtp({
        channel: idKind === 'email' ? 'email' : 'sms',
        ...(idKind === 'email' ? { email: identifier } : { phone: identifier }),
        purpose: 'LOGIN',
      }),
    onSuccess: (res) => {
      countdown.start(res.cooldownSeconds > 0 ? res.cooldownSeconds : 60)
      setOtpNotice(`验证码已发送，${res.expiresInSeconds || 300} 秒内有效`)
      setFormError(null)
    },
    onError: (err) => {
      setFormError(getErrorMessage(err))
    },
  })

  const loginMutation = useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: async (data) => {
      setAuth(data.user, data.accessToken)
      let target = redirect
      try {
        const profile = await getMyProfile()
        if (!profile.onboardedAt) target = '/onboarding'
      } catch {
        // If profile lookup fails, fall back to the requested redirect.
      }
      router.replace(target)
    },
    onError: (err) => {
      setFormError(getErrorMessage(err))
    },
  })

  // "Already logged in" → bounce to the requested redirect. Skip when a login
  // attempt is in flight or just succeeded, otherwise this effect races with
  // loginMutation.onSuccess and can stomp the /onboarding redirect that
  // first-time users need.
  useEffect(() => {
    if (!isLoggedIn) return
    if (loginMutation.isPending || loginMutation.isSuccess) return
    router.replace(redirect)
  }, [isLoggedIn, redirect, router, loginMutation.isPending, loginMutation.isSuccess])

  const handleSendOtp = () => {
    if (!identifierValid) {
      setFormError(idKind === 'email' ? '请输入有效的邮箱地址' : '请输入有效的手机号')
      return
    }
    sendOtpMutation.mutate()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!identifierValid) {
      setFormError(idKind === 'email' ? '请输入有效的邮箱地址' : '请输入有效的手机号')
      return
    }
    const idPart = idKind === 'email' ? { email: identifier } : { phone: identifier }
    if (mode === 'password') {
      if (password.length < 8) {
        setFormError('密码至少 8 位')
        return
      }
      loginMutation.mutate({ ...idPart, password })
    } else {
      if (otpCode.length !== 6) {
        setFormError('请输入 6 位验证码')
        return
      }
      loginMutation.mutate({ ...idPart, otpCode })
    }
  }

  const switchIdKind = (next: IdentifierKind) => {
    setIdKind(next)
    setIdentifier('')
    setOtpCode('')
    setFormError(null)
    setOtpNotice(null)
    countdown.reset()
    // Drop any in-flight OTP request so a late onSuccess from the previous tab
    // can't show "已发送" on the new tab (where the code wasn't actually sent).
    sendOtpMutation.reset()
  }

  // Clear the opposite field when switching login mode so stale input can't
  // bleed through and confuse validation on the newly-shown field.
  const switchMode = (next: CredentialMode) => {
    setMode(next)
    if (next === 'otp') {
      setPassword('')
    } else {
      setOtpCode('')
      countdown.reset()
      sendOtpMutation.reset()
      setOtpNotice(null)
    }
    setFormError(null)
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
            <BookOpen className="h-5 w-5 text-background" />
          </div>
          <h1 className="text-xl font-semibold">欢迎回来</h1>
          <p className="text-sm text-muted-foreground">登录您的 StudyConnect 账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <Tabs value={idKind} onValueChange={(v) => switchIdKind(v as IdentifierKind)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">邮箱登录</TabsTrigger>
              <TabsTrigger value="phone">手机号登录</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="identifier">{idKind === 'email' ? '邮箱' : '手机号'}</Label>
            <Input
              id="identifier"
              type={idKind === 'email' ? 'email' : 'tel'}
              inputMode={idKind === 'email' ? 'email' : 'tel'}
              autoComplete={idKind === 'email' ? 'email' : 'tel'}
              placeholder={idKind === 'email' ? 'you@example.com' : '13800000000'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={mode === 'password' ? 'font-medium text-foreground' : 'text-muted-foreground'}
            >
              密码登录
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => switchMode('otp')}
              className={mode === 'otp' ? 'font-medium text-foreground' : 'text-muted-foreground'}
            >
              验证码登录
            </button>
          </div>

          {mode === 'password' ? (
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>验证码</Label>
              <div className="flex items-center gap-3">
                <OtpInput value={otpCode} onChange={setOtpCode} length={6} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                disabled={countdown.active || sendOtpMutation.isPending || !identifierValid}
                onClick={handleSendOtp}
              >
                {countdown.active
                  ? `${countdown.remaining}s 后重发`
                  : sendOtpMutation.isPending
                    ? '发送中…'
                    : '发送验证码'}
              </Button>
              {otpNotice && <p className="text-xs text-muted-foreground">{otpNotice}</p>}
            </div>
          )}

          {formError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? '登录中…' : '登录'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          还没有账号？{' '}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            免费注册
          </Link>
        </p>
      </div>
    </div>
  )
}
