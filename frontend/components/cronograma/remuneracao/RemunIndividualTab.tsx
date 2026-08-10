"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { UserRound, FileText, FileSpreadsheet, XCircle, ChevronDown, Search } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { useParametrosGerais } from "@/hooks/useParametrosGerais"
import { useTaxasEspecialidade } from "@/hooks/useTaxasEspecialidade"
import { exportResumoSessoesPdf } from "@/lib/remuneracao/exportResumoSessoesPdf"
import { gerarPDF, gerarWord, montarInfoDocumentoPrestador, type PdfOpts } from "@/lib/remuneracao/documento"
import { parseDateBR, competenciaDeLinhas } from "@/lib/remuneracao/datas"
import { getApuracaoMes } from "@/services/pepApuracao.service"
import type { PepApuracaoMensal } from "@/types/pep"
import { RemuneracaoUploadBadges } from "./RemuneracaoUploadBadges"

// ─── Componente principal ─────────────────────────────────────────────────────

export function RemunIndividualTab() {
  const {
    resultado, evoRows, loading, error,
    peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName,
    cadastroPrestadores,
  } = useRemuneracaoRPContext()
  const { parametros } = useParametrosGerais()
  const { taxas_pa } = useTaxasEspecialidade()
  const { setHeader, setRightContent } = useHeader()

  const [profSelecionado, setProfSelecionado] = useState<string>("")
  const [selectOpen, setSelectOpen]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState("")
  const [highlightIdx, setHighlightIdx]     = useState(0)
  const selectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHeader("Rem. Mês - Individual", "Relacionamento Prestador")
    setRightContent(<RemuneracaoUploadBadges
      evoRows={evoRows}
      peRows={peRows}
      carregarGrade={carregarGrade}
      carregarPE={carregarPE}
      limparGrade={limparGrade}
      limparPE={limparPE}
      setCsvName={setCsvName}
      hidePe
    />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName])

  // Limpa a seleção quando o resultado muda (novo CSV carregado)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reage a uma prop assíncrona externa (novo CSV), não há valor derivável no primeiro render
    setProfSelecionado("")
  }, [resultado])

  // Fecha o dropdown ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!selectOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) setSelectOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectOpen(false) }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [selectOpen])

  const ccPA     = parametros?.cc_pa_default ?? 50
  const ccPE     = parametros?.cc_pe_default ?? 100
  const etaBonus = parametros?.eta_bonus_default ?? 100
  const taxasPA  = taxas_pa

  const profissionais = useMemo(
    () => Array.from(new Set(resultado?.map(r => r.prof) || [])).sort((a, b) => a.localeCompare(b)),
    [resultado]
  )

  const profissionaisFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return profissionais
    const q = searchQuery.toLowerCase().trim()
    return profissionais.filter(p => p.toLowerCase().includes(q))
  }, [profissionais, searchQuery])

  const dadosProfSelecionado = useMemo(
    () => (resultado ?? []).find(p => p.prof === profSelecionado) ?? null,
    [resultado, profSelecionado]
  )

  const remPeriodo = useMemo(() => {
    const datas = evoRows.map(r => parseDateBR(r.data)).filter((d): d is Date => d !== null)
    if (!datas.length) return null
    const min = datas.reduce((a, b) => (b < a ? b : a))
    const max = datas.reduce((a, b) => (b > a ? b : a))
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
    return { inicio: fmt(min), fim: fmt(max) }
  }, [evoRows])

  const competencia = useMemo(() => competenciaDeLinhas(evoRows), [evoRows])

  // PEP apurada (pep_apuracao_mensal) do prestador selecionado, na competência
  // da Grade carregada — leitura pura, a apuração de verdade acontece na aba
  // Entregas PEP.
  const [pepApuracao, setPepApuracao] = useState<PepApuracaoMensal[] | null>(null)
  useEffect(() => {
    if (!profSelecionado || !competencia) { setPepApuracao(null); return }
    let cancelado = false
    getApuracaoMes(profSelecionado, competencia).then(({ data }) => {
      if (!cancelado) setPepApuracao(data)
    })
    return () => { cancelado = true }
  }, [profSelecionado, competencia])

  const pdfOpts: PdfOpts = {
    remPeriodo,
    ccPA, ccPE, etaBonus, taxasPA,
    cadastroPrestadores,
    pepApuracao,
  }

  // ── Estado: sem dados ──
  if (!resultado || resultado.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <p className="font-bold text-base text-foreground mb-1">
          Nenhum dado carregado
        </p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Faça o upload da Grade no botão no topo da tela para visualizar os dados de remuneração individual.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {loading && <p className="text-sm text-muted-foreground">Calculando…</p>}
      {error   && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* ── Painel de seleção ── */}
      {resultado && resultado.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">

          {/* Select estilizado */}
          <div>
            <label htmlFor="select-profissional" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Profissional ({profissionais.length})
            </label>
            <div className="relative" ref={selectRef}>
              <button
                type="button"
                id="select-profissional"
                aria-haspopup="listbox"
                aria-expanded={selectOpen}
                onClick={() => { setSelectOpen(o => !o); setSearchQuery(""); setHighlightIdx(0) }}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <UserRound size={15} className="text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {profSelecionado || "— Selecione um profissional —"}
                  </span>
                </span>
                <ChevronDown size={15} className={`text-muted-foreground shrink-0 transition-transform ${selectOpen ? "rotate-180" : ""}`} />
              </button>

              {selectOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg flex flex-col max-h-72">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Buscar profissional..."
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setHighlightIdx(0) }}
                        onKeyDown={e => {
                          if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, profissionaisFiltrados.length - 1)) }
                          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
                          else if (e.key === "Enter") {
                            e.preventDefault()
                            const prof = profissionaisFiltrados[highlightIdx]
                            if (prof) { setProfSelecionado(prof); setSelectOpen(false) }
                          }
                        }}
                        role="combobox"
                        aria-expanded={selectOpen}
                        aria-controls="lista-profissionais"
                        aria-activedescendant={profissionaisFiltrados[highlightIdx] ? `prof-opt-${profissionaisFiltrados[highlightIdx]}` : undefined}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/40 border-none focus:ring-1 focus:ring-ring rounded-lg outline-none transition-shadow"
                      />
                    </div>
                  </div>
                  <div id="lista-profissionais" role="listbox" aria-label="Profissionais" className="overflow-y-auto">
                    {profissionaisFiltrados.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">Nenhum profissional encontrado.</div>
                    ) : (
                      profissionaisFiltrados.map((prof, i) => (
                        <button
                          key={prof}
                          id={`prof-opt-${prof}`}
                          type="button"
                          role="option"
                          aria-selected={prof === profSelecionado}
                          onClick={() => { setProfSelecionado(prof); setSelectOpen(false) }}
                          onMouseEnter={() => setHighlightIdx(i)}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2
                            ${prof === profSelecionado ? "bg-muted font-semibold text-foreground" : i === highlightIdx ? "bg-muted/60 text-foreground" : "text-muted-foreground"}`}
                        >
                          <UserRound size={13} className="shrink-0" />
                          <span className="truncate">{prof}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {profSelecionado && (
              <button
                type="button"
                onClick={() => setProfSelecionado("")}
                className="mt-1.5 text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors"
              >
                <XCircle size={12} /> Limpar seleção
              </button>
            )}
          </div>

          {/* Botões de exportação */}
          {dadosProfSelecionado && (
            <div className="border-t border-border pt-4 flex flex-wrap gap-3">
              <button
                type="button"
                id="btn-gerar-pdf"
                onClick={() => gerarPDF(dadosProfSelecionado, pdfOpts)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all bg-[#222847] dark:bg-slate-600"
              >
                <FileText size={15} />
                PDF - Apuração do Faturamento
              </button>
              <button
                type="button"
                id="btn-gerar-word"
                onClick={() => gerarWord(dadosProfSelecionado, pdfOpts)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-border text-foreground bg-background hover:bg-muted/50 active:scale-95 transition-all"
              >
                <FileSpreadsheet size={15} />
                WORD - Apuração do Faturamento
              </button>
              <button
                type="button"
                id="btn-resumo-sessoes"
                onClick={() => {
                  const info = montarInfoDocumentoPrestador(dadosProfSelecionado, pdfOpts.cadastroPrestadores)
                  exportResumoSessoesPdf(info, dadosProfSelecionado.sessoes || [])
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-border text-foreground bg-background hover:bg-muted/50 active:scale-95 transition-all"
              >
                <FileText size={15} />
                PDF - Apuração das Sessões
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Placeholder quando nenhum prof selecionado ── */}
      {resultado && resultado.length > 0 && !profSelecionado && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Selecione um profissional acima para visualizar os dados de remuneração individual.
        </div>
      )}

      {/* A visualização detalhada foi removida a pedido, 
          pois a aba servirá apenas para exportação */}
    </div>
  )
}


