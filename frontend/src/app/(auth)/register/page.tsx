'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpen } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { register as registerApi } from '@/lib/api/auth'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  username: z
    .string()
    .min(2, '用户名至少 2 个字符')
    .max(32, '用户名最多 32 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线或中文'),
  password: z.string().min(6, '密码至少 6 位').max(72, '密码最多 72 位'),
})
type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const { isLoggedIn, setAuth } = useAuth()

  useEffect(() => {
    if (isLoggedIn) router.replace('/materials')
  }, [isLoggedIn, router])

  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const { mutate, isPending } = useMutation({
    mutationFn: registerApi,
    onSuccess: (data) => {
      setAuth(data.user)
      router.replace('/materials')
    },
    onError: (err) => {
      setError('root', { message: getErrorMessage(err) })
    },
  })

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
            <BookOpen className="h-5 w-5 text-background" />
          </div>
          <h1 className="text-xl font-semibold">创建账号</h1>
          <p className="text-sm text-muted-foreground">加入 StudyConnect，开始共享学习</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((d) => mutate(d))}
          className="space-y-4 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="studymaster"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="至少 6 位"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {errors.root && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.root.message}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '注册中…' : '创建账号'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
