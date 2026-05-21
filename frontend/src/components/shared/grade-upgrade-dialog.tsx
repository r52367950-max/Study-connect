'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMyProfile } from '@/lib/api/users'
import { getErrorMessage } from '@/lib/api/client'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { applyGradeUpgrade, planGradeUpgrade, shouldPromptGradeUpgrade } from '@/lib/grade-upgrade'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

// Suppressed for the rest of this JS session, keyed by user id — set on "暂不"
// or a successful upgrade. Keying by id keeps a dismissal on one account from
// silencing the prompt for another (logout → login as a different user in the
// same SPA session, without a full page reload).
const dismissedUserIds = new Set<string>()

export function GradeUpgradeDialog() {
  const { isLoggedIn } = useAuth()
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'promote' | 'graduate'>('promote')
  const [archiveGraduating, setArchiveGraduating] = useState<boolean | null>(null)
  // The user id we last evaluated, so a new profile (after a user switch) is
  // evaluated once while the same profile isn't re-evaluated. Stays null until a
  // profile arrives, so an async-loaded profile still gets its single check.
  const evaluatedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn || !profile) return
    if (evaluatedFor.current === profile.id) return
    evaluatedFor.current = profile.id
    if (dismissedUserIds.has(profile.id)) return
    if (shouldPromptGradeUpgrade(profile, new Date())) setOpen(true)
  }, [isLoggedIn, profile])

  const mutation = useMutation({
    mutationFn: (grades: string[]) => updateMyProfile({ grades }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      dismissedUserIds.add(updated.id)
      setOpen(false)
      toast({ title: '已升级到新学年', description: '推荐将按更新后的年级为你刷新' })
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: '升级失败', description: getErrorMessage(err) }),
  })

  if (!profile) return null

  const plan = planGradeUpgrade(profile.grades)
  const hasGraduating = plan.graduating.length > 0

  const dismiss = () => {
    dismissedUserIds.add(profile.id)
    setOpen(false)
  }

  const handlePromote = () => {
    if (hasGraduating) {
      setStep('graduate')
      return
    }
    mutation.mutate(applyGradeUpgrade(profile.grades, { archiveGraduating: false }))
  }

  const handleConfirmGraduate = () => {
    if (archiveGraduating == null) return
    mutation.mutate(applyGradeUpgrade(profile.grades, { archiveGraduating }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {step === 'promote' ? (
          <>
            <DialogHeader>
              <DialogTitle>新学年到了</DialogTitle>
              <DialogDescription>要把你的年级整体升一档吗？</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 text-sm">
              {plan.promotions.map((p) => (
                <div key={p.from} className="flex items-center gap-2">
                  <span className="text-muted-foreground">{p.from}</span>
                  <span aria-hidden>→</span>
                  <span className="font-medium">{p.to}</span>
                </div>
              ))}
              {hasGraduating && (
                <p className="pt-1 text-xs text-muted-foreground">
                  毕业班（{plan.graduating.join('、')}）将在下一步确认是否归档。
                </p>
              )}
              {plan.promotions.length === 0 && !hasGraduating && (
                <p className="text-muted-foreground">当前没有可升级的年级。</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={dismiss} disabled={mutation.isPending}>
                暂不
              </Button>
              <Button onClick={handlePromote} disabled={mutation.isPending}>
                整体升一档
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>毕业班处理</DialogTitle>
              <DialogDescription>
                你有毕业班（{plan.graduating.join('、')}），希望如何处理？
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <ChoiceRow
                active={archiveGraduating === false}
                title="保留原年级"
                desc="继续保留这些年级，方便查看相关资料"
                onClick={() => setArchiveGraduating(false)}
              />
              <ChoiceRow
                active={archiveGraduating === true}
                title="毕业归档"
                desc="从年级列表中移除毕业班（不会删除任何已有数据）"
                onClick={() => setArchiveGraduating(true)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep('promote')}
                disabled={mutation.isPending}
              >
                上一步
              </Button>
              <Button
                onClick={handleConfirmGraduate}
                disabled={mutation.isPending || archiveGraduating == null}
              >
                {mutation.isPending ? '处理中…' : '确认'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ChoiceRow({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border px-4 py-3 text-left transition-colors',
        active ? 'border-foreground bg-foreground/5' : 'border-input hover:bg-muted/50',
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
    </button>
  )
}
