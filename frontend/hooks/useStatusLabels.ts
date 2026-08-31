import { useCallback, useEffect, useState } from "react"
import { listarStatusLabels, type StatusTone } from "@/services/salas.service"
import type { SalaStatus } from "@/lib/cronograma/salasTypes"

/** Rótulos usados só até o primeiro fetch terminar — "operacional" é o único status que não pode ser excluído. */
const DEFAULT_LABELS: Record<SalaStatus, { label: string; label_curto: string; tone: StatusTone }> = {
  operacional: { label: "Operacional", label_curto: "Operacional", tone: "green" },
}

/** Rótulos das categorias de status de sala (CRUD livre — ver gerenciamento em GerenciarCategoriasModal). */
export function useStatusLabels() {
  const [labels, setLabels] = useState(DEFAULT_LABELS)
  // Enquanto `loading` é true, `labels` só tem "operacional" (DEFAULT_LABELS)
  // — qualquer outro status (ex.: "bloqueada") ainda não tem tone real e cairia
  // no fallback cinza de quem consome este hook. Expor o loading permite a UI
  // mostrar um placeholder neutro em vez de um rótulo com a cor errada por um
  // instante (era isso que piscava "bloqueada" cinza antes de virar vermelho).
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(() => {
    listarStatusLabels()
      .then(rows => {
        const next: Record<SalaStatus, { label: string; label_curto: string; tone: StatusTone }> = {}
        rows.forEach(r => { next[r.codigo] = { label: r.label, label_curto: r.label_curto, tone: r.tone } })
        setLabels(next)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  return { labels, recarregar, loading }
}
