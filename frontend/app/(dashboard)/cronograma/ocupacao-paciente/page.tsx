"use client"

import { useEffect } from "react"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { OcupPacMode } from "@/components/cronograma/solicitacoes/OcupPacMode"

export default function OcupacaoPacientePage() {
  const { cRows, lRows, cfg, rec, inv, sRec, sInv } = useCronogramaData()
  const { setHeader } = useHeader()

  useEffect(() => {
    setHeader("Ocupação · Paciente", "Aumente a ocupação de sessões por paciente")
  }, [setHeader])

  return (
    <OcupPacMode cRows={cRows} lRows={lRows} cfg={cfg} rec={rec} inv={inv} sRec={sRec} sInv={sInv} />
  )
}
