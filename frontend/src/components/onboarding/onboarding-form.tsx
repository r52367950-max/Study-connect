'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMyProfile } from '@/lib/api/users'
import { getErrorMessage } from '@/lib/api/client'
import type { Profile, ProfileRole, SchoolSummary, UpdateProfilePayload } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  DEMO_CITIES,
  GRADES_BY_STAGE,
  STAGES,
  SUBJECTS,
} from './constants'
import { SchoolCombobox } from './school-combobox'

interface OnboardingFormProps {
  initialValue?: Profile | null
  /** When true, render as a single-page editor with a "Save" button. */
  editing?: boolean
  /** Called after the API write succeeds. */
  onSaved?: (profile: Profile) => void
}

type Draft = {
  profileRole: ProfileRole | null
  displayName: string
  city: string
  school: SchoolSummary | null
  schoolNameFreeText: string
  stages: string[]
  grades: string[]
  subjects: string[]
  collaborativeOptIn: boolean
}

function toDraft(profile: Profile | null | undefined): Draft {
  return {
    profileRole: profile?.profileRole ?? null,
    displayName: profile?.displayName ?? '',
    city: profile?.city ?? '',
    school: profile?.school ?? null,
    schoolNameFreeText: profile?.schoolNameFreeText ?? '',
    stages: profile?.stages ?? [],
    grades: profile?.grades ?? [],
    subjects: profile?.subjects ?? [],
    collaborativeOptIn: profile?.collaborativeOptIn ?? true,
  }
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export function OnboardingForm({ initialValue, editing = false, onSaved }: OnboardingFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialValue))
  const [step, setStep] = useState<1 | 2>(1)
  const [formError, setFormError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile'], profile)
      onSaved?.(profile)
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  })

  // Drop grades that aren't valid under the currently selected stages.
  const availableGrades = draft.stages.flatMap((s) => GRADES_BY_STAGE[s as keyof typeof GRADES_BY_STAGE] ?? [])
  const filteredGrades = draft.stages.length === 0
    ? draft.grades
    : draft.grades.filter((g) => availableGrades.includes(g))

  const validateStep1 = (): string | null => {
    if (!draft.profileRole) return '请选择您的身份'
    if (!draft.displayName.trim()) return '请填写称呼'
    return null
  }
  const validateStep2 = (): string | null => {
    if (!draft.city.trim() && !draft.school && !draft.schoolNameFreeText.trim()) {
      return '请填写城市或选择学校'
    }
    if (draft.stages.length === 0) return '请至少选择一个学段'
    if (draft.subjects.length === 0) return '请至少选择一个学科'
    return null
  }

  const buildPayload = (): UpdateProfilePayload => ({
    profileRole: draft.profileRole ?? undefined,
    displayName: draft.displayName.trim() || undefined,
    city: draft.city.trim() || undefined,
    schoolId: draft.school ? draft.school.id : draft.schoolNameFreeText ? null : undefined,
    schoolNameFreeText: draft.schoolNameFreeText.trim() || (draft.school ? null : undefined),
    stages: draft.stages,
    grades: filteredGrades,
    subjects: draft.subjects,
    collaborativeOptIn: draft.collaborativeOptIn,
  })

  const handleSave = () => {
    setFormError(null)
    const err = validateStep1() ?? validateStep2()
    if (err) {
      setFormError(err)
      if (editing) return
      setStep(validateStep1() ? 1 : 2)
      return
    }
    mutation.mutate(buildPayload())
  }

  const goNext = () => {
    const err = validateStep1()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setStep(2)
  }

  // ─── Sub-renderers ─────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>您是…</Label>
        <div className="grid grid-cols-2 gap-3">
          {(['TEACHER', 'STUDENT'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, profileRole: role }))}
              className={cn(
                'rounded-lg border px-4 py-6 text-center text-sm transition-colors',
                draft.profileRole === role
                  ? 'border-foreground bg-foreground/5 font-medium'
                  : 'border-input hover:bg-muted/50',
              )}
            >
              {role === 'TEACHER' ? '老师' : '学生'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="displayName">称呼</Label>
        <Input
          id="displayName"
          value={draft.displayName}
          onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
          placeholder={draft.profileRole === 'STUDENT' ? '同学' : '林老师'}
          maxLength={32}
        />
        <p className="text-xs text-muted-foreground">显示在侧栏，可随时修改</p>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="city">所在城市</Label>
        <Input
          id="city"
          list="onboarding-city-list"
          value={draft.city}
          onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
          placeholder="北京"
          maxLength={32}
        />
        <datalist id="onboarding-city-list">
          {DEMO_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <Label>学校</Label>
        <SchoolCombobox
          city={draft.city}
          selected={draft.school}
          freeText={draft.schoolNameFreeText}
          onSelect={(school) =>
            setDraft((d) => ({ ...d, school, schoolNameFreeText: school ? '' : d.schoolNameFreeText }))
          }
          onFreeTextChange={(v) =>
            setDraft((d) => ({ ...d, schoolNameFreeText: v, school: v ? null : d.school }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label>学段（可多选）</Label>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <ChipButton
              key={s}
              active={draft.stages.includes(s)}
              onClick={() => setDraft((d) => ({ ...d, stages: toggle(d.stages, s) }))}
            >
              {s}
            </ChipButton>
          ))}
        </div>
      </div>

      {draft.stages.length > 0 && (
        <div className="space-y-2">
          <Label>年级（可多选）</Label>
          <div className="flex flex-wrap gap-2">
            {draft.stages.flatMap((s) => GRADES_BY_STAGE[s as keyof typeof GRADES_BY_STAGE] ?? []).map((g) => (
              <ChipButton
                key={g}
                active={draft.grades.includes(g)}
                onClick={() => setDraft((d) => ({ ...d, grades: toggle(d.grades, g) }))}
              >
                {g}
              </ChipButton>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>学科（可多选）</Label>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <ChipButton
              key={s}
              active={draft.subjects.includes(s)}
              onClick={() => setDraft((d) => ({ ...d, subjects: toggle(d.subjects, s) }))}
            >
              {s}
            </ChipButton>
          ))}
        </div>
      </div>

      {draft.profileRole === 'TEACHER' && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.collaborativeOptIn}
            onChange={(e) => setDraft((d) => ({ ...d, collaborativeOptIn: e.target.checked }))}
            className="mt-1"
          />
          <span>
            参与同校推荐
            <span className="ml-1 text-xs text-muted-foreground">
              （仅以聚合形式展示「同校老师常用」，不暴露姓名；可随时关闭）
            </span>
          </span>
        </label>
      )}
    </div>
  )

  // ─── Layout: step mode vs editing mode ─────────────────────────────────────

  if (editing) {
    return (
      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">基本信息</h2>
          {renderStep1()}
        </section>
        <section className="space-y-4 border-t pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">教学信息</h2>
          {renderStep2()}
        </section>
        {formError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
        )}
        <Button onClick={handleSave} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? '保存中…' : '保存'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <header className="flex items-center justify-between text-xs text-muted-foreground">
        <span>第 {step} / 2 步</span>
        <span>{step === 1 ? '介绍一下你自己' : '让推荐更准'}</span>
      </header>

      {step === 1 ? renderStep1() : renderStep2()}

      {formError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
      )}

      <div className="flex justify-between gap-3">
        {step === 2 ? (
          <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={mutation.isPending}>
            上一步
          </Button>
        ) : (
          <span />
        )}
        {step === 1 ? (
          <Button type="button" onClick={goNext}>
            下一步
          </Button>
        ) : (
          <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? '完成中…' : '完成'}
          </Button>
        )}
      </div>
    </div>
  )
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-input bg-background hover:bg-muted/50',
      )}
    >
      {children}
    </button>
  )
}
