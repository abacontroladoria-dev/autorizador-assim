"use client"

// Painel de sugestões automáticas de contratação (Tarefas 1-5) — renderizado
// acima de "Parâmetros da simulação". Ao clicar numa sugestão, aplica
// especialidade/dias/turnos/unidade no formulário já existente, reaproveitando
// 100% da grade e do comparativo já renderizados abaixo.

import { startTransition, useState } from "react"
import { ArrowRight, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sparkles, Users } from "lucide-react"
import { useSugestoesContratacao } from "@/hooks/useSugestoesContratacao"
import { diaCurto, fmtReal, turnoNome } from "@/lib/cronograma/helpers"
import { Button } from "@/components/ui/button"
import { SegmentedTabs } from "@/components/cronograma/ui/SegmentedTabs"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import type { CandidatoNaSugestao, SugestaoContratacao } from "@/lib/cronograma/sugestaoContratacaoTypes"
import type { ModoCascataOcupacao, FaixaCascata } from "@/lib/cronograma/sugestaoContratacao"
import type { CsvRow } from "@/types/cronograma"
import type { Turno } from "@/lib/cronograma/simulacaoNovoPrestador"

const SUGESTOES_POR_PAGINA = 20

interface Props {
  onAplicarSugestao: (especialidade: string, periodos: { dia: string; turno: Turno }[], unidade: string) => void
}

const FAIXA_LABEL: Record<70 | 60 | 50, string> = {
  70: "≥ 70% de ocupação prevista",
  60: "≥ 60% de ocupação prevista",
  50: "≥ 50% de ocupação prevista",
}

const FAIXAS_FILTRO: FaixaCascata[] = [70, 60, 50]

