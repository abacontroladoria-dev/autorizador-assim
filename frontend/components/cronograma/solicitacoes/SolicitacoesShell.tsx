"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState, type RefObject } from "react"
import * as XLSX from "xlsx"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { SaidaProfMode } from "./SaidaProfMode"
import { OcupProfMode } from "./OcupProfMode"
import { PreencherProfTab } from "@/components/cronograma/shared/PreencherProfTab"
import { OcupPacMode } from "./OcupPacMode"
import { NovoCronogramaTab } from "@/components/cronograma/shared/NovoCronogramaTab"
import { BancoDadosTab } from "./BancoDadosTab"
import type { CsvRow, LaudoRow, DispRow, StatusMap, CfgState } from "@/types/cronograma"

const TABS = [
  { key: "simulacao",  label: "Simulação de Novo Prestador" },
  { key: "saida",      label: "Saída de Profissional" },
  { key: "ocup-prof",  label: "Aumentar Ocupação (Profissional)" },
  { key: "ocup-pac",   label: "Ocupação · Paciente" },
  { key: "novo-cron",  label: "Novo Cronograma" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export interface ShellProps {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  dispRows: DispRow[]
  cfg: CfgState
}

export function SolicitacoesShell({ cRows, lRows, dispRows, cfg }: ShellProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const raw = searchParams.get("tab")
  const activeTab: TabKey = raw && TABS.some(t => t.key === raw) ? (raw as TabKey) : "saida"

  // StatusMap da Saída de Profissional — compartilhado entre a equipe via backend (saida_aceites)
  const { statusMap, persistStatus, setLRows, setCRows } = useCronogramaData()
  const { setHeader } = useHeader()

  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleLaudosFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const rw = getRefWeek()
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const lResult = XLSX.utils.sheet_to_json<LaudoRow>(ws, { defval: "" })
      if (!lResult.length) throw new Error("Nenhuma linha encontrada no arquivo.")
      setLRows(lResult)
      const gradeResult = await buscarGradeComoCSVRows(rw.inicio, rw.fim)
      if (!gradeResult.length) throw new Error("Nenhum registro encontrado para o período.")
      setCRows(gradeResult)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Erro ao processar arquivo.")
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab)
    const subtitles: Record<string, string> = {
      "saida":      "Análise de impacto e redistribuição de sessões",
      "ocup-prof":  "Aumente a ocupação de sessões por profissional",
      "ocup-pac":   "Aumente a ocupação de sessões por paciente",
      "simulacao":  "Simulação de novo prestador",
      "novo-cron":  "Criação de novo cronograma",
    }
    setHeader(tab?.label ?? "Cronograma", subtitles[activeTab] ?? "")
    return () => setHeader("", "")
  }, [activeTab, setHeader])

  useEffect(() => {
    if (!raw) router.replace("/cronograma/solicitacoes?tab=saida")
  }, [raw, router])

  return (
    <TabContent
      tab={activeTab}
      cRows={cRows} lRows={lRows} dispRows={dispRows} cfg={cfg}
      statusMap={statusMap} persistStatus={persistStatus}
      inputRef={inputRef} uploading={uploading} uploadError={uploadError}
      onLaudosFile={handleLaudosFile}
    />
  )
}

interface TabContentProps extends ShellProps {
  tab: TabKey
  statusMap: StatusMap
  persistStatus: (m: StatusMap) => void
  inputRef: RefObject<HTMLInputElement | null>
  uploading: boolean
  uploadError: string | null
  onLaudosFile: (file: File) => void
}

function TabContent({
  tab, cRows, lRows, dispRows, cfg, statusMap, persistStatus,
  inputRef, uploading, uploadError, onLaudosFile,
}: TabContentProps) {
  const { rec, inv, sRec, sInv } = useCronogramaData()
  const label = TABS.find(t => t.key === tab)?.label ?? tab

  if (tab === "saida") {
    return (
      <>
        {!lRows.length && (
          <div
            className="animate-in fade-in slide-in-from-top-2 duration-300"
            style={{
              padding: "16px 20px",
              borderRadius: "10px",
              border: "1.5px dashed #fbbf24",
              background: "#fffbeb",
              marginBottom: "12px",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) onLaudosFile(f)
                e.target.value = ""
              }}
            />
            <div className="flex items-center gap-3">
              <div className="shrink-0" style={{ color: "#d97706" }} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "12px", color: "#78350f", margin: 0, lineHeight: 1.5, marginBottom: "8px" }}>
                  Carregue o <strong style={{ fontWeight: 700 }}>relatório de Laudos/Autorizações</strong> (.xlsx) para habilitar a análise de impacto.
                </p>
                <button
                  onClick={() => !uploading && inputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: "1.5px solid #d97706",
                    background: uploading ? "#fef3c7" : "#ffffff",
                    color: "#92400e",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: uploading ? "not-allowed" : "pointer",
                    opacity: uploading ? 0.7 : 1,
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {uploading ? "Carregando..." : "Selecionar Laudos"}
                </button>
                {uploadError && (
                  <p style={{ fontSize: "11px", color: "#dc2626", margin: "6px 0 0", lineHeight: 1.4 }}>
                    {uploadError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <SaidaProfMode cRows={cRows} lRows={lRows} cfg={cfg} statusMap={statusMap} persistStatus={persistStatus} />
      </>
    )
  }

  if (tab === "simulacao") {
    return <PreencherProfTab cRows={cRows} lRows={lRows} initialMode="sim" fixedMode />
  }

  if (tab === "ocup-prof") {
    return <OcupProfMode cRows={cRows} lRows={lRows} cfg={cfg} />
  }

  if (tab === "ocup-pac") {
    return <OcupPacMode cRows={cRows} lRows={lRows} cfg={cfg} rec={rec} inv={inv} sRec={sRec} sInv={sInv} />
  }

  if (tab === "novo-cron") {
    return <NovoCronogramaTab cRows={cRows} lRows={lRows} dispRows={dispRows} />
  }

  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p>Em construção.</p>
      {cRows.length > 0 && (
        <p className="mt-3 text-xs text-green-600 dark:text-green-400">
          ✓ Grade carregada · {cRows.length} linhas
          {lRows.length > 0 && ` · ${lRows.length} laudos`}
          {dispRows.length > 0 && ` · ${dispRows.length} disponibilidades`}
        </p>
      )}
    </div>
  )
}
