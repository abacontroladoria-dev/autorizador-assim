"use client"

// Painel de sugestões automáticas de contratação (Tarefas 1-5) — renderizado
// acima de "Parâmetros da simulação". Ao clicar numa sugestão, aplica
// especialidade/dias/turnos/unidade no formulário já existente, reaproveitando
// 100% da grade e do comparativo já renderizados abaixo.

import { startTransition, useState } from "react"
import { ArrowRight, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sparkles, Users } from "lucide-react"
import { useSugestoesContratacao } from "@/hooks/useSugestoesContratacao"
import { useTaxasEspecialidade } from "@/hooks/useTaxasEspecialidade"
import { useParametrosGerais } from "@/hooks/useParametrosGerais"
import {
  calcularBreakEvenPJ, projetarMargemBreakEvenPJ, calcularBreakEvenAtendimento, projetarMargemBreakEvenAtendimento,
  ESPECIALIDADES_BREAK_EVEN_PJ,
} from "@/lib/remuneracao/pontoEquilibrio"
import { diaCurto, fmtReal } from "@/lib/cronograma/helpers"
import { corTerapiaBadge, escurecerHex, hexParaRgba } from "@/lib/cronograma/constants"
import { Button } from "@/components/ui/button"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { InfoTooltip } from "@/components/cronograma/ui/InfoTooltip"
import { BadgeOcupacao, COR_OCUPACAO } from "@/components/cronograma/ui/BadgeOcupacao"
import { IndicadorDiaTurno } from "@/components/cronograma/ui/IndicadorDiaTurno"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import type { CandidatoNaSugestao, SugestaoContratacao } from "@/lib/cronograma/sugestaoContratacaoTypes"
import type { ModoCascataOcupacao, FaixaCascata } from "@/lib/cronograma/sugestaoContratacao"
import type { CsvRow } from "@/types/cronograma"
import { avaliarPeriodo, limitarCandidatosPorGap, type GapItem, type Turno } from "@/lib/cronograma/simulacaoNovoPrestador"

const SUGESTOES_POR_PAGINA = 5

interface Props {
  onAplicarSugestao: (especialidade: string, periodos: { dia: string; turno: Turno }[], unidade: string) => void
}

const FAIXAS_FILTRO: FaixaCascata[] = [70, 60, 50]

