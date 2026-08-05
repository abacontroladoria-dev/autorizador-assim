import { useCallback, useEffect, useState } from "react"
import { listarStatusLabels, type StatusTone } from "@/services/salas.service"
import type { SalaStatus } from "@/lib/cronograma/salasTypes"

/** Rótulos padrão — usados até o fetch terminar, e como fallback se a tabela cronograma_status_labels ainda não tiver a linha do status. */
const DEFAULT_LABELS: Record<SalaStatus, { label: string; label_curto: string; tone: StatusTone }> = {
  operacional: { label: "Operacional", label_curto: "Operacional", tone: "green" },
  bloqueada: { label: "Bloqueada", label_curto: "Bloqueada", tone: "red" },
  adm: { label: "Administrativa (ADM)", label_curto: "Adm", tone: "purple" },
  nti: { label: "NTI", label_curto: "NTI", tone: "blue" },
}

/** Rótulos editáveis dos 3 status fixos de sala — ver gerenciamento em GerenciarCategoriasModal. */
export function useStatusLabels() {
  const [labels, setLabels] = useState(DEFAULT_LABELS)

  const recarregar = useCallback(() => {
    listarStatusLabels()
      .then(rows => {
        setLabels(prev => {
          const next = { ...prev }
          rows.forEach(r => { next[r.codigo] = { label: r.label, label_curto: r.label_curto, tone: r.tone } })
          return next
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  return { labels, recarregar }
}
