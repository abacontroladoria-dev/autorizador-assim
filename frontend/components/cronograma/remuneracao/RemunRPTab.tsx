"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { HelpCircle, Download } from "lucide-react"

import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { RemuneracaoUploadBadges } from "./RemuneracaoUploadBadges"
import { RemuneracaoRPDashboard } from "./RemuneracaoRPDashboard"
import { EstadoGradeVazia } from "./EstadoGradeVazia"
import { useParametrosGerais } from "@/hooks/useParametrosGerais"
import { useTaxasEspecialidade } from "@/hooks/useTaxasEspecialidade"
import { usePepApuracaoResumo } from "@/hooks/usePepApuracaoResumo"
import { calcularTotalPorEspecialidade } from "@/lib/remuneracao/dashboardRP"
import { exportarRemuneracaoRPXlsx } from "@/lib/remuneracao/exportRemuneracaoRP"
import { competenciaDeLinhas } from "@/lib/remuneracao/datas"
import { B } from "@/lib/cronograma/constants"
import CardRemun, { type ExpandidoState } from "./CardRemun"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

const normKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()


export function RemunRPTab() {
  const {
    resultado, evoRows, csvName, controlesGrade,
    peRows, peName,
    loading, error,
  } = useRemuneracaoRPContext()

  const { parametros } = useParametrosGerais()
  const { taxas_pa } = useTaxasEspecialidade()
  const competenciaPep = useMemo(() => competenciaDeLinhas(evoRows), [evoRows])
  const { resumo: pepResumo } = usePepApuracaoResumo(competenciaPep)

  const [expandido, setExpandido] = useState<ExpandidoState>({})
  const [remBusca, setRemBusca] = useState("")
  const [apenasInconsistencia, setApenasInconsistencia] = useState(false)
  const [especialidadeFiltro, setEspecialidadeFiltro] = useState<string | null>(null)
  const { setHeader, setRightContent } = useHeader()

  const profissionaisComInconsistencia = useMemo(
    () => resultado?.filter(p => p.inconsistencias > 0) ?? [],
    [resultado]
  )

  const profissionaisPorEspecialidade = useMemo(() => {
    if (!especialidadeFiltro) return null
    const { porEspecialidade } = calcularTotalPorEspecialidade(resultado ?? [], pepResumo)
    const alvo = porEspecialidade.find(e => e.especialidade === especialidadeFiltro)
    return new Set(alvo?.profissionais ?? [])
  }, [resultado, especialidadeFiltro, pepResumo])

  // Mesma lógica de match usada em CardRemun.filtrarSessoes — buscar aqui também
  // permite recolher da lista os profissionais sem nenhuma sessão correspondente,
  // em vez de a busca só filtrar dentro de cards já expandidos manualmente.
  const buscaQ = useMemo(() => normKey(remBusca), [remBusca])
  const profTemBusca = useCallback((p: ProfRemunReal) => {
    if (!buscaQ) return true
    return p.sessoes.some(s =>
      normKey(`${s.paciente} ${s.especialidade} ${s.data} ${s.hora} ${s.profAgenda} ${s.profCsv}`).includes(buscaQ)
    )
  }, [buscaQ])

  const resultadoExibido = useMemo(() => {
    let r = apenasInconsistencia ? profissionaisComInconsistencia : resultado
    if (profissionaisPorEspecialidade) r = r ? r.filter(p => profissionaisPorEspecialidade.has(p.prof)) : r
    if (buscaQ) r = r ? r.filter(profTemBusca) : r
    return r
  }, [apenasInconsistencia, profissionaisComInconsistencia, resultado, profissionaisPorEspecialidade, buscaQ, profTemBusca])

  useEffect(() => {
    setHeader("Rem. Mês - Total", "Relacionamento Prestador")
    setRightContent(<RemuneracaoUploadBadges c={controlesGrade} hidePe />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, controlesGrade])

  // Dados de configuração para o CardRemun — fallbacks seguros enquanto config carrega
  const ccPA     = parametros?.cc_pa_default ?? 50
  const ccPE     = parametros?.cc_pe_default ?? 100
  const etaBonus = parametros?.eta_bonus_default ?? 100
  const taxasPA  = taxas_pa

  return (
    <div className="space-y-4">
      {resultado && resultado.length > 0 && (
        <RemuneracaoRPDashboard
          resultado={resultado}
          especialidadeFiltro={especialidadeFiltro}
          onFiltroEspecialidade={setEspecialidadeFiltro}
          pepResumo={pepResumo}
        />
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
          <button
            type="button"
            onClick={() => resultado && exportarRemuneracaoRPXlsx({ resultado, evoRows, csvName })}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
            style={{ background: B.green }}
          >
            <Download size={13} />
            Exportar XLSX
          </button>
        </div>
      )}

      {resultado && resultado.length > 0 && (buscaQ || apenasInconsistencia || especialidadeFiltro) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold uppercase tracking-wide text-muted-foreground">Filtros ativos:</span>
          {buscaQ && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
              Busca: {remBusca}
              <button type="button" onClick={() => setRemBusca("")} className="opacity-70 hover:opacity-100">×</button>
            </span>
          )}
          {apenasInconsistencia && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
              Contém inconsistência
              <button type="button" onClick={() => setApenasInconsistencia(false)} className="opacity-70 hover:opacity-100">×</button>
            </span>
          )}
          {especialidadeFiltro && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
              Especialidade: {especialidadeFiltro}
              <button type="button" onClick={() => setEspecialidadeFiltro(null)} className="opacity-70 hover:opacity-100">×</button>
            </span>
          )}
          <button
            type="button"
            onClick={() => { setRemBusca(""); setApenasInconsistencia(false); setEspecialidadeFiltro(null) }}
            className="font-semibold text-foreground hover:opacity-70 transition-opacity"
          >
            limpar tudo
          </button>
        </div>
      )}

      {!resultado && !loading && (
        <EstadoGradeVazia
          carregando={controlesGrade.gradeLoading}
          periodo={controlesGrade.periodo}
          erroResumo={controlesGrade.gradeErroResumo}
        />
      )}

      {resultado && resultado.length > 0 && resultadoExibido && resultadoExibido.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {especialidadeFiltro
            ? `Nenhum profissional com remuneração em "${especialidadeFiltro}" nesta grade.`
            : buscaQ
              ? `Nenhuma sessão encontrada para "${remBusca}".`
              : "Nenhum profissional com inconsistência nesta grade."}
        </div>
      )}

      {resultadoExibido && resultadoExibido.length > 0 && (
        <div>
          {resultadoExibido.map(p => (
            <CardRemun
              key={p.prof}
              p={p}
              expandido={expandido}
              setExpandido={setExpandido}
              remBusca={remBusca}
              forceOpen={!!buscaQ}
              ccPA={ccPA}
              ccPE={ccPE}
              etaBonus={etaBonus}
              taxasPA={taxasPA}
              dadosPorProf={[]}
              pepResumo={pepResumo.get(p.prof) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
