'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { User, Upload, Download, Settings } from 'lucide-react'
import { getMe } from '@/lib/api/auth'
import { getMaterials } from '@/lib/api/materials'
import { useAuth } from '@/hooks/use-auth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MaterialCard } from '@/components/materials/material-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageLoader } from '@/components/shared/loading-spinner'
import { formatDate } from '@/lib/utils'

export default function ProfilePage() {
  const router = useRouter()
  const { isLoggedIn, user, logout } = useAuth()

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login?redirect=/profile')
  }, [isLoggedIn, router])

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: isLoggedIn,
  })

  if (!isLoggedIn || !user) return <PageLoader />

  const currentUser = meData ?? user

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
              <p className="text-sm text-muted-foreground">{currentUser.email}</p>
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
