import { useEffect, useState } from "react"
import { getApuracaoResumoTodosPrestadores } from "@/services/pepApuracao.service"

export type PepResumoPorPrestador = Map<string, { potencial: number; alcancado: number }>

// Leitura pura de pep_apuracao_mensal (sem recalcular nem gravar nada) — usado
// no indicador rápido do card de /relacionamento-prestador/rp/. A apuração de
// verdade só acontece na aba Entregas PEP.
export function usePepApuracaoResumo(competencia: string | null) {
  const [resumo, setResumo] = useState<PepResumoPorPrestador>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!competencia) { setResumo(new Map()); return }
    let cancelado = false
    setLoading(true)
    getApuracaoResumoTodosPrestadores(competencia).then(({ data }) => {
      if (!cancelado) setResumo(data)
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [competencia])

  return { resumo, loading }
}
