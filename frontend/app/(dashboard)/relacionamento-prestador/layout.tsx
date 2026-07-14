import type { ReactNode } from "react"
import { RemuneracaoRPProvider } from "@/contexts/RemuneracaoRPContext"

export default function RelacionamentoPrestadorLayout({ children }: { children: ReactNode }) {
  return <RemuneracaoRPProvider>{children}</RemuneracaoRPProvider>
}
