'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/nina/Sidebar'
import { OnboardingWizard } from '@/components/nina/OnboardingWizard'
import { useOnboardingStatus } from '@/hooks/nina/useOnboardingStatus'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { useAuth } from '@/hooks/nina/useAuth'
import { AuthProvider } from '@/hooks/nina/useAuth'
import { CompanySettingsProvider } from '@/hooks/nina/useCompanySettings'
import { OnboardingProvider } from '@/contexts/OnboardingContext'

function NinaLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { isComplete, hasSeenWizard, loading: onboardingLoading } = useOnboardingStatus()
  const { showOnboarding, setShowOnboarding } = useOnboarding()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.push('/auth')
      return
    }

    if (!onboardingLoading && !isComplete && !hasSeenWizard) {
      setShowOnboarding(true)
    }
  }, [user, authLoading, isComplete, hasSeenWizard, onboardingLoading, router, setShowOnboarding])

  if (!mounted || authLoading || onboardingLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>

      <Sidebar />

      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        {/* Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50 z-20"></div>

        <div className="flex-1 w-full h-full relative overflow-y-auto">
          {children}
        </div>
      </main>

      <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  )
}

export default function NinaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <CompanySettingsProvider>
        <OnboardingProvider>
          <NinaLayoutContent>{children}</NinaLayoutContent>
        </OnboardingProvider>
      </CompanySettingsProvider>
    </AuthProvider>
  )
}
