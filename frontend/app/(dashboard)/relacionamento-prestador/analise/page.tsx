import { Suspense } from "react"
import { AnaliseFuturaTab } from "@/components/cronograma/remuneracao/AnaliseFuturaTab"

export default function RelacionamentoPrestadorAnalisePage() {
  return (
    <Suspense fallback={null}>
      <AnaliseFuturaTab />
    </Suspense>
  )
}
