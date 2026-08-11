'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './useAuth'

// ============================================================================
// CompanySettingsProvider
//
// Antes lia nina_settings_public e user_roles direto do browser — nenhuma das
// duas existe neste banco, então toda montagem da Central disparava dois 404 e
// caía em valores genéricos ("Sua Empresa", "Agente").
//
// Agora lê /api/central/organization, que serve central.organizations. Precisa
// ser rota de servidor porque o schema central não é exposto ao PostgREST.
// ============================================================================

interface CompanySettings {
  companyName: string
  sdrName:     string
  timezone:    string
  loading:     boolean
  isAdmin:     boolean
  centralRole: string | null
  // Erro de carregamento fica visível para o consumidor em vez de virar valor
  // genérico silencioso: o painel afirmar o nome errado da clínica é pior do
  // que admitir que não carregou.
  erro:        string | null
  refetch:     () => Promise<void>
}

const CompanySettingsContext = createContext<CompanySettings | undefined>(undefined)

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState('')
  const [sdrName, setSdrName]         = useState('')
  const [timezone, setTimezone]       = useState('America/Sao_Paulo')
  const [centralRole, setCentralRole] = useState<string | null>(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [erro, setErro]               = useState<string | null>(null)
  const { user } = useAuth()

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    setErro(null)
    try {
      const resp = await fetch('/api/central/organization/')
      const body = await resp.json().catch(() => null)

      if (!resp.ok) {
        setErro(body?.error?.message ?? `Falha ao carregar a organização (HTTP ${resp.status})`)
        return
      }

      const org = body?.data ?? {}
      setCompanyName(org.nome      ?? '')
      setSdrName(org.agentName     ?? '')
      setTimezone(org.timezone     ?? 'America/Sao_Paulo')
      setCentralRole(org.centralRole ?? null)
      setIsAdmin(!!org.isAdmin)
    } catch (err) {
      setErro('Falha de rede ao carregar a organização')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { void fetchSettings() }, [fetchSettings])

  const value: CompanySettings = {
    companyName,
    sdrName,
    timezone,
    loading,
    isAdmin,
    centralRole,
    erro,
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
