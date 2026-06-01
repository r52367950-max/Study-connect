'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { OnboardingForm } from '@/components/onboarding/onboarding-form'
import { toast } from '@/components/ui/use-toast'
import { safeRedirect } from '@/lib/utils'

function LoadingBox() {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingBox />}>
      <OnboardingPageContent />
    </Suspense>
  )
}

function OnboardingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // safeRedirect rejects scheme/protocol-relative URLs so `?redirect=//evil.com`
  // can't bounce a freshly-onboarded user to an attacker-controlled origin.
  const redirect = safeRedirect(searchParams.get('redirect'))
  const { isLoggedIn, initialized } = useAuth()
  const { data: profile, isLoading } = useProfile()

  useEffect(() => {
    if (initialized && !isLoggedIn) {
      router.replace(`/login?redirect=${encodeURIComponent('/onboarding')}`)
    }
  }, [initialized, isLoggedIn, router])

  // Already onboarded → bounce to the requested target.
  useEffect(() => {
    if (profile?.onboardedAt) {
      router.replace(redirect)
    }
  }, [profile?.onboardedAt, redirect, router])

  if (!initialized || (isLoggedIn && isLoading)) {
    return <LoadingBox />
  }

  return (
    <div className="mx-auto w-full max-w-xl py-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold">完善资料</h1>
        <p className="text-sm text-muted-foreground">
          告诉我们你是谁、教哪些学段和学科，我们好把对的资料推给你
        </p>
      </div>
      <OnboardingForm
        initialValue={profile ?? null}
        onSaved={() => {
          toast({ title: '欢迎加入 StudyConnect', description: '已根据你的资料为你准备推荐' })
          router.replace(redirect)
        }}
      />
    </div>
  )
}
