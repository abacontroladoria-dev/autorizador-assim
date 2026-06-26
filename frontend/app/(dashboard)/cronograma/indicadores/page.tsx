import { Suspense } from "react"
import { OcupacaoProfShell } from "@/components/cronograma/indicadores/OcupacaoProfShell"

export default function OcupacaoProfPage() {
  return (
    <Suspense fallback={null}>
      <OcupacaoProfShell />
    </Suspense>
  )
}
