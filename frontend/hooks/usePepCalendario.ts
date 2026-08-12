import { useCallback, useEffect, useState } from "react"
import { getCalendarioCompetencia, salvarCalendarioCompetencia, SEMANAS_PADRAO } from "@/services/pepCalendario.service"

// PRD Seção 9.11/13.8: calendário publicado pela clínica, por competência —
// só afeta a quantidade esperada de Supervisão/Estudo (itens semanais). Fora
// daqui, todo item usa a referência do catálogo direto (sem override).
export function usePepCalendario(competencia: string) {
  const [semanas, setSemanas] = useState(SEMANAS_PADRAO)
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    if (!competencia) return
    setLoading(true)
    const { data } = await getCalendarioCompetencia(competencia)
    setSemanas(data?.semanas_supervisao_estudo ?? SEMANAS_PADRAO)
    setLoading(false)
  }, [competencia])

  useEffect(() => { recarregar() }, [recarregar])

  const salvar = useCallback(async (novasSemanas: number) => {
    await salvarCalendarioCompetencia({ competencia, semanasSupervisaoEstudo: novasSemanas })
    setSemanas(novasSemanas)
  }, [competencia])

  return { semanas, loading, salvar }
}
