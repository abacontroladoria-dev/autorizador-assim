"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import { CronogramaDataProvider, useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { parseDisponibilidadeCSV } from "@/lib/cronograma/disponibilidade"
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
  const { cRows, lRows, dispRows, setCRows, setLRows, setDispRows } = useCronogramaData()
  const { setRightContent } = useHeader()
  const [uploading, setUploading] = useState(false)
  const [gradeLoading, setGradeLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dispUploading, setDispUploading] = useState(false)
  const [dispError, setDispError] = useState<string | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Páginas que gerenciam rightContent por conta própria (não precisam do badge de Laudos no header)
  const isOcupacaoPage =
    pathname === '/cronograma/ocupacao' || !!pathname?.startsWith('/cronograma/ocupacao/') ||
    pathname === '/cronograma/indicadores' || !!pathname?.startsWith('/cronograma/indicadores/')
  const isReposicaoPage = !!pathname?.includes('/reposicao')
  // Disponibilidade só é relevante na aba Novo Cronograma (solicitações ?tab=novo-cron).
  const isNovoCron = !!pathname?.includes('/solicitacoes') && searchParams.get('tab') === 'novo-cron'
  const gradeFetchedRef = useRef(false)
  const laudosFetchedRef = useRef(false)

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

  // Carrega os laudos automaticamente via API do TI (substitui o upload manual do Excel).
  // Se a API falhar, o badge cai no estado de erro e o botão de upload manual reaparece
  // como fallback (ver CronogramaUploadBadges).
  useEffect(() => {
    if (laudosFetchedRef.current || lRows.length > 0) return
    laudosFetchedRef.current = true
    const rw = getRefWeek()
    setUploading(true)
    setUploadError(null)
    fetch(`/api/laudos?inicio=${rw.inicio}&fim=${rw.fim}`)
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.ok) throw new Error("Não foi possível carregar os laudos automaticamente.")
        if (body.rows.length === 0) throw new Error("Nenhum laudo encontrado para o período.")
        setLRows(body.rows as LaudoRow[])
      })
      .catch(e => {
        laudosFetchedRef.current = false // permite nova tentativa (ex.: via upload manual)
        setUploadError(e instanceof Error ? e.message : "Erro ao carregar os laudos.")
      })
      .finally(() => setUploading(false))
  }, [lRows.length, setLRows])

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
    laudosFetchedRef.current = false
  }, [setCRows, setLRows])

  const handleDispFile = useCallback(async (file: File) => {
    setDispUploading(true)
    setDispError(null)
    try {
      const text = await file.text() // UTF-8 → acentos corretos do CSV do Órbita
      const rows = parseDisponibilidadeCSV(text)
      if (rows.length === 0) throw new Error("Nenhuma disponibilidade encontrada no arquivo.")
      setDispRows(rows)
    } catch (e) {
      setDispError(e instanceof Error ? e.message : "Erro ao processar a disponibilidade.")
    } finally {
      setDispUploading(false)
    }
  }, [setDispRows])

  const handleClearDisp = useCallback(() => {
    setDispRows([])
    setDispError(null)
  }, [setDispRows])

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
        showDisponibilidade={isNovoCron}
        dispRows={dispRows}
        dispLoading={dispUploading}
        dispError={dispError}
        onSelectDisp={handleDispFile}
        onClearDisp={handleClearDisp}
      />
    )
    return () => setRightContent(null)
  }, [cRows, lRows, dispRows, uploading, gradeLoading, uploadError, dispUploading, dispError, handleLaudosFile, handleClear, handleDispFile, handleClearDisp, setRightContent, isOcupacaoPage, isReposicaoPage, isNovoCron])

  return <div>{children}</div>
}

export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CronogramaDataProvider>
      <CronogramaLayoutInner>{children}</CronogramaLayoutInner>
    </CronogramaDataProvider>
  )
}
