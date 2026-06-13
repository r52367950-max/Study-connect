'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Check, X, WifiOff, ChevronRight, Flag } from 'lucide-react'
import {
  getPendingMaterials,
  approveMaterial,
  rejectMaterial,
  offlineMaterial,
  getMaterialReports,
  processMaterialReport,
} from '@/lib/api/admin'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Pagination } from '@/components/shared/pagination'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { toast } from '@/components/ui/use-toast'
import { formatRelativeTime } from '@/lib/utils'

type ActionType = 'approve' | 'reject' | 'offline' | 'report-resolve' | 'report-reject' | null

export default function AdminPage() {
  const router = useRouter()
  const { isLoggedIn, isAdmin, initialized } = useAuth()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [actionTarget, setActionTarget] = useState<string | null>(null)
  const [actionType, setActionType] = useState<ActionType>(null)
  const [reason, setReason] = useState('')

  // Admin guard — wait for auth bootstrap to settle before deciding, otherwise
  // a refresh on /admin briefly sees `isLoggedIn=false` and bounces to /login,
  // even for an authenticated admin. (Matches profile/favorites pattern.)
  useEffect(() => {
    if (!initialized) return
    if (!isLoggedIn) { router.replace('/login?redirect=/admin'); return }
    if (!isAdmin) { router.replace('/'); return }
  }, [initialized, isLoggedIn, isAdmin, router])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'pending', page],
    queryFn: () => getPendingMaterials({ page, pageSize: 10 }),
    enabled: isAdmin,
  })

  const { data: reportData } = useQuery({
    queryKey: ['admin', 'reports', page],
    queryFn: () => getMaterialReports({ page, pageSize: 10 }),
    enabled: isAdmin,
  })

  // After the last item on page N is reviewed, the refetched page comes back
  // empty and the empty state hides the Pagination — clamp back to the last
  // page that still has items so the admin isn't stranded.
  useEffect(() => {
    if (!data) return
    if (data.items.length === 0 && page > 1) {
      const lastPage = Math.max(1, Math.ceil(data.total / 10))
      if (page > lastPage) setPage(lastPage)
    }
  }, [data, page])

  const invalidatePending = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'pending'] })
  }

  // Invalidate public caches so approved/rejected/offline materials appear or
  // disappear for all users within the current staleTime window.
  const invalidatePublic = (materialId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['materials'] })
    void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    if (materialId) {
      void queryClient.invalidateQueries({ queryKey: ['material', materialId] })
    }
  }

  const approveMut = useMutation({
    mutationFn: approveMaterial,
    onSuccess: (_data, id) => {
      toast({ title: '已通过审核' })
      invalidatePending()
      invalidatePublic(id)
      closeDialog()
    },
    onError: (err) => toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) }),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectMaterial(id, reason),
    onSuccess: (_data, { id }) => {
      toast({ title: '已驳回' })
      invalidatePending()
      invalidatePublic(id)
      closeDialog()
    },
    onError: (err) => toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) }),
  })

  const reportMut = useMutation({
    mutationFn: ({ id, reason, offlineMaterial }: { id: string; reason: string; offlineMaterial?: boolean }) =>
      processMaterialReport(id, { status: offlineMaterial ? 'RESOLVED' : 'REJECTED', reason, offlineMaterial }),
    onSuccess: (data) => {
      toast({ title: '举报已处理' })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
      invalidatePublic(data.materialId)
      closeDialog()
    },
    onError: (err) => toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) }),
  })

  const offlineMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => offlineMaterial(id, reason),
    onSuccess: (_data, { id }) => {
      toast({ title: '已下线' })
      invalidatePending()
      invalidatePublic(id)
      closeDialog()
    },
    onError: (err) => toast({ variant: 'destructive', title: '操作失败', description: getErrorMessage(err) }),
  })

  const openDialog = (id: string, type: ActionType) => {
    setActionTarget(id)
    setActionType(type)
    setReason('')
  }
  const closeDialog = () => { setActionTarget(null); setActionType(null); setReason('') }

  const handleDialogConfirm = () => {
    if (!actionTarget) return
    if (actionType === 'approve') approveMut.mutate(actionTarget)
    if (actionType === 'reject') rejectMut.mutate({ id: actionTarget, reason })
    if (actionType === 'offline') offlineMut.mutate({ id: actionTarget, reason })
    if (actionType === 'report-resolve') reportMut.mutate({ id: actionTarget, reason, offlineMaterial: true })
    if (actionType === 'report-reject') reportMut.mutate({ id: actionTarget, reason })
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground">
          <Shield className="h-5 w-5 text-background" />
        </div>
        <div>
          <h1 className="text-xl font-bold">审核后台</h1>
          <p className="text-sm text-muted-foreground">管理待审核资料</p>
        </div>
        {data && (
          <Badge variant="secondary" className="ml-auto">
            {data.total} 条待审核
          </Badge>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingSpinner size="lg" className="py-20" text="加载中…" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="暂无待审核资料" description="所有资料已处理完毕" className="py-20" />
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {item.subject && <Badge variant="secondary" className="text-xs">{item.subject}</Badge>}
                  {item.stage && <Badge variant="outline" className="text-xs">{item.stage}</Badge>}
                  {item.grade && <Badge variant="outline" className="text-xs">{item.grade}</Badge>}
                </div>
                <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.uploader.username} · {formatRelativeTime(item.createdAt)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                  disabled={approveMut.isPending}
                  onClick={() => openDialog(item.id, 'approve')}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => openDialog(item.id, 'reject')}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  驳回
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => openDialog(item.id, 'offline')}
                >
                  <WifiOff className="mr-1.5 h-3.5 w-3.5" />
                  下线
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  asChild
                >
                  <a href={`/materials/${item.id}`} target="_blank" rel="noopener noreferrer">
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          ))}

          <Pagination
            page={page}
            total={data.total}
            pageSize={10}
            onPageChange={setPage}
            className="pt-4"
          />
        </div>
      )}


      {reportData?.items.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-4">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">资料举报</h2>
            <Badge variant="secondary">{reportData.total} 条</Badge>
          </div>
          {reportData.items.map((report) => (
            <div key={report.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={report.status === 'OPEN' ? 'destructive' : 'secondary'}>{report.status}</Badge>
                    <a className="font-medium text-sm hover:underline" href={`/materials/${report.material.id}`} target="_blank" rel="noopener noreferrer">{report.material.title}</a>
                  </div>
                  <p className="text-sm">{report.reason}</p>
                  {report.description && <p className="text-xs text-muted-foreground">说明：{report.description}</p>}
                  {report.evidence && <p className="text-xs text-muted-foreground">证据：{report.evidence}</p>}
                  <p className="text-xs text-muted-foreground">举报人 {report.reporter.username} · {formatRelativeTime(report.createdAt)}</p>
                  {report.adminReason && <p className="text-xs text-muted-foreground">处理理由：{report.adminReason}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" disabled={reportMut.isPending || report.status === 'RESOLVED'} onClick={() => openDialog(report.id, 'report-resolve')}>下线并解决</Button>
                  <Button size="sm" variant="ghost" disabled={reportMut.isPending || report.status === 'REJECTED'} onClick={() => openDialog(report.id, 'report-reject')}>驳回举报</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Approve / Reject / Offline dialog */}
      <Dialog open={!!actionTarget} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? '确认通过审核' : actionType === 'reject' ? '驳回资料' : actionType === 'offline' ? '下线资料' : actionType === 'report-resolve' ? '处理举报并下线资料' : '驳回举报'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? '通过后资料将对所有用户公开，请确认内容合规。'
                : actionType === 'reject'
                  ? '请填写驳回原因，将通知上传者'
                  : '请填写下线原因（选填）'}
            </DialogDescription>
          </DialogHeader>
          {actionType !== 'approve' && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">
                原因{actionType === 'reject' ? ' *' : '（选填）'}
              </Label>
              <Textarea
                id="reason"
                placeholder={actionType === 'reject' ? '请说明不符合规范的原因…' : '可选填下线原因…'}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              disabled={
                (actionType === 'reject' && !reason.trim()) ||
                approveMut.isPending ||
                rejectMut.isPending ||
                offlineMut.isPending ||
                reportMut.isPending
              }
              onClick={handleDialogConfirm}
            >
              {actionType === 'approve' ? '确认通过' : actionType === 'reject' ? '确认驳回' : actionType === 'offline' ? '确认下线' : '确认处理'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
