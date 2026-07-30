"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useTratativas } from "@/hooks/useTratativas"

type TratativasContextType = ReturnType<typeof useTratativas>

const TratativasContext = createContext<TratativasContextType | null>(null)

export function TratativasProvider({ children }: { children: ReactNode }) {
  const value = useTratativas()
  return (
    <TratativasContext.Provider value={value}>
      {children}
    </TratativasContext.Provider>
  )
}

export function useTratativasContext() {
  const context = useContext(TratativasContext)
  if (!context) {
    throw new Error("useTratativasContext deve ser usado dentro de um TratativasProvider")
  }
  return context
}
