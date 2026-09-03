import { useCallback, useEffect, useState } from "react"
import { getCalendarioCompetencia, salvarCalendarioCompetencia, SEMANAS_PADRAO } from "@/services/pepCalendario.service"
import { getFeriados } from "@/services/feriados.service"
import { semanasEsperadas } from "@/lib/remuneracao/semanasCompetencia"

// PRD Seção 9.11/13.8: quantidade esperada de Supervisão/Estudo por
// competência. Por padrão é CALCULADA automaticamente a partir do calendário
// de feriados (semanasCompetencia.ts) — a clínica não precisa mais informar
// manualmente. `pep_calendario_competencias` continua existindo como
// override explícito (§13.8, tela de parametrização futura): quando há uma
// linha publicada pra competência, ela vale; senão, vale o cálculo.
export function usePepCalendario(competencia: string) {
  const [semanas, setSemanas] = useState(SEMANAS_PADRAO)
  // true = veio do cálculo automático; false = veio de um override manual publicado.
  const [calculadoAutomaticamente, setCalculadoAutomaticamente] = useState(true)
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    if (!competencia) return
    setLoading(true)
    const [{ data: override }, { data: feriados }] = await Promise.all([
      getCalendarioCompetencia(competencia),
      getFeriados(),
    ])
    if (override) {
      setSemanas(override.semanas_supervisao_estudo)
      setCalculadoAutomaticamente(false)
    } else {
      setSemanas(semanasEsperadas(competencia, feriados))
      setCalculadoAutomaticamente(true)
    }
    setLoading(false)
  }, [competencia])

  useEffect(() => { recarregar() }, [recarregar])

  // Mantido pro futuro (§13.8, tela de parametrização) — a tela de Entregas
  // PEP não chama mais isto, o valor agora vem do cálculo automático.
  const salvar = useCallback(async (novasSemanas: number) => {
    await salvarCalendarioCompetencia({ competencia, semanasSupervisaoEstudo: novasSemanas })
    setSemanas(novasSemanas)
    setCalculadoAutomaticamente(false)
  }, [competencia])

  return { semanas, calculadoAutomaticamente, loading, salvar }
}
