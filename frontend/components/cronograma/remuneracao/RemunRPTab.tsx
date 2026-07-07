"use client"

import { useEffect, useMemo, useState } from "react"
import { HelpCircle } from "lucide-react"

import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { RemuneracaoUploadBadges } from "./RemuneracaoUploadBadges"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { validarModeloRelatorio, parseHtmlTable, type CsvGradeRow } from "@/lib/remuneracao/relatorio"
import CardRemun, { type ExpandidoState } from "./CardRemun"


export function RemunRPTab() {
  const {
    resultado, evoRows, csvName, setCsvName, carregarGrade, limparGrade,
    peRows, peName, carregarPE, limparPE, peAnaliseCompleta, peStatusMensagem,
    loading, error,
  } = useRemuneracaoRPContext()

  const { config } = useRemuneracaoConfig()

  const [expandido, setExpandido] = useState<ExpandidoState>({})
  const [remBusca, setRemBusca] = useState("")
  const [apenasInconsistencia, setApenasInconsistencia] = useState(false)
  const { setHeader, setRightContent } = useHeader()

  const profissionaisComInconsistencia = useMemo(
    () => resultado?.filter(p => p.inconsistencias > 0) ?? [],
    [resultado]
  )
  const resultadoExibido = apenasInconsistencia ? profissionaisComInconsistencia : resultado

  useEffect(() => {
    setHeader("Rem. Mês - Total", "Relacionamento Prestador")
    setRightContent(<RemuneracaoUploadBadges
      evoRows={evoRows}
      peRows={peRows}
      carregarGrade={carregarGrade}
      carregarPE={carregarPE}
      limparGrade={limparGrade}
      limparPE={limparPE}
      setCsvName={setCsvName}
    />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName])

  // Dados de configuração para o CardRemun — fallbacks seguros enquanto config carrega
  const ccPA     = config?.cc_pa_default ?? 50
  const ccPE     = config?.cc_pe_default ?? 100
  const etaBonus = config?.eta_bonus_default ?? 100
  const taxasPA  = config?.taxas_pa ?? {}

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        A coluna <strong>Presença Recep.</strong> é cruzada com <code>fila_autorizacoes</code> (mesma fonte usada em Reposição de Faltas). Sessões sem nenhum registro correspondente na fila mantêm presença assumida como &quot;Sim&quot;.
      </div>



      {!peAnaliseCompleta && (evoRows.length > 0 || peRows.length > 0) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{peStatusMensagem}</p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando configuração…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {resultado && resultado.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Buscar paciente, especialidade, data…"
            value={remBusca}
            onChange={e => setRemBusca(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filtrar sessões"
          />
          <button
            type="button"
            onClick={() => setApenasInconsistencia(v => !v)}
            aria-pressed={apenasInconsistencia}
            title="Mostrar apenas profissionais com ao menos uma inconsistência"
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors ${
              apenasInconsistencia
                ? "bg-red-600 border-red-600 text-white"
                : "border-border text-foreground bg-background hover:bg-muted/50"
            }`}
          >
            <HelpCircle size={13} />
            Contém Inconsistência
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${apenasInconsistencia ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>
              {profissionaisComInconsistencia.length}
            </span>
          </button>
          {csvName && (
            <p className="text-xs text-muted-foreground shrink-0">
              {csvName}{peName ? ` · ${peName}` : ""}
            </p>
          )}
        </div>
      )}

      {!resultado && !loading && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Faça upload do relatório <code>csv_grade_profissionais</code> (mês completo) para calcular PA, PPD (diária) e ETA. Envie também <code>agendamentos_profissionais</code> para liberar o PE.
        </div>
      )}

      {resultado && resultado.length > 0 && resultadoExibido && resultadoExibido.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum profissional com inconsistência nesta grade.
        </div>
      )}

      {resultadoExibido && resultadoExibido.length > 0 && (
        <div>
          {resultadoExibido.map(p => (
            <CardRemun
              key={p.prof}
              p={p}
              modoRP={true}
              expandido={expandido}
              setExpandido={setExpandido}
              remBusca={remBusca}
              ccPA={ccPA}
              ccPE={ccPE}
              etaBonus={etaBonus}
              taxasPA={taxasPA}
              dadosPorProf={[]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
