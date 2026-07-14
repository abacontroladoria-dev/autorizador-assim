import { Suspense } from "react"
import { RemunRPTab } from "@/components/cronograma/remuneracao/RemunRPTab"

export default function RelacionamentoPrestadorRPPage() {
  return (
    <Suspense fallback={null}>
      <RemunRPTab />
    </Suspense>
  )
}
