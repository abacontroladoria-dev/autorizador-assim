"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import * as XLSX from "xlsx"
import { CronogramaDataProvider, useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { CronogramaUploadBadges } from "@/components/cronograma/CronogramaUploadBadges"
import type { LaudoRow } from "@/types/cronograma"

function parseXlsx<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json<T>(ws, { defval: "" }))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."))
    reader.readAsArrayBuffer(file)
  })
}

function CronogramaLayoutInner({ children }: { children: React.ReactNode }) {
  const { cRows, lRows, setCRows, setLRows } = useCronogramaData()
  const { setRightContent } = useHeader()
  const [uploading, setUploading] = useState(false)
  const [gradeLoading, setGradeLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const pathname = usePathname()
  // Páginas que gerenciam rightContent por conta própria (não precisam do badge de Laudos no header)
  const isOcupacaoPage = !!pathname?.includes('/ocupacao') || !!pathname?.includes('/indicadores')
  const gradeFetchedRef = useRef(false)

  // Carrega a grade (csv_grades_profissionais, sincronizada diariamente) automaticamente
  // ao entrar no módulo. A grade é a fonte canônica no banco — não depende do upload de
  // laudos, então o badge "Grade" (status-only) preenche sozinho nas abas Saída/Ocup.
  useEffect(() => {
    if (gradeFetchedRef.current || cRows.length > 0) return
    gradeFetchedRef.current = true
    const rw = getRefWeek()
    setGradeLoading(true)
    setUploadError(null)
    buscarGradeComoCSVRows(rw.inicio, rw.fim)
      .then(gradeResult => {
        if (gradeResult.length === 0) throw new Error("Nenhum registro encontrado para o período.")
        setCRows(gradeResult)
      })
      .catch(e => {
        gradeFetchedRef.current = false // permite nova tentativa (ex.: via upload de laudos)
        setUploadError(e instanceof Error ? e.message : "Erro ao carregar a grade.")
      })
      .finally(() => setGradeLoading(false))
  }, [cRows.length, setCRows])

  const handleLaudosFile = useCallback(async (file: File) => {
    const rw = getRefWeek()
    setUploading(true)
    setUploadError(null)
    try {
      const lResult = await parseXlsx<LaudoRow>(file)
      if (lResult.length === 0) throw new Error("Nenhuma linha encontrada no arquivo.")
      setLRows(lResult)
      // Garante a grade caso o carregamento automático tenha falhado ou ainda não ocorrido.
      if (cRows.length === 0) {
        const gradeResult = await buscarGradeComoCSVRows(rw.inicio, rw.fim)
        if (gradeResult.length === 0) throw new Error("Nenhum registro encontrado para o período.")
        setCRows(gradeResult)
        gradeFetchedRef.current = true
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Erro ao processar arquivo.")
    } finally {
      setUploading(false)
    }
  }, [cRows.length, setLRows, setCRows])

  const handleClear = useCallback(() => {
    setCRows([])
    setLRows([])
    setUploadError(null)
  }, [setCRows, setLRows])

  useEffect(() => {
    if (isOcupacaoPage) return // página gerencia o próprio rightContent — não interferir
    setRightContent(
      <CronogramaUploadBadges
        cRows={cRows}
        lRows={lRows}
        gradeLoading={gradeLoading}
        loading={uploading}
        error={uploadError}
        onSelectFile={handleLaudosFile}
        onClear={handleClear}
      />
    )
    return () => setRightContent(null)
  }, [cRows, lRows, uploading, gradeLoading, uploadError, handleLaudosFile, handleClear, setRightContent, isOcupacaoPage])

  return <div>{children}</div>
}

export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CronogramaDataProvider>
      <CronogramaLayoutInner>{children}</CronogramaLayoutInner>
    </CronogramaDataProvider>
  )
}
