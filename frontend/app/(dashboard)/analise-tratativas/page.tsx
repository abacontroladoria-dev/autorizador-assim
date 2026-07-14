import { Suspense } from "react"
import { TratativasTab } from "@/components/central-terapeutas/tratativas/TratativasTab"

export default function AnaliseTratativasPage() {
  return (
    <Suspense fallback={null}>
      <TratativasTab />
    </Suspense>
  )
}
