"use client"

// Rem. Mês - Total: lista compacta de profissionais + modal-workspace por
// pessoa, no padrão de docs/padrao-detalhamento-modal.md.
//
// O que mudou em relação ao desenho anterior:
//  • a linha não expande mais para baixo (nem abria quatro accordions dentro de
//    si) — o detalhamento vive em ModalRemuneracaoRP;
//  • a busca desta página escolhe QUEM aparece e para por aí. Antes ela era
//    repassada ao card e ainda forçava todos a abrirem (§3.11);
//  • enquanto a grade carrega e não há nada na tela, aparece um esqueleto no
//    formato do layout real, não a mensagem de "não existe dado" (§3.9).

import { useCallback, useEffect, useMemo, useState } from "react"
import { HelpCircle, Download, Loader2 } from "lucide-react"

import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoRPContext } from "@/contexts/RemuneracaoRPContext"
import { RemuneracaoGradeBadge, labelMes } from "./RemuneracaoGradeBadge"
import { RemuneracaoRPDashboard } from "./RemuneracaoRPDashboard"
import { EstadoGradeVazia } from "./EstadoGradeVazia"
import { RemuneracaoRPSkeleton } from "./RemuneracaoRPSkeleton"
import { usePepApuracaoResumo } from "@/hooks/usePepApuracaoResumo"
import { calcularTotalPorEspecialidade } from "@/lib/remuneracao/dashboardRP"
import { exportarRemuneracaoRPXlsx } from "@/lib/remuneracao/exportRemuneracaoRP"
import { competenciaDeLinhas } from "@/lib/remuneracao/datas"
import { B } from "@/lib/cronograma/constants"
import CardRemunRP from "./CardRemunRP"
import { ModalRemuneracaoRP } from "./ModalRemuneracaoRP"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

const normKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

export function RemunRPTab() {
  const {
    resultado, evoRows, csvName, controlesGrade,
    peName,
    loading, error,
  } = useRemuneracaoRPContext()

  const competenciaPep = useMemo(() => competenciaDeLinhas(evoRows), [evoRows])
  const { resumo: pepResumo } = usePepApuracaoResumo(competenciaPep)

  // Uma pessoa aberta por vez, identificada pelo nome. O modal remonta por
  // `key`, então aba/página/detalhe nascem limpos a cada troca — nada de
  // useEffect com setState para resetar (§3.12).
  const [aberto, setAberto] = useState<string | null>(null)
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

  // A busca escolhe QUEM aparece na lista: um profissional entra se alguma
  // sessão dele casa com o termo. Dentro do modal ela não vale — lá a mesma
  // string esconderia o resto do período da pessoa, que é outra pergunta.
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

  const profAberto = useMemo(
    () => (aberto ? resultado?.find(p => p.prof === aberto) ?? null : null),
    [aberto, resultado]
  )

  useEffect(() => {
    setHeader("Rem. Mês - Total", "Relacionamento Prestador")
    setRightContent(<RemuneracaoGradeBadge c={controlesGrade} />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent, controlesGrade])

  const temDado = !!resultado && resultado.length > 0
  const carregando = loading || controlesGrade.gradeLoading
  // O mesmo rótulo do seletor no cabeçalho ("Agosto de 2026"): quem está
  // esperando lê no corpo exatamente o que escolheu lá em cima.
  const periodoTexto = labelMes(controlesGrade.periodoCarregado ?? controlesGrade.periodo)

  // Sem nada na tela e a grade a caminho → esqueleto no formato do layout real.
  // A mensagem de vazio (EstadoGradeVazia) só entra depois que a carga termina.
  if (!temDado && carregando) {
    return <RemuneracaoRPSkeleton periodo={periodoTexto} />
  }

  return (
    <div className="space-y-4">
      {temDado && (
        <RemuneracaoRPDashboard
          resultado={resultado}
          especialidadeFiltro={especialidadeFiltro}
          onFiltroEspecialidade={setEspecialidadeFiltro}
          pepResumo={pepResumo}
        />
      )}

      {/* Recarga com dado na tela: a lista fica onde está e o aviso é discreto.
          Esconder o que a pessoa está lendo é pior que fazê-la esperar. */}
      {temDado && carregando && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden />
          Atualizando com a grade de {periodoTexto}…
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {temDado && (
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Buscar paciente, especialidade, data…"
            value={remBusca}
            onChange={e => setRemBusca(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filtrar profissionais por sessão"
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

      {temDado && (buscaQ || apenasInconsistencia || especialidadeFiltro) && (
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

      {!temDado && !carregando && (
        <EstadoGradeVazia
          carregando={false}
          periodo={controlesGrade.periodo}
          erroResumo={controlesGrade.gradeErroResumo}
        />
      )}

      {temDado && resultadoExibido && resultadoExibido.length === 0 && (
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
            <CardRemunRP key={p.prof} p={p} onAbrir={setAberto} />
          ))}
        </div>
      )}

      {/* `key` remonta o modal a cada pessoa: aba, página, detalhe e busca local
          nascem limpos sem nenhum efeito de reset. */}
      <ModalRemuneracaoRP
        key={aberto ?? "fechado"}
        p={profAberto}
        periodo={controlesGrade.periodo}
        pepResumo={aberto ? pepResumo.get(aberto) ?? null : null}
        onClose={() => setAberto(null)}
      />
    </div>
  )
}
