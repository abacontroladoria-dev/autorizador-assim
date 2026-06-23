'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useAuth } from './useAuth'

interface CompanySettings {
  companyName: string
  sdrName: string
  loading: boolean
  isAdmin: boolean
  refetch: () => Promise<void>
}

const CompanySettingsContext = createContext<CompanySettings | undefined>(undefined)

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState('')
  const [sdrName, setSdrName] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const { user } = useAuth()

  const fetchSettings = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      setIsAdmin(roleData?.role === 'admin')

      const { data: viewData, error } = await (supabase as any)
        .from('nina_settings_public')
        .select('company_name, sdr_name')
        .limit(1)
        .maybeSingle()
      const data = viewData as { company_name?: string; sdr_name?: string } | null

      if (error && error.code !== 'PGRST116') {
        console.error('[useCompanySettings] Query error:', error)
        throw error
      }

      if (data) {
        setCompanyName(data.company_name || 'Sua Empresa')
        setSdrName(data.sdr_name || 'Agente')
      } else {
        setCompanyName('Sua Empresa')
        setSdrName('Agente')
      }
    } catch (error) {
      console.error('[useCompanySettings] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [user])

  const value: CompanySettings = {
    companyName,
    sdrName,
    loading,
    isAdmin,
    refetch: fetchSettings,
  }

  return (
    <CompanySettingsContext.Provider value={value}>
      {children}
    </CompanySettingsContext.Provider>
  )
}

export const useCompanySettings = () => {
  const context = useContext(CompanySettingsContext)
  if (context === undefined) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider')
  }
  return context
}
