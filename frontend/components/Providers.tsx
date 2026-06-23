'use client'

import React from 'react'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/hooks/nina/useAuth'
import { CompanySettingsProvider } from '@/hooks/nina/useCompanySettings'
import { OnboardingProvider } from '@/contexts/OnboardingContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Toaster position="top-right" />
  )
}
