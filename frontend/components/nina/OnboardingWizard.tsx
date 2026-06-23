'use client'

import React, { useState } from 'react'
import { X, ChevronRight, CheckCircle } from 'lucide-react'
import { Button } from './Button'

interface OnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0)

  const steps = [
    { title: 'Identidade', description: 'Configure o nome da empresa' },
    { title: 'WhatsApp', description: 'Configure a API do WhatsApp' },
    { title: 'Agente IA', description: 'Configure o prompt do agente' },
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Configurar Sistema</h2>
            <p className="text-sm text-slate-400 mt-1">Etapa {currentStep + 1} de {steps.length}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-white mb-2">{steps[currentStep].title}</h3>
            <p className="text-slate-400">{steps[currentStep].description}</p>
          </div>

          <div className="p-6 bg-slate-800/50 rounded-lg border border-slate-700 min-h-[200px] flex items-center justify-center">
            <p className="text-slate-400">Formulário da etapa {currentStep + 1} virá aqui</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-700">
          <div className="flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index <= currentStep ? 'bg-cyan-500 w-8' : 'bg-slate-700 w-2'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              Anterior
            </Button>
            {currentStep === steps.length - 1 ? (
              <Button variant="primary" onClick={onClose} className="gap-2">
                <CheckCircle className="w-4 h-4" />
                Concluir
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                className="gap-2"
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
