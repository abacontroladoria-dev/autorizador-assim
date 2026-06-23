'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { AuthProvider, useAuth } from '@/hooks/nina/useAuth'
import { CompanySettingsProvider } from '@/hooks/nina/useCompanySettings'

function ConnectLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        <div className="flex-1 w-full h-full relative overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

function ConnectLayoutGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || loading) return

    if (!user) {
      router.push('/auth')
      return
    }

    // Redirect /connect to /connect/dashboard
    if (pathname === '/connect' || pathname === '/connect/') {
      router.replace('/connect/dashboard')
      return
    }
  }, [user, loading, mounted, router, pathname])

  if (!mounted || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950">
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

  return <ConnectLayoutContent>{children}</ConnectLayoutContent>
}

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <CompanySettingsProvider>
        <OnboardingProvider>
          <ConnectLayoutGuard>{children}</ConnectLayoutGuard>
        </OnboardingProvider>
      </CompanySettingsProvider>
    </AuthProvider>
  )
}
