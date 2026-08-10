import { Suspense } from "react"
import { PepHistoricoTab } from "@/components/cronograma/remuneracao/PepHistoricoTab"

export default function RelacionamentoPrestadorPepHistoricoPage() {
  return (
    <Suspense fallback={null}>
      <PepHistoricoTab />
    </Suspense>
  )
}