function CardSugestao({
  sugestao, cRows, gapMap, onAplicar,
}: { sugestao: SugestaoContratacao; cRows: CsvRow[]; gapMap: Record<string, GapItem>; onAplicar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [detalheRemanejamento, setDetalheRemanejamento] = useState<CandidatoNaSugestao | null>(null)
  const [confirmarSemSala, setConfirmarSemSala] = useState(false)

  const semSalaLivre = !sugestao.salaVinculada
  const qtdAdjacente = sugestao.candidatos.filter(c => c.modalidade === "adjacente").length
  const candidatosRemanejamento = sugestao.candidatos.filter(c => c.modalidade === "remanejamento")
  const qtdRemanejamento = candidatosRemanejamento.length
  // Vagas reais = horários distintos com pelo menos 1 candidato — vários pacientes
  // podem competir pela MESMA vaga, então "nº de candidatos" não é "nº de vagas".
  const vagas = new Set(sugestao.candidatos.map(c => `${c.turno}|||${c.hora}`)).size

  // sugestao.candidatos já passou pelo teto de gap GLOBAL entre TODAS as
  // sugestões (evita contar o mesmo paciente em mais de uma vaga sugerida ao
  // mesmo tempo — ver limitarCandidatosPorGapNaSugestao). Isso é correto pra
  // não inflar a soma de receita do painel inteiro, mas faz esta vaga
  // isolada parecer "menor" do que "Parâmetros da simulação" mostraria pra
  // essa mesma combinação (que avalia só ela, sem concorrência de outras
  // sugestões). Pra o Ponto de Equilíbrio bater com "Parâmetros da
  // simulação" quando o usuário for aplicar exatamente ESTA sugestão,
  // recalculamos aqui a vaga isolada (mesma fórmula de avaliarCombo, sem o
  // teto global).
  const periodosIsoladosBrutos = sugestao.turnos.map(turno =>
    avaliarPeriodo(sugestao.dia, turno, sugestao.unidade, sugestao.especialidade, cRows, gapMap),
  )
  const vagasIsoladas = limitarCandidatosPorGap(periodosIsoladosBrutos, gapMap, sugestao.especialidade)
    .reduce((soma, p) => soma + p.slots.length, 0)

  // Break Even sempre a 20% de perda neste card (o seletor de cenário fica só
  // em "Parâmetros da simulação" — aqui é uma prévia rápida, não uma análise
  // configurável) — mesmos modelos de lib/remuneracao/pontoEquilibrio.ts.
  const { taxas_pa: taxasPA, be_custo_mensal_pj: beCustoMensalPJ, be_capacidade_manha: beCapacidadeManha, be_capacidade_tarde: beCapacidadeTarde } = useTaxasEspecialidade()
  const { parametros: parametrosGerais } = useParametrosGerais()
  const PERDA_PADRAO_CARD = 20

  const margemBreakEven = (() => {
    if (!parametrosGerais || !sugestao.projecaoRemuneracao || vagas <= 0 || vagasIsoladas <= 0) return null
    // Preço médio por vaga fica na base pós-teto-global (a mesma já mostrada
    // no resto do card) — só o VOLUME usado no Ponto de Equilíbrio passa a
    // ser o isolado, igual "Parâmetros da simulação" faria pra essa combinação.
    const valorSessaoMedio = sugestao.projecaoRemuneracao.receitaSemanalProjetada / vagas
    if (valorSessaoMedio <= 0) return null
    const periodosManha = sugestao.turnos.includes("manha") ? 1 : 0
    const periodosTarde = sugestao.turnos.includes("tarde") ? 1 : 0

    if (ESPECIALIDADES_BREAK_EVEN_PJ.has(sugestao.especialidade)) {
      const custoMensal = beCustoMensalPJ[sugestao.especialidade]
      const capManha = beCapacidadeManha[sugestao.especialidade]
      const capTarde = beCapacidadeTarde[sugestao.especialidade]
      if (custoMensal == null || capManha == null || capTarde == null) return null
      const resultado = calcularBreakEvenPJ({
        valorSessaoBruto: valorSessaoMedio, impostoFaturamentoPct: parametrosGerais.imposto_faturamento_pct,
        custoMensalDiaCompleto: custoMensal, capacidadeManha: capManha, capacidadeTarde: capTarde,
        perdaPct: PERDA_PADRAO_CARD, periodosManha, periodosTarde,
      })
      const projecao = projetarMargemBreakEvenPJ(resultado, PERDA_PADRAO_CARD, vagasIsoladas)
      return { receitaLiquidaMes: projecao.receitaLiquidaMes, custoMes: resultado.custoMensalTotal, margemMensal: projecao.margemMensal }
    }

    const taxaPA = taxasPA[sugestao.especialidade]
    if (!taxaPA) return null
    const resultado = calcularBreakEvenAtendimento({
      valorSessaoBruto: valorSessaoMedio, impostoFaturamentoPct: parametrosGerais.imposto_faturamento_pct,
      taxaPA, capacidadeManha: parametrosGerais.pa_capacidade_manha_padrao, capacidadeTarde: parametrosGerais.pa_capacidade_tarde_padrao,
      periodosManha, periodosTarde,
    })
    const projecao = projetarMargemBreakEvenAtendimento(resultado, taxaPA, PERDA_PADRAO_CARD, vagasIsoladas)
    return { receitaLiquidaMes: projecao.receitaLiquidaMes, custoMes: projecao.custoVariavelMes, margemMensal: projecao.margemMensal }
  })()

  // Bruto mensal também escalado pro volume isolado (mesma razão mensal÷semanal
  // já calculada pela grade real do mês, só troca o volume de base) — senão
  // "impostos e perdas" ficaria comparando bases de volume diferentes.
  const impostosEPerdas = margemBreakEven && sugestao.projecaoRemuneracao && sugestao.projecaoRemuneracao.receitaSemanalProjetada > 0
    ? (sugestao.projecaoRemuneracao.receitaSemanalProjetada / vagas) * vagasIsoladas
      * (sugestao.projecaoRemuneracao.receitaMensalProjetada / sugestao.projecaoRemuneracao.receitaSemanalProjetada)
      - margemBreakEven.receitaLiquidaMes
    : 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 p-3.5">
        <BadgeOcupacao pct={sugestao.pctOcupacaoPrevista} faixa={sugestao.faixaCascata} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full border px-2 py-0.5 text-[12.5px] font-extrabold"
              style={{
                backgroundColor: hexParaRgba(corTerapiaBadge(sugestao.especialidade), 0.16),
                borderColor: hexParaRgba(corTerapiaBadge(sugestao.especialidade), 0.4),
                color: escurecerHex(corTerapiaBadge(sugestao.especialidade), 0.35),
              }}
            >
              {sugestao.especialidade}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-[12.5px] font-bold text-foreground">{sugestao.unidade}</span>
          </div>
          <IndicadorDiaTurno dia={sugestao.dia} turnos={sugestao.turnos} corBar={COR_OCUPACAO[sugestao.faixaCascata].bar} />

          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 font-semibold text-foreground">
              <Users size={12} className="text-muted-foreground" />
              {vagas} vaga(s) · {sugestao.candidatos.length} paciente(s) elegível(is)
            </span>
            {qtdRemanejamento > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
                {qtdAdjacente} adjacência · {qtdRemanejamento} remanejamento
              </span>
            )}
            <span className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
              semSalaLivre
                ? "animate-pulse border-red-300 bg-red-50 font-bold text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                : "border-border bg-muted/40 text-foreground"
            }`}>
              <Building2 size={12} className={semSalaLivre ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} />
              {sugestao.salaVinculada
                ? `${sugestao.salaVinculada.nomeExibicao} · ${sugestao.salaVinculada.unidade}`
                : "Sem sala livre encontrada"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {margemBreakEven ? (
            <div className="w-[196px] rounded-xl bg-muted/50 p-2.5">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Receita líquida/mês</span>
                <span className="text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{fmtReal(margemBreakEven.receitaLiquidaMes)}
                </span>

                <span className="text-muted-foreground">Impostos e perdas (20%)</span>
                <span className="text-right font-semibold tabular-nums text-rose-500/80 dark:text-rose-400/70">
                  −{fmtReal(impostosEPerdas)}
                </span>

                <span className="text-muted-foreground">Custo previsto</span>
                <span className="text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  −{fmtReal(margemBreakEven.custoMes)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Margem/mês</span>
                <span className={`text-[15px] font-black tabular-nums ${margemBreakEven.margemMensal >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {margemBreakEven.margemMensal >= 0 ? "+" : ""}{fmtReal(margemBreakEven.margemMensal)}
                </span>
              </div>
            </div>
          ) : (
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
            </div>
          )}
          {!!sugestao.projecaoRemuneracao?.sessoesSemValor && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">
              {sugestao.projecaoRemuneracao.sessoesSemValor} sessão(ões) sem valor cadastrado
            </div>
          )}
          <Button size="xs" onClick={() => (semSalaLivre ? setConfirmarSemSala(true) : onAplicar())} className="gap-1">
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

      {confirmarSemSala && (
        <ConfirmDialog
          title="Simular sem sala livre"
          description="Esta sugestão não tem sala livre encontrada no momento — você está simulando uma contratação hipotética sem sala garantida. Confirme a alocação de sala antes de contratar de fato."
          confirmLabel="Continuar"
          confirmColor="#dc2626"
          onCancel={() => setConfirmarSemSala(false)}
          onConfirm={() => { setConfirmarSemSala(false); onAplicar() }}
        />
      )}
    </div>
  )
}

