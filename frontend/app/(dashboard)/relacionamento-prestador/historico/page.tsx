import { HistoricoTab } from "@/components/cronograma/remuneracao/HistoricoTab"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Histórico Mensal",
}

export default function HistoricoPage() {
  return <HistoricoTab />
}
