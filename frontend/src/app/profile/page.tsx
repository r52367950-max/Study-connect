'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Upload, Download, Settings, ChevronDown, ShieldCheck } from 'lucide-react'
import { getMe } from '@/lib/api/auth'
import { anonymizeMyAccount, exportMyData, updateMyProfile } from '@/lib/api/users'
import { getMaterials } from '@/lib/api/materials'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { OnboardingForm } from '@/components/onboarding/onboarding-form'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MaterialCard } from '@/components/materials/material-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageLoader } from '@/components/shared/loading-spinner'
import { formatDate, cn } from '@/lib/utils'
import { identifierLabel } from '@/lib/user-display'

export default function ProfilePage() {
  const router = useRouter()
  const { initialized, isLoggedIn, user, logout } = useAuth()

  useEffect(() => {
    if (initialized && !isLoggedIn) router.replace('/login?redirect=/profile')
  }, [initialized, isLoggedIn, router])

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: isLoggedIn,
  })

  if (!initialized || !isLoggedIn || !user) return <PageLoader />

  const currentUser = meData ?? user
  const identifier = identifierLabel(currentUser)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg bg-foreground text-background">
                {currentUser.username?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{currentUser.username}</h1>
                {currentUser.role === 'ADMIN' && (
                  <Badge variant="default" className="text-xs">管理员</Badge>
                )}
              </div>
              {identifier ? (
                <p className="text-sm text-muted-foreground">{identifier}</p>
              ) : null}
              {currentUser.createdAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  加入于 {formatDate(currentUser.createdAt)}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="shrink-0">
              退出登录
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="uploads">
        <TabsList>
          <TabsTrigger value="uploads" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            我的上传
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            下载记录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uploads" className="mt-4">
          <MyUploads />
        </TabsContent>

        <TabsContent value="downloads" className="mt-4">
          <EmptyState
            icon={<Download className="h-6 w-6" />}
            title="下载记录暂未开放"
            description="该功能正在开发中，敬请期待"
            className="py-12"
          />
        </TabsContent>
      </Tabs>

      {/* Privacy controls */}
      <PrivacySettingsSection />

      {/* Onboarding profile editor */}
      <EditOnboardingSection />
    </div>
  )
}


function PrivacySettingsSection() {
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const { logout } = useAuth()
  const [message, setMessage] = useState<string | null>(null)

  const optInMutation = useMutation({
    mutationFn: (collaborativeOptIn: boolean) => updateMyProfile({ collaborativeOptIn }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      setMessage(updated.collaborativeOptIn ? '已开启协同推荐。' : '已关闭协同推荐，后续协同信号计算会排除你的行为数据。')
    },
  })

  const exportMutation = useMutation({
    mutationFn: exportMyData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `study-connect-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('数据导出文件已开始下载。')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: anonymizeMyAccount,
    onSuccess: async () => {
      setMessage('账号已匿名化。公开资料会保留为平台内容，个人资料和行为记录已清理。')
      await logout()
    },
  })

  const handleDelete = () => {
    const ok = window.confirm('确认匿名化并退出账号？此操作会清空邮箱/手机号/学校/城市等 PII，删除收藏、下载和浏览行为；已审核公开上传资料会保留为平台公共内容。')
    if (ok) deleteMutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          隐私与数据
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded-lg bg-muted/40 p-3 text-muted-foreground">
          <p>关闭协同推荐后，你将不再进入后续「同校老师常用」等协同信号计算。账号删除采用匿名化：公开审核通过的上传资料保留为平台公共内容；邮箱、手机号、用户名、学校、城市、展示名等 PII 会清空，收藏、下载、浏览行为会删除。</p>
          <p className="mt-2">行为数据保留周期：浏览事件 180 天，下载记录 365 天，后台定期清理。</p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={profile?.collaborativeOptIn ?? true}
            disabled={!profile || optInMutation.isPending}
            onChange={(event) => optInMutation.mutate(event.target.checked)}
          />
          <span>
            <span className="font-medium">参与协同推荐</span>
            <span className="block text-xs text-muted-foreground">开启时仅使用满足人数阈值的聚合同校收藏信号，不展示单个用户身份。</span>
          </span>
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? '导出中…' : '导出我的数据'}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? '处理中…' : '删除/匿名化账号'}
          </Button>
        </div>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  )
}

function EditOnboardingSection() {
  const [open, setOpen] = useState(false)
  const { data: profile } = useProfile()

  // Open + scroll to this section when reached via `/profile#onboarding`
  // (the sidebar "修改入职信息" menu item).
  useEffect(() => {
    const applyHash = () => {
      if (window.location.hash !== '#onboarding') return
      setOpen(true)
      requestAnimationFrame(() => {
        document
          .getElementById('onboarding')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  return (
    <div id="onboarding" className="scroll-mt-24 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent/40"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Settings className="h-4 w-4 text-muted-foreground" />
          修改入职信息
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open &&
        (profile ? (
          <OnboardingForm editing initialValue={profile} />
        ) : (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            加载中…
          </div>
        ))}
    </div>
  )
}

function MyUploads() {
  // Use the public list endpoint filtered by current user's uploads
  // Note: backend doesn't have /users/me/materials yet — placeholder with general list
  const { data, isLoading } = useQuery({
    queryKey: ['materials', { sort: 'latest', page: 1, pageSize: 20 }],
    queryFn: () => getMaterials({ sort: 'latest', page: 1, pageSize: 20 }),
  })

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">提示：</span>
          个人上传记录接口正在开发中，当前显示为公开资料库预览。
        </p>
      </div>

      <Button asChild className="w-full" variant="outline">
        <Link href="/upload">
          <Upload className="mr-2 h-4 w-4" />
          上传新资料
        </Link>
      </Button>

      {!data?.items.length ? (
        <EmptyState
          icon={<Upload className="h-6 w-6" />}
          title="暂无上传记录"
          description="上传第一份资料，帮助更多同学"
          action={
            <Button asChild size="sm">
              <Link href="/upload">立即上传</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.slice(0, 6).map((m) => (
            <MaterialCard key={m.id} material={m} />
          ))}
        </div>
      )}
    </div>
  )
}
