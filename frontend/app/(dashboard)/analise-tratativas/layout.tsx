import type { ReactNode } from "react"
import { TratativasProvider } from "@/contexts/TratativasContext"

export default function AnaliseTratativasLayout({ children }: { children: ReactNode }) {
  return <TratativasProvider>{children}</TratativasProvider>
}
