'use client'

import React from 'react'
import { OnboardingProvider } from '@/contexts/OnboardingContext'

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OnboardingProvider>
      <div className="flex h-full w-full overflow-hidden">
        <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
          <div className="flex-1 w-full h-full relative overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </OnboardingProvider>
  )
}