export function SugestoesContratacaoPanel({ onAplicarSugestao }: Props) {
  const [modo, setModo] = useState<ModoCascataOcupacao>("diaInteiro")
  const [faixasSelecionadas, setFaixasSelecionadas] = useState<ReadonlySet<FaixaCascata>>(new Set(FAIXAS_FILTRO))
  const [pagina, setPagina] = useState(0)
  const { sugestoes, loading, error, laudosCarregados, refWeekLabel, cRows, gapMap } = useSugestoesContratacao(modo, faixasSelecionadas)

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
        {!loading && !error && (
          <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
            {sugestoes.length} sugestão(ões)
          </span>
        )}
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        O sistema identifica onde contratar rende mais ocupação prevista, já indicando sala livre e a receita mensal estimada — semana de referência: {refWeekLabel}.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground">Ocupação:</span>
          <div className="flex gap-1">
            {(
              [
                { value: "diaInteiro" as const, label: "Manhã + tarde juntos" },
                { value: "porTurno" as const, label: "Melhor turno isolado" },
              ]
            ).map(tab => {
              const ativa = modo === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => mudarModo(tab.value)}
                  aria-pressed={ativa}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    ativa
                      ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <InfoTooltip ariaLabel="O que significa cada critério de ocupação">
            <p><strong className="text-foreground">Manhã + tarde juntos</strong>: soma os dois turnos do mesmo dia antes de calcular a % — simula um profissional que aceita ambos, então a % cai se um turno for bem mais ocioso que o outro.</p>
            <p className="mt-2"><strong className="text-foreground">Melhor turno isolado</strong>: ranqueia pelo turno (ou dia inteiro) que sozinho rende mais % — pode aparecer alto mesmo que o profissional só aceite um dos turnos.</p>
          </InfoTooltip>
        </div>

        <div className="hidden h-5 w-px bg-border sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground">Faixa:</span>
          <div className="flex gap-1">
            {FAIXAS_FILTRO.map(faixa => {
              const ativa = faixasSelecionadas.has(faixa)
              return (
                <button
                  key={faixa}
                  type="button"
                  onClick={() => alternarFaixa(faixa)}
                  aria-pressed={ativa}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    ativa
                      ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  ≥ {faixa}%
                </button>
              )
            })}
          </div>
        </div>
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
          <div className="flex flex-col gap-2.5">
            {sugestoesDaPagina.map(s => (
              <CardSugestao
                key={s.id}
                sugestao={s}
                cRows={cRows}
                gapMap={gapMap}
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
