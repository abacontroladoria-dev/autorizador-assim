'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

export interface OnboardingStep {
  id: string
  title: string
  description: string
  isComplete: boolean
  isRequired: boolean
}

export interface OnboardingStatus {
  loading: boolean
  isComplete: boolean
  currentStep: number
  steps: OnboardingStep[]
  completionPercentage: number
  hasSeenWizard: boolean
  isAdmin: boolean
  refetch: () => Promise<void>
  markWizardSeen: () => void
  resetWizard: () => void
}

const WIZARD_SEEN_KEY = 'onboarding_wizard_seen'

export function useOnboardingStatus(): OnboardingStatus {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  // Permanece no contrato do hook, mas hoje é sempre false: a fonte era
  // `user_roles`, tabela do projeto Nina morto. Nenhum consumidor lê este campo
  // — quem precisa de permissão usa useCompanySettings, que lê central_role
  // pela rota /api/central/organization.
  const isAdmin = false
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'identity',
      title: 'Identidade',
      description: 'Configure o nome da empresa e do agente',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      description: 'Configure a API do WhatsApp Cloud',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'agent',
      title: 'Agente',
      description: 'Configure o prompt e comportamento do agente',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'elevenlabs',
      title: 'ElevenLabs',
      description: 'Configure respostas em áudio (opcional)',
      isComplete: false,
      isRequired: false,
    },
    {
      id: 'business_hours',
      title: 'Horário',
      description: 'Configure o horário de atendimento',
      isComplete: false,
      isRequired: false,
    },
    {
      id: 'verification',
      title: 'Verificação',
      description: 'Verifique se o sistema está configurado',
      isComplete: false,
      isRequired: false,
    },
    {
      id: 'finish',
      title: 'Finalização',
      description: 'Revise e teste sua configuração',
      isComplete: false,
      isRequired: false,
    },
  ])
  const [hasSeenWizard, setHasSeenWizard] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(WIZARD_SEEN_KEY) === 'true'
  })

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // As duas consultas que existiam aqui — `user_roles` e `nina_settings` —
      // foram removidas. Ambas as tabelas pertencem ao projeto Supabase do CRM
      // Nina, que não existe mais (o host não resolve em DNS), então cada
      // montagem deste hook custava dois 404 e as duas respostas voltavam nulas:
      // `isAdmin` já era sempre false e nenhum passo era marcado como completo.
      // Remover não muda comportamento observável — só para de bater numa porta
      // que não existe.
      //
      // A fonte real destes dados está em central.organizations e
      // central.agent_settings, atrás de /api/central/organization e
      // /api/central/agent-settings. Religar os passos do wizard a elas é
      // trabalho de outra etapa: onboarding não faz parte da camada de IA, e a
      // rota de organização hoje é somente leitura.
      setSteps(prev =>
        prev.map(step =>
          step.id === 'finish' ? { ...step, isComplete: hasSeenWizard } : step
        )
      )
    } finally {
      setLoading(false)
    }
  }, [hasSeenWizard, user])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const markWizardSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WIZARD_SEEN_KEY, 'true')
    }
    setHasSeenWizard(true)
    setSteps(prev => prev.map(step => (step.id === 'finish' ? { ...step, isComplete: true } : step)))
  }, [])

  const resetWizard = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WIZARD_SEEN_KEY)
    }
    setHasSeenWizard(false)
    setSteps(prev => prev.map(step => (step.id === 'finish' ? { ...step, isComplete: false } : step)))
  }, [])

  const requiredSteps = steps.filter(s => s.isRequired)
  const completedRequired = requiredSteps.filter(s => s.isComplete).length
  const allStepsComplete = steps.every(s => s.isComplete)
  const currentStepIndex = steps.findIndex(s => !s.isComplete)
  const completionPercentage = Math.round((steps.filter(s => s.isComplete).length / steps.length) * 100)

  return {
    loading,
    isComplete: allStepsComplete,
    currentStep: currentStepIndex === -1 ? steps.length - 1 : currentStepIndex,
    steps,
    completionPercentage,
    hasSeenWizard,
    isAdmin,
    refetch: fetchStatus,
    markWizardSeen,
    resetWizard,
  }
}
