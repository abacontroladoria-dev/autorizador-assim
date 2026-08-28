"use client"

import { Suspense } from "react"
import { OcupacaoShell } from "@/components/cronograma/ocupacao/OcupacaoShell"

export default function OcupacaoPage() {
  return (
    <Suspense fallback={null}>
      <OcupacaoShell />
    </Suspense>
  )
}