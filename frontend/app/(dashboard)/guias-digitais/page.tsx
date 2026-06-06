"use client"

import { useEffect, useState } from "react"
import JSZip from "jszip"
import PageHeader from "@/components/PageHeader"
import UploadArea from "@/components/guias-digitais/UploadArea"
import ProcessingStatus from "@/components/guias-digitais/ProcessingStatus"
import ResultadoLista from "@/components/guias-digitais/ResultadoLista"
import GuiaPreview from "@/components/guias-digitais/GuiaPreview"
import { useHeader } from "@/contexts/HeaderContext"
import { getFunctionHeaders, getFunctionUrl } from "@/lib/supabase/functions"
import type { ProcessedGuiaItem } from "@/lib/guias-digitais/types"

export default function GuiasDigitaisPage() {
  const { setHeader } = useHeader()
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(false)
  const [results, setResults] = useState<ProcessedGuiaItem[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  useEffect(() => {
    setHeader("Guias Digitais", "Processamento automático de guias médicas em PDF")
  }, [setHeader])

  function appendLog(message: string) {
    setLogs((current) => [...current, message])
  }

  function setStep(progressValue: number, message: string) {
    setProgress(progressValue)
    appendLog(message)
  }

  async function handleFileSelected(file: File) {
    setErrorMessage(null)
    setResults([])
    setPreview(null)
    setLogs([])
    setProgress(0)
    setFileName(file.name)
    setActive(true)

    try {
      setStep(8, "Upload recebido. Iniciando processamento...")

      const formData = new FormData()
      formData.append("file", file)

      setStep(18, "Enviando arquivo para API de processamento")
      const response = await fetch(getFunctionUrl("processar-guias"), {
        method: "POST",
        headers: await getFunctionHeaders({ contentType: null }),
        body: formData,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || "Falha ao processar o arquivo")
      }

      const json = await response.json()
      if (json?.error) {
        throw new Error(json.error)
      }

      const processed: ProcessedGuiaItem[] = json.results || []
      setStep(88, "Processamento concluído no servidor")
      setResults(processed)
      setPreview(processed?.[0]?.finalPdf ?? null)
      setStep(100, "Pronto. Revise e baixe os PDFs gerados.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado"
      setErrorMessage(message)
      appendLog(`Erro: ${message}`)
      setProgress(100)
    } finally {
      setActive(false)
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function downloadPdf(base64: string, fileNameBase: string) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: "application/pdf" })
    downloadBlob(blob, `${fileNameBase}.pdf`)
  }

  async function handleDownloadAll() {
    if (results.length === 0) return

    const zip = new JSZip()
    results.forEach((item) => {
      const binary = atob(item.finalPdf)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      zip.file(
        `guia-${item.pageIndex}-${item.guiaNumero ?? "sem-numero"}.pdf`,
        bytes,
        { binary: true }
      )
    })

    const blob = await zip.generateAsync({ type: "blob" })
    downloadBlob(blob, "guias-digitais.zip")
  }

  function handlePreview(item: ProcessedGuiaItem) {
    setPreview(item.finalPdf)
  }

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <PageHeader
        title="Guias Digitais"
        subtitle="Envie um PDF para separar páginas, extrair dados e gerar verso automaticamente."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <UploadArea
            onFileSelected={handleFileSelected}
            disabled={active}
            currentFileName={fileName ?? undefined}
          />

          <ProcessingStatus
            logs={logs}
            progress={progress}
            active={active}
          />

          {errorMessage && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ações</p>
                <p className="text-sm text-slate-500">
                  Baixe o lote consolidado ou exporte tudo em ZIP.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={results.length === 0}
                  className="rounded-full bg-[#3A8FB7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2f7790] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Baixar ZIP
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <ResultadoLista
            results={results}
            onPreview={handlePreview}
            onDownload={(item) => downloadPdf(item.finalPdf, `guia-${item.pageIndex}-${item.guiaNumero ?? "sem-numero"}`)}
          />

          <GuiaPreview base64Pdf={preview} />
        </div>
      </div>
    </div>
  )
}
