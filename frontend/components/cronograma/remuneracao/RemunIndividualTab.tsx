"use client"

import { useEffect, useMemo, useState } from "react"
import { UserRound, FileText, FileSpreadsheet, XCircle, ChevronDown, Search } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { exportResumoSessoesPdf } from "@/lib/remuneracao/exportResumoSessoesPdf"
import { gerarPDF, gerarWord, montarInfoDocumentoPrestador, type PdfOpts } from "@/lib/remuneracao/documento"
import { B } from "@/lib/cronograma/constants"
import { RemuneracaoUploadBadges } from "./RemuneracaoUploadBadges"

// ─── Tipo de documento ────────────────────────────────────────────────────────

type TipoDoc = "auto" | "pf" | "pj"

const TIPOS_DOC: { k: TipoDoc; label: string; desc: string }[] = [
  { k: "auto", label: "Auto", desc: "PJ se houver CNPJ cadastrado, senão PF" },
  { k: "pf",   label: "Pessoa Física",    desc: "Emitir com CPF" },
  { k: "pj",   label: "Pessoa Jurídica",  desc: "Emitir com CNPJ / Razão Social" },
]

// ─── Componente principal ─────────────────────────────────────────────────────

export function RemunIndividualTab() {
  const { 
    resultado, evoRows, loading, error, 
    peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName 
  } = useRemuneracaoRPContext()
  const { config } = useRemuneracaoConfig()
  const { setHeader, setRightContent } = useHeader()

  const [profSelecionado, setProfSelecionado] = useState<string>("")
  const [tipoDoc, setTipoDoc]               = useState<TipoDoc>("auto")
  const [selectOpen, setSelectOpen]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState("")

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
    />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName])

  // Limpa a seleção quando o resultado muda (novo CSV carregado)
  useEffect(() => { setProfSelecionado("") }, [resultado])

  const ccPA     = config?.cc_pa_default ?? 50
  const ccPE     = config?.cc_pe_default ?? 100
  const etaBonus = config?.eta_bonus_default ?? 100
  const taxasPA  = config?.taxas_pa ?? {}

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

  const pdfOpts: PdfOpts = {
    remunIndPfPj:       tipoDoc,
    remPeriodo:         null, // expandir futuramente com config de período
    ccPA, ccPE, etaBonus, taxasPA,
    cadastroPrestadores: {},  // expandir futuramente com contratos do Supabase
  }

  // ── Estado: sem dados ──
  if (!resultado || resultado.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <p className="font-bold text-base text-foreground mb-1">
          Nenhum dado carregado
        </p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Faça o upload da Grade e do PE nos botões no topo da tela para visualizar os dados de remuneração individual.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Aviso de presença (igual ao RemunRPTab) */}
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        A coluna <strong>Presença Recep.</strong> é cruzada com <code>fila_autorizacoes</code> (mesma fonte usada em Reposição de Faltas). Sessões sem nenhum registro correspondente na fila mantêm presença assumida como &quot;Sim&quot;.
      </div>

      {loading && <p className="text-sm text-muted-foreground">Calculando…</p>}
      {error   && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* ── Painel de seleção ── */}
      {resultado && resultado.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">

          {/* Select estilizado */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Profissional
            </label>
            <div className="relative">
              <button
                type="button"
                id="select-profissional"
                aria-haspopup="listbox"
                aria-expanded={selectOpen}
                onClick={() => { setSelectOpen(o => !o); setSearchQuery("") }}
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
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/40 border-none focus:ring-1 focus:ring-ring rounded-lg outline-none transition-shadow"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto">
                    {profissionaisFiltrados.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">Nenhum profissional encontrado.</div>
                    ) : (
                      profissionaisFiltrados.map(prof => (
                        <button
                          key={prof}
                          type="button"
                          role="option"
                          aria-selected={prof === profSelecionado}
                          onClick={() => { setProfSelecionado(prof); setSelectOpen(false) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2
                            ${prof === profSelecionado ? "bg-muted font-semibold text-foreground" : "text-muted-foreground"}`}
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

          {/* Tipo de documento */}
          {profSelecionado && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Tipo de documento
              </p>
              <div className="flex flex-wrap gap-2">
                {TIPOS_DOC.map(({ k, label, desc }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTipoDoc(k)}
                    title={desc}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all
                      ${tipoDoc === k
                        ? "text-white shadow-sm"
                        : "border-border text-foreground bg-background hover:bg-muted/50"}`}
                    style={tipoDoc === k ? { background: B.navy, borderColor: B.navy } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tipoDoc === "auto" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Auto = PJ quando houver CNPJ/razão social cadastrado; senão PF.
                </p>
              )}
            </div>
          )}

          {/* Botões de exportação */}
          {dadosProfSelecionado && (
            <div className="border-t border-border pt-4 flex flex-wrap gap-3">
              <button
                type="button"
                id="btn-gerar-pdf"
                onClick={() => gerarPDF(dadosProfSelecionado, pdfOpts)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                style={{ background: B.navy }}
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
                  const info = montarInfoDocumentoPrestador(dadosProfSelecionado, tipoDoc, pdfOpts.cadastroPrestadores)
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