function CardSugestao({
  sugestao, cRows, onAplicar,
}: { sugestao: SugestaoContratacao; cRows: CsvRow[]; onAplicar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [detalheRemanejamento, setDetalheRemanejamento] = useState<CandidatoNaSugestao | null>(null)

  const qtdAdjacente = sugestao.candidatos.filter(c => c.modalidade === "adjacente").length
  const candidatosRemanejamento = sugestao.candidatos.filter(c => c.modalidade === "remanejamento")
  const qtdRemanejamento = candidatosRemanejamento.length
  // Vagas reais = horários distintos com pelo menos 1 candidato — vários pacientes
  // podem competir pela MESMA vaga, então "nº de candidatos" não é "nº de vagas".
  const vagas = new Set(sugestao.candidatos.map(c => `${c.turno}|||${c.hora}`)).size

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-extrabold text-foreground">{sugestao.especialidade}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-[12.5px] font-bold text-foreground">{sugestao.unidade}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {diaCurto(sugestao.dia)} · {sugestao.turnos.map(t => turnoNome[t]).join(" + ")} · {FAIXA_LABEL[sugestao.faixaCascata]}
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-foreground">
              <Users size={12} className="text-muted-foreground" />
              {vagas} vaga(s) de horário · {sugestao.candidatos.length} paciente(s) elegível(is)
              {qtdRemanejamento > 0 && ` (${qtdAdjacente} por adjacência, ${qtdRemanejamento} via remanejamento)`}
            </span>
            <span className="flex items-center gap-1 text-foreground">
              <Building2 size={12} className="text-muted-foreground" />
              {sugestao.salaVinculada
                ? `${sugestao.salaVinculada.nomeExibicao} · ${sugestao.salaVinculada.unidade}`
                : "Sem sala livre encontrada"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="text-right">
            <div className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {sugestao.projecaoRemuneracao ? fmtReal(sugestao.projecaoRemuneracao.receitaMensalProjetada) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">receita/mês projetada</div>
            {sugestao.projecaoRemuneracao && (
              <div className="mt-0.5 text-[11px] font-bold tabular-nums text-foreground">
                {fmtReal(sugestao.projecaoRemuneracao.receitaSemanalProjetada)} <span className="font-normal text-muted-foreground">/semana</span>
              </div>
            )}
            {!!sugestao.projecaoRemuneracao?.sessoesSemValor && (
              <div className="text-[10px] text-amber-600 dark:text-amber-400">
                {sugestao.projecaoRemuneracao.sessoesSemValor} sessão(ões) sem valor cadastrado
              </div>
            )}
          </div>
          <Button size="xs" onClick={onAplicar} className="gap-1">
            Aplicar <ArrowRight size={12} />
          </Button>
        </div>
      </div>

      {qtdRemanejamento > 0 && (
        <div className="border-t border-border bg-muted/40 px-3.5 py-2">
          <Button variant="outline" size="xs" onClick={() => setAberto(v => !v)} className="gap-1">
            {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Ver {qtdRemanejamento} remanejamento(s)
          </Button>
          {aberto && (
            <div className="mt-1.5 flex flex-col gap-1">
              {candidatosRemanejamento.map((c, i) => {
                const r = c.remanejamento!
                const mesmoDia = r.de.dia === r.para.dia
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  >
                    <span>
                      Mover <strong className="text-foreground">{r.terapiaRemanejada}</strong> de{" "}
                      <strong className="text-foreground">{r.pacienteRemanejado}</strong> (com {r.profissionalMantido}) de{" "}
                      {mesmoDia
                        ? `${r.de.hora} para ${r.para.hora}`
                        : `${diaCurto(r.de.dia)} ${r.de.hora} para ${diaCurto(r.para.dia)} ${r.para.hora}`}
                      , liberando o horário para <strong className="text-foreground">{c.paciente}</strong>.
                    </span>
                    <Button variant="outline" size="xs" onClick={() => setDetalheRemanejamento(c)} className="shrink-0">
                      Ver antes/depois
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {detalheRemanejamento?.remanejamento && (
        <RemanejamentoDetalheModal
          paciente={detalheRemanejamento.paciente}
          terapiaHipotetica={sugestao.especialidade}
          remanejamento={detalheRemanejamento.remanejamento}
          cRows={cRows}
          onClose={() => setDetalheRemanejamento(null)}
        />
      )}
    </div>
  )
}

export function SugestoesContratacaoPanel({ onAplicarSugestao }: Props) {
  const [modo, setModo] = useState<ModoCascataOcupacao>("diaInteiro")
  const [faixasSelecionadas, setFaixasSelecionadas] = useState<ReadonlySet<FaixaCascata>>(new Set(FAIXAS_FILTRO))
  const [pagina, setPagina] = useState(0)
  const { sugestoes, loading, error, laudosCarregados, refWeekLabel, cRows } = useSugestoesContratacao(modo, faixasSelecionadas)

  if (!laudosCarregados) return null

  // startTransition: mudar modo/faixa dispara calcularTodosCombos/pipeline de
  // enriquecimento (varre unidade × especialidade × dia), pesado e síncrono —
  // sem isso o clique trava até o recálculo terminar.
  const mudarModo = (novo: ModoCascataOcupacao) => startTransition(() => { setModo(novo); setPagina(0) })

  const alternarFaixa = (faixa: FaixaCascata) => startTransition(() => {
    setFaixasSelecionadas(prev => {
      const proxima = new Set(prev)
      if (proxima.has(faixa)) {
        if (proxima.size === 1) return prev // sempre precisa sobrar pelo menos 1 faixa marcada
        proxima.delete(faixa)
      } else {
        proxima.add(faixa)
      }
      return proxima
    })
    setPagina(0)
  })

  const totalPaginas = Math.max(1, Math.ceil(sugestoes.length / SUGESTOES_POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const sugestoesDaPagina = sugestoes.slice(paginaAtual * SUGESTOES_POR_PAGINA, paginaAtual * SUGESTOES_POR_PAGINA + SUGESTOES_POR_PAGINA)

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={15} className="text-violet-600 dark:text-violet-400" />
        <span className="text-[15px] font-extrabold text-foreground">Sugestões automáticas de contratação</span>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        O sistema identifica onde contratar rende mais ocupação prevista, já indicando sala livre e a receita mensal estimada — semana de referência: {refWeekLabel}.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">Ocupação considerada:</span>
        <SegmentedTabs
          value={modo}
          onChange={mudarModo}
          ariaLabel="Critério de ocupação prevista"
          size="lg"
          tabs={[
            { value: "diaInteiro", label: "Manhã + tarde juntos" },
            { value: "porTurno", label: "Melhor turno isolado" },
          ]}
        />
      </div>
      <div className="mb-3 text-[11px] text-muted-foreground">
        {modo === "porTurno"
          ? "Ranqueia pelo turno (ou dia inteiro) que sozinho render mais % — pode aparecer alto mesmo que o profissional só aceite um dos turnos."
          : "Sempre soma manhã + tarde do mesmo dia antes de calcular a % — simula um profissional que aceita os dois turnos, então a % cai se um dos turnos for bem mais ocioso que o outro."}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">Faixa de ocupação:</span>
        {FAIXAS_FILTRO.map(faixa => {
          const ativa = faixasSelecionadas.has(faixa)
          return (
            <button
              key={faixa}
              type="button"
              onClick={() => alternarFaixa(faixa)}
              aria-pressed={ativa}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                ativa
                  ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              ≥ {faixa}%
            </button>
          )
        })}
      </div>

      {loading && <InlineNotice tone="slate">Calculando sugestões…</InlineNotice>}

      {!loading && error && <InlineNotice tone="red">Falha ao calcular sugestões: {error}</InlineNotice>}

      {!loading && !error && !sugestoes.length && (
        <InlineNotice tone="slate">
          Nenhuma sugestão com ocupação prevista ≥ {Math.min(...faixasSelecionadas)}% no momento — tente marcar uma faixa mais baixa acima.
        </InlineNotice>
      )}

      {!loading && !error && !!sugestoes.length && (
        <>
          <div className="mb-2 text-[11px] text-muted-foreground">{sugestoes.length} sugestão(ões) no total</div>
          <div className="flex flex-col gap-2.5">
            {sugestoesDaPagina.map(s => (
              <CardSugestao
                key={s.id}
                sugestao={s}
                cRows={cRows}
                onAplicar={() => onAplicarSugestao(s.especialidade, s.turnos.map(turno => ({ dia: s.dia, turno })), s.unidade)}
              />
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline" size="icon-xs"
                disabled={paginaAtual === 0}
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft size={13} />
              </Button>
              {Array.from({ length: totalPaginas }, (_, i) => i).map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPagina(i)}
                  className={`h-7 min-w-7 rounded-full border px-2 text-[11px] font-bold transition-colors ${
                    i === paginaAtual
                      ? "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500"
                      : "border-border bg-card text-foreground hover:bg-muted/50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <Button
                variant="outline" size="icon-xs"
                disabled={paginaAtual === totalPaginas - 1}
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                aria-label="Próxima página"
              >
                <ChevronRight size={13} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
