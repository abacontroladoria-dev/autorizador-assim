"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useRemunRP } from "@/hooks/useRemuneracao"

type RemunRPContextType = ReturnType<typeof useRemunRP>

const RemuneracaoRPContext = createContext<RemunRPContextType | null>(null)

export function RemuneracaoRPProvider({ children }: { children: ReactNode }) {
  const value = useRemunRP()
  return (
    <RemuneracaoRPContext.Provider value={value}>
      {children}
    </RemuneracaoRPContext.Provider>
  )
}

export function useRemuneracaoRPContext() {
  const context = useContext(RemuneracaoRPContext)
  if (!context) {
    throw new Error("useRemuneracaoRPContext deve ser usado dentro de um RemuneracaoRPProvider")
  }
  return context
}
