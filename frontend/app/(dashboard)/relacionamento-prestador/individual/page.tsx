import { Suspense } from "react"
import { RemunIndividualTab } from "@/components/cronograma/remuneracao/RemunIndividualTab"

export default function RelacionamentoPrestadorIndividualPage() {
  return (
    <Suspense fallback={null}>
      <RemunIndividualTab />
    </Suspense>
  )
}
