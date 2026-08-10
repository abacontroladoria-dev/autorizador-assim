import { Suspense } from "react"
import { PepEntregasTab } from "@/components/cronograma/remuneracao/PepEntregasTab"

export default function RelacionamentoPrestadorPepPage() {
  return (
    <Suspense fallback={null}>
      <PepEntregasTab />
    </Suspense>
  )
}
