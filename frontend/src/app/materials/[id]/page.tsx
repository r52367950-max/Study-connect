'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Download, Star, ChevronRight, FileText, Calendar, MapPin, User } from 'lucide-react'
import { getMaterial, downloadMaterial } from '@/lib/api/materials'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RatingForm } from '@/components/materials/rating-form'
import { RatingList } from '@/components/materials/rating-list'
import { LoginPromptDialog } from '@/components/shared/login-prompt-dialog'
import { PageLoader } from '@/components/shared/loading-spinner'
import { ErrorState } from '@/components/shared/error-state'
import { toast } from '@/components/ui/use-toast'
import { formatDate, formatScore } from '@/lib/utils'

export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isLoggedIn } = useAuth()
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)
  const [loginPromptMsg, setLoginPromptMsg] = useState('')
  const [downloading, setDownloading] = useState(false)

  const { data: material, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['material', id],
    queryFn: () => getMaterial(id),
    enabled: !!id,
  })

  const handleDownload = async () => {
    if (!isLoggedIn) {
      setLoginPromptMsg('登录后即可下载资料')
      setLoginPromptOpen(true)
      return
    }
    try {
      setDownloading(true)
      const { downloadUrl } = await downloadMaterial(id)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast({ variant: 'destructive', title: '下载失败', description: getErrorMessage(err) })
    } finally {
      setDownloading(false)
    }
  }

  const handleRatingGuard = () => {
    if (!isLoggedIn) {
      setLoginPromptMsg('登录后即可评分')
      setLoginPromptOpen(true)
      return false
    }
    return true
  }

  if (isLoading) return <PageLoader />
  if (isError || !material) {
    return (
      <ErrorState
        message={getErrorMessage(error)}
        onRetry={() => refetch()}
        className="mt-12"
      />
    )
  }

  return (
    <>
      <LoginPromptDialog
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
        message={loginPromptMsg}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/materials" className="hover:text-foreground transition-colors">资料库</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="line-clamp-1 text-foreground">{material.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* ─── Left: Main content ───────────────────────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {material.subject && <Badge variant="secondary">{material.subject}</Badge>}
            {material.stage && <Badge variant="outline">{material.stage}</Badge>}
            {material.grade && <Badge variant="outline">{material.grade}</Badge>}
            {material.year && <Badge variant="outline">{material.year}年</Badge>}
            {material.region && <Badge variant="outline">{material.region}</Badge>}
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold leading-snug">{material.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {material.uploader && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {material.uploader.username}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(material.createdAt)}
              </span>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap gap-6 rounded-xl border bg-muted/30 px-5 py-4">
            <div className="text-center">
              <p className="text-2xl font-semibold">{formatScore(material.avg_score)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">平均评分</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <p className="text-2xl font-semibold">{material.rating_count ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">评价数</p>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <p className="text-2xl font-semibold">{material.download_count ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">下载数</p>
            </div>
          </div>

          {/* Description */}
          {material.description && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">资料简介</h2>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {material.description}
              </p>
            </div>
          )}

          <Separator />

          {/* Ratings section */}
          <div className="space-y-5">
            <h2 className="text-base font-semibold">用户评价</h2>
            <RatingList materialId={id} />

            <Separator />

            <div>
              <h3 className="mb-4 text-sm font-semibold">写下您的评价</h3>
              {isLoggedIn ? (
                <RatingForm materialId={id} />
              ) : (
                <button
                  onClick={() => handleRatingGuard()}
                  className="w-full rounded-xl border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  登录后即可评分 →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Sidebar ───────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Download card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">下载此资料</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">文件</span>
                <span className="ml-auto font-medium">
                  {material.fileKey?.split('/').pop() ?? '资料文件'}
                </span>
              </div>

              <Button
                className="w-full"
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading ? '准备中…' : '下载'}
              </Button>

              {!isLoggedIn && (
                <p className="text-center text-xs text-muted-foreground">
                  需要登录才能下载
                </p>
              )}
            </CardContent>
          </Card>

          {/* Meta card */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              {material.stage && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">学段</span>
                  <span className="font-medium">{material.stage}</span>
                </div>
              )}
              {material.grade && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">年级</span>
                  <span className="font-medium">{material.grade}</span>
                </div>
              )}
              {material.subject && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">学科</span>
                  <span className="font-medium">{material.subject}</span>
                </div>
              )}
              {material.year && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">年份</span>
                  <span className="font-medium">{material.year}</span>
                </div>
              )}
              {material.region && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">地区</span>
                  <span className="font-medium">{material.region}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">评分</span>
                <span className="flex items-center gap-1 font-medium">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {formatScore(material.avg_score)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Related — placeholder */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">相关推荐</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">功能即将上线</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
