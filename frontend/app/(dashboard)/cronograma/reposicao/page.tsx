"use client"

import { Suspense } from "react"
import { ReposicaoShell } from "@/components/cronograma/reposicao/ReposicaoShell"

export default function ReposicaoPage() {
  return (
    <Suspense fallback={null}>
      <ReposicaoShell />
    </Suspense>
  )
}
