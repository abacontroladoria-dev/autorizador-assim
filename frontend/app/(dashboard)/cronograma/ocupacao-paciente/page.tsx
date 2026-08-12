"use client"

import { useEffect, useRef, useState } from "react"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { OcupPacMode } from "@/components/cronograma/solicitacoes/OcupPacMode"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { getJanelaOcupacaoPaciente } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"

// Ocupação de Paciente precisa de uma janela de grade diferente do resto do
// módulo Cronograma (ver getJanelaOcupacaoPaciente) — por isso busca a sua
// própria cópia aqui em vez de usar o cRows compartilhado por
// CronogramaDataProvider (usado pelas outras abas via layout.tsx, com a janela
// getRefWeek() inalterada).
export default function OcupacaoPacientePage() {
  const { lRows, cfg, rec, inv, sRec, sInv } = useCronogramaData()
  const { setHeader } = useHeader()
  const [cRows, setCRows] = useState<CsvRow[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    setHeader("Ocupação · Paciente", "Aumente a ocupação de sessões por paciente")
  }, [setHeader])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    const janela = getJanelaOcupacaoPaciente()
    buscarGradeComoCSVRows(janela.inicio, janela.fim)
      .then(setCRows)
      .catch(e => {
        fetchedRef.current = false
        setErro(e instanceof Error ? e.message : "Erro ao carregar a grade.")
      })
  }, [])

  return (
    <>
      {erro && <p className="px-4 pt-2 text-sm text-destructive">{erro}</p>}
      <OcupPacMode cRows={cRows} lRows={lRows} cfg={cfg} rec={rec} inv={inv} sRec={sRec} sInv={sInv} />
    </>
  )
}
