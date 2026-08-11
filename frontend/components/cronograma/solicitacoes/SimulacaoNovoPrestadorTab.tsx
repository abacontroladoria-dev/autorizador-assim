"use client"

// Simulação de Novo Prestador — visualizador de hipótese: "se eu contratasse
// um novo profissional de tal especialidade, em tais dias/turnos, quantos
// pacientes com gap eu conseguiria encaixar, e em qual unidade?"
//
// Extraído de PreencherProfTab.tsx (que também tinha dois modos — "Profissional"
// e "Paciente" — inalcançáveis por qualquer rota do sistema). O motor de
// cálculo vive em lib/cronograma/simulacaoNovoPrestador.ts; este arquivo é só
// a UI. Não há mais fluxo de WhatsApp/oferta aqui — é puramente informativo.

import { useMemo, useRef, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
import { CheckCircle2, Clock, Info, Lock, Sparkles, Star, Wallet } from "lucide-react"
import {
  avaliarPeriodo, calcularGaps, construirAgendaNovoProfissional, gapsParaMapa, limitarCandidatosPorGap, listarEspecialidades, montarPlanoRecomendado, ranquearUnidades,
  type PeriodoSimulado, type PeriodoAlvo, type SlotSimulado, type Turno,
} from "@/lib/cronograma/simulacaoNovoPrestador"
import { DIAS_UTIL, ESP_CLINICO, EXCLUIR_OCUP } from "@/lib/cronograma/constants"
import { buildCronoUnitMeta, diaCurto, fmtH, fmtName, fmtReal, shouldShowSessionUnit, turnoNome, unidadeBadgeText } from "@/lib/cronograma/helpers"
import { useGradeAgendamentos } from "@/hooks/useGradeAgendamentos"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { useConvenioValores } from "@/hooks/useConvenioValores"
import { useFeriados } from "@/hooks/useFeriados"
import { anexarModalidadeERemanejamento, filtrarPorDisponibilidadeInterna, anexarSala, anexarRemuneracaoEOrdenar, primeiroConvenioDoPaciente } from "@/lib/cronograma/sugestaoContratacao"
import { SugestoesContratacaoPanel } from "./SugestoesContratacaoPanel"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import { ProjecaoFinanceiraDetalheModal } from "./ProjecaoFinanceiraDetalheModal"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { TONE_ACCENT } from "@/components/cronograma/ui/tones"
import { Button } from "@/components/ui/button"
import type { CsvRow, LaudoRow } from "@/types/cronograma"
import type { CandidatoNaSugestao, SugestaoContratacao } from "@/lib/cronograma/sugestaoContratacaoTypes"

interface Props {
  lRows: LaudoRow[]
}

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }

/** Horários que o paciente já tem agendados nesse dia — informativo, pra
 *  contextualizar a linha da tabela "Sessões e candidatos" independente da
 *  modalidade (adjacência ou remanejamento). */
function sessoesNoDiaDoPaciente(pac: string, dia: string, cRows: CsvRow[]): string[] {
  const vistos = new Set<string>()
  return cRows
    .filter(r => r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia && r["Status do Agendamento"] === "Agendado")
    .map(hiStr)
    .filter(h => {
      if (vistos.has(h)) return false
      vistos.add(h)
      return true
    })
    .sort()
}

// ─── InfoTip ────────────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [visivel, setVisivel] = useState(false)
  return (
    <span
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onClick={e => { e.stopPropagation(); setVisivel(v => !v) }}
      className="relative ml-1 inline-flex shrink-0 cursor-help align-middle"
    >
      <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">
        <Info size={10} strokeWidth={2.5} />
      </span>
      {visivel && (
        <span className="absolute left-[18px] top-[-8px] z-[800] w-64 rounded-xl bg-slate-900 dark:bg-slate-800 px-2.5 py-2 text-[11px] leading-snug text-white shadow-2xl">
          {text}
        </span>
      )}
    </span>
  )
}

// ─── Combobox de especialidade (padrão ARIA usado no autocomplete de paciente
//     do OcupPacMode — a melhor implementação desse padrão no módulo) ────────
function EspecialidadeCombobox({
  value, onChange, opcoes,
}: { value: string; onChange: (v: string) => void; opcoes: string[] }) {
  const [texto, setTexto] = useState(value)
  const [aberto, setAberto] = useState(false)
  const [ativoIdx, setAtivoIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Sincroniza o texto quando `value` muda por fora (ex.: "Aplicar" sugestão),
  // sem depender de efeito — padrão documentado do React pra "ajustar estado
  // quando uma prop muda". Não atrapalha a digitação: enquanto o usuário
  // digita, cada tecla já manda onChange("") pro pai, então `value` fica
  // parado em "" entre uma tecla e outra e essa comparação nunca dispara.
  const [ultimoValor, setUltimoValor] = useState(value)
  if (value !== ultimoValor) {
    setUltimoValor(value)
    setTexto(value)
  }

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter(o => o.toLowerCase().includes(q))
  }, [texto, opcoes])

  const selecionar = (esp: string) => { onChange(esp); setTexto(esp); setUltimoValor(esp); setAberto(false); setAtivoIdx(-1) }
  const valida = opcoes.includes(value)

  return (
    <div className="relative">
      <input
        id="sim-esp-input"
        type="text"
        aria-label="Buscar especialidade"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={aberto ? "sim-esp-listbox" : undefined}
        value={texto}
        onChange={e => { setTexto(e.target.value); setUltimoValor(""); onChange(""); setAberto(true); setAtivoIdx(-1) }}
        onFocus={() => setAberto(true)}
        onBlur={() => { setTimeout(() => setAberto(false), 150); if (value) setTexto(value) }}
        onKeyDown={e => {
          if (!aberto || !filtradas.length) return
          if (e.key === "ArrowDown") {
            e.preventDefault()
            const next = Math.min(ativoIdx + 1, filtradas.length - 1)
            setAtivoIdx(next); listRef.current?.children[next]?.scrollIntoView({ block: "nearest" })
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            const prev = Math.max(ativoIdx - 1, 0)
            setAtivoIdx(prev); listRef.current?.children[prev]?.scrollIntoView({ block: "nearest" })
          } else if (e.key === "Enter") {
            e.preventDefault()
            const idx = ativoIdx >= 0 ? ativoIdx : (filtradas.length === 1 ? 0 : -1)
            if (idx >= 0) selecionar(filtradas[idx])
          } else if (e.key === "Escape") {
            setAberto(false); setAtivoIdx(-1)
            if (value) setTexto(value)
          }
        }}
        placeholder="Digite para buscar uma especialidade…"
        className={`w-full rounded-lg border px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${valida ? "border-border bg-card" : "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"}`}
      />
      {aberto && filtradas.length > 0 && (
        <div
          ref={listRef}
          id="sim-esp-listbox"
          role="listbox"
          aria-label="Especialidades"
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-[100] max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtradas.map((esp, i) => {
            const selecionada = esp === value
            const ativa = i === ativoIdx
            return (
              <button
                key={esp}
                type="button"
                role="option"
                aria-selected={selecionada}
                onMouseDown={() => selecionar(esp)}
                className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors ${ativa ? "bg-sky-600 text-white" : selecionada ? "bg-muted font-semibold text-foreground" : "text-foreground hover:bg-muted/60"}`}
              >
                {esp}
              </button>
            )
          })}
        </div>
      )}
      {!valida && !aberto && texto && (
        <div className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">Selecione uma especialidade válida da lista.</div>
      )}
    </div>
  )
}

// ─── Cor por unidade (identidade visual consistente entre a grade do plano e o
//     comparativo de barras — sempre acompanhada do nome por extenso, nunca só
//     a cor, já que Realengo×Fazendinha não passam no teste de daltonismo).
//     Não migrado pra tones.ts/StatusPill de propósito: Tone é sobre SIGNIFICADO
//     (sucesso/alerta/erro), enquanto isto é identidade de ENTIDADE (a unidade
//     física) — são sistemas semanticamente diferentes. ─────────────────────
const UNIDADE_ESTILO: Record<string, { bg: string; text: string; bar: string }> = {
  Realengo: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-400", bar: "bg-sky-500" },
  Fazendinha: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-400", bar: "bg-violet-500" },
  "Padre Miguel": { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-400", bar: "bg-orange-500" },
}
function estiloUnidade(unidade: string) {
  return UNIDADE_ESTILO[unidade] || { bg: "bg-muted", text: "text-foreground", bar: "bg-slate-500" }
}

// ─── Grade semanal do plano recomendado (dia × turno) ────────────────────────
function PlanoGradeSemanal({ periodos }: { periodos: PeriodoSimulado[] }) {
  const dias = DIAS_UTIL.filter(d => periodos.some(p => p.dia === d))
  if (!dias.length) return null
  return (
    <div className="grid w-fit gap-1.5" style={{ gridTemplateColumns: `52px repeat(${dias.length}, 88px)` }}>
      <div />
      {dias.map(dia => (
        <div key={`h-${dia}`} className="text-center text-[11px] font-bold text-muted-foreground">{diaCurto(dia)}</div>
      ))}
      {(["manha", "tarde"] as Turno[]).flatMap(turno => [
        <div key={`t-${turno}`} className="flex items-center text-[11px] font-bold text-muted-foreground">{turnoNome[turno]}</div>,
        ...dias.map(dia => {
          const periodo = periodos.find(p => p.dia === dia && p.turno === turno)
          if (!periodo) return <div key={`${turno}-${dia}`} />
          const cor = estiloUnidade(periodo.unidade)
          return (
            <div key={`${turno}-${dia}`} className={`rounded-md px-1.5 py-2 text-center text-[11px] font-bold ${cor.bg} ${cor.text}`}>
              {periodo.unidade}
            </div>
          )
        }),
      ])}
    </div>
  )
}

// ─── Modal de detalhe: agenda atual do paciente + sessão hipotética ─────────
interface DetalheModalData { pac: string; slot: SlotSimulado; especialidade: string }

function DetalheModal({ data, cRows, onClose }: { data: DetalheModalData; cRows: CsvRow[]; onClose: () => void }) {
  const { pac, slot, especialidade } = data
  const terapiaProposta = (ESP_CLINICO[especialidade] || [especialidade]).filter(t => !EXCLUIR_OCUP.has(t))[0] || especialidade

  const sessoesPaciente = useMemo(() => {
    const vistos = new Set<string>()
    const res: { dia: string; hora: string; terapia: string; prof: string; unidade: string }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac || r["Status do Agendamento"] !== "Agendado") continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${r.Terapia}|||${r.Profissional}`
      if (vistos.has(k)) continue
      vistos.add(k)
      res.push({ dia: r["Dia da Semana"], hora: hiStr(r), terapia: r.Terapia, prof: r.Profissional, unidade: String(r.Unidade || "Desconhecida") })
    }
    return res
  }, [pac, cRows])

  type CelulaInfo = { terapia: string; prof: string; proposta: boolean; unidade: string }
  const mapaCelulas: Record<string, CelulaInfo[]> = {}
  for (const s of sessoesPaciente) {
    const k = `${s.dia}|||${s.hora}`
    ;(mapaCelulas[k] ??= []).push({ terapia: s.terapia, prof: s.prof, proposta: false, unidade: s.unidade })
  }
  const kProposta = `${slot.dia}|||${slot.hora}`
  ;(mapaCelulas[kProposta] ??= []).push({ terapia: terapiaProposta, prof: "Novo profissional", proposta: true, unidade: slot.unidade })

  const diasComSessao = [...new Set([slot.dia, ...sessoesPaciente.map(s => s.dia)])]
    .sort((a, b) => DIAS_UTIL.indexOf(a as typeof DIAS_UTIL[number]) - DIAS_UTIL.indexOf(b as typeof DIAS_UTIL[number]))
  const horasGrid = [...new Set(Object.keys(mapaCelulas).map(k => k.split("|||")[1]))].sort()
  const unitMeta = buildCronoUnitMeta(
    diasComSessao,
    Object.fromEntries(Object.entries(mapaCelulas).map(([k, cs]) => [k, cs.map(c => ({ tP: c.terapia, unidade: c.unidade }))])),
  )

  return (
    <ScheduleModal
      title={pac}
      maxWidth={860}
      onClose={onClose}
      subtitle={
        <div className="flex flex-wrap gap-1.5">
          <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
          <StatusPill tone="green" variant="solid" dense>
            Hipótese: {terapiaProposta} · {diaCurto(slot.dia)} {turnoNome[slot.turno]} {slot.hora} · {slot.unidade}
          </StatusPill>
        </div>
      }
      footer={<Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Sessão hipotética</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-muted" /> Sessão existente</span>
      </div>
      {!horasGrid.length ? (
        <div className="py-8 text-center text-muted-foreground">Nenhuma sessão encontrada.</div>
      ) : (
        <table className="w-full min-w-[380px] border-collapse">
          <thead><tr>
            <th className="w-[52px] pb-2 pr-2.5 text-right text-xs font-normal text-muted-foreground">Hora</th>
            {diasComSessao.map(d => (
              <th key={d} className={`min-w-[130px] pb-2 text-center text-[13px] font-extrabold ${d === slot.dia ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>
                <div>{diaCurto(d)} {d === slot.dia && <span className="ml-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 px-1 py-px text-[10px] text-emerald-700 dark:text-emerald-400">hipótese</span>}</div>
                <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {horasGrid.map(hora => (
              <tr key={hora} className="border-t border-border">
                <td className={`pr-2.5 pt-2 text-right align-top font-mono text-[13px] font-extrabold tabular-nums ${hora === slot.hora ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>{hora}</td>
                {diasComSessao.map(d => {
                  const celulas = mapaCelulas[`${d}|||${hora}`] || []
                  return (
                    <td key={d} className="p-0.5 align-top">
                      {celulas.map((c, ci) => (
                        <div key={ci} className={`mb-0.5 flex min-h-[58px] flex-col gap-0.5 rounded-lg border px-2 py-1.5 ${c.proposta ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-muted"}`}>
                          <div className="text-xs font-bold leading-tight text-foreground">{c.terapia}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtName(c.prof)}</div>
                          {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                            <div className="w-fit rounded-full bg-sky-50 dark:bg-sky-950/30 px-1.5 py-px text-[10px] font-extrabold text-sky-700 dark:text-sky-400">
                              {unidadeBadgeText(c.unidade)}
                            </div>
                          )}
                          {c.proposta && <div className="mt-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Sessão hipotética</div>}
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ScheduleModal>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export function SimulacaoNovoPrestadorTab({ lRows }: Props) {
  const { cRows, loading: gradeLoading, error: gradeError, refWeek } = useGradeAgendamentos()
  const { salasComOcupacao } = useOcupacaoSalas(refWeek.inicio, refWeek.fim)
  const { regrasGerais, excecoesPaciente } = useConvenioValores()
  const { feriados } = useFeriados()
  const [especialidade, setEspecialidade] = useState("")
  const [periodosSel, setPeriodosSel] = useState<Record<string, { manha?: boolean; tarde?: boolean }>>({})
  const [unidadeFixada, setUnidadeFixada] = useState("")
  const [detalhe, setDetalhe] = useState<DetalheModalData | null>(null)
  const [detalheRemanejamento, setDetalheRemanejamento] = useState<{ sugestao: SugestaoContratacao; candidato: CandidatoNaSugestao } | null>(null)
  const [detalheFinanceiroAberto, setDetalheFinanceiroAberto] = useState(false)
  const [destaqueAplicado, setDestaqueAplicado] = useState(false)
  const parametrosRef = useRef<HTMLDivElement>(null)

  const espOptions = useMemo(() => listarEspecialidades(), [])
  const especialidadeValida = espOptions.includes(especialidade)
  const laudosCarregados = lRows.length > 0

  const gaps = useMemo(() => calcularGaps(lRows, cRows), [lRows, cRows])
  const gapMap = useMemo(() => gapsParaMapa(gaps), [gaps])

  const periodosAlvo = useMemo((): PeriodoAlvo[] =>
    DIAS_UTIL.flatMap(dia =>
      (["manha", "tarde"] as Turno[]).filter(turno => periodosSel[dia]?.[turno]).map(turno => ({ dia, turno })),
    ), [periodosSel])

  const podeSimular = laudosCarregados && especialidadeValida && cRows.length > 0 && periodosAlvo.length > 0

  const unitRank = useMemo(() =>
    podeSimular ? ranquearUnidades(periodosAlvo, especialidade, cRows, gapMap) : [],
    [podeSimular, periodosAlvo, especialidade, cRows, gapMap],
  )

  const planoRecomendado = useMemo(() =>
    podeSimular ? montarPlanoRecomendado(periodosAlvo, especialidade, cRows, gapMap) : [],
    [podeSimular, periodosAlvo, especialidade, cRows, gapMap],
  )

  // totalVagas conta horários distintos (slots), não candidatos — um mesmo
  // horário pode ter vários pacientes concorrendo (ver "Sessões e candidatos"),
  // então somar candidatos.length inflaria a contagem de vagas reais.
  const planoStats = useMemo(() => {
    const pacientes = new Set<string>()
    let totalVagas = 0
    for (const p of planoRecomendado) {
      totalVagas += p.slots.length
      p.slots.forEach(s => s.candidatos.forEach(c => pacientes.add(c.pac)))
    }
    return { nPacientes: pacientes.size, totalVagas }
  }, [planoRecomendado])

  const vagasDaUnidade = (u: { periodos: PeriodoSimulado[] }) => u.periodos.reduce((soma, p) => soma + p.slots.length, 0)

  const periodosExibidos = useMemo((): PeriodoSimulado[] => {
    if (!podeSimular) return []
    const bruto = unidadeFixada
      ? periodosAlvo.map(p => avaliarPeriodo(p.dia, p.turno, unidadeFixada, especialidade, cRows, gapMap))
      : planoRecomendado
    // planoRecomendado já sai limitado por limitarCandidatosPorGap (dentro de
    // montarPlanoRecomendado) — chamar de novo aqui é inofensivo (idempotente)
    // e cobre o caminho de unidade fixada, que não passa por lá.
    return limitarCandidatosPorGap(bruto, gapMap, especialidade)
  }, [podeSimular, unidadeFixada, periodosAlvo, especialidade, cRows, gapMap, planoRecomendado])

  const slotsExibidos = useMemo((): SlotSimulado[] => periodosExibidos.flatMap(p => p.slots), [periodosExibidos])

  const agendaNovoProf = useMemo(() =>
    podeSimular ? construirAgendaNovoProfissional(periodosExibidos) : null,
    [podeSimular, periodosExibidos],
  )

  const escalaComparativo = Math.max(1, planoStats.totalVagas, ...unitRank.map(vagasDaUnidade))

  const mesReferencia = useMemo(() => {
    const [ano, mes] = refWeek.inicio.split("-").map(Number)
    return ano && mes ? { ano, mes } : null
  }, [refWeek.inicio])

  const labelMesReferencia = useMemo(() => {
    if (!mesReferencia) return ""
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(mesReferencia.ano, mesReferencia.mes - 1, 1))
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [mesReferencia])

  // Enriquece cada período exibido (modalidade adjacente/remanejamento,
  // disponibilidade interna, sala livre vinculada e valor de cada sessão pelo
  // cadastro de valores) — mesmo pipeline e mesma ordem usados pelo painel de
  // sugestões automáticas (useSugestoesContratacao.ts), só que aplicado aos
  // períodos escolhidos manualmente aqui (um "período" vira uma
  // SugestaoContratacao de 1 turno só só pra reaproveitar os mesmos estágios).
  // Sem o estágio de disponibilidade interna, a projeção financeira contava
  // pacientes que já dá pra atender com quem existe — inflando a receita em
  // relação ao que a sugestão automática mostra pro mesmo dia/turno/unidade.
  const periodosEnriquecidos = useMemo((): SugestaoContratacao[] => {
    if (!podeSimular) return []
    const base: SugestaoContratacao[] = periodosExibidos.map((p, i) => ({
      id: `periodo-${i}`,
      unidade: p.unidade,
      especialidade,
      dia: p.dia,
      turnos: [p.turno],
      pctOcupacaoPrevista: 0,
      faixaCascata: 50,
      candidatos: p.slots.flatMap(s => s.candidatos.map(c => ({
        paciente: c.pac, gap: c.gap, aut: c.aut, of: c.of, turno: p.turno, hora: s.hora,
        modalidade: "adjacente" as const, valorSessaoProjetado: null, ordemNaVaga: 1,
      }))),
      modalidadeDominante: "adjacente",
      salaVinculada: null,
      projecaoRemuneracao: null,
    }))
    const comRemanejamento = anexarModalidadeERemanejamento(base, cRows, gapMap)
    const comDisponibilidade = filtrarPorDisponibilidadeInterna(comRemanejamento, cRows)
    const comSala = anexarSala(comDisponibilidade, salasComOcupacao)
    return anexarRemuneracaoEOrdenar(comSala, cRows, regrasGerais, excecoesPaciente, mesReferencia, feriados)
  }, [podeSimular, periodosExibidos, especialidade, cRows, gapMap, salasComOcupacao, regrasGerais, excecoesPaciente, mesReferencia, feriados])

  // Soma só a melhor oferta de cada vaga (já resolvido por anexarRemuneracaoEOrdenar
  // por período) — reflete o que se ganharia priorizando sempre o paciente mais
  // rentável em cada disputa, nunca somando os dois lados de uma mesma vaga.
  const resumoFinanceiro = useMemo(() => {
    let semanal = 0, mensal = 0
    for (const s of periodosEnriquecidos) {
      semanal += s.projecaoRemuneracao?.receitaSemanalProjetada ?? 0
      mensal += s.projecaoRemuneracao?.receitaMensalProjetada ?? 0
    }
    return { semanal, mensal }
  }, [periodosEnriquecidos])

  interface LinhaCandidato {
    dia: string; unidade: string; sugestao: SugestaoContratacao; candidato: CandidatoNaSugestao
    /** Quantos pacientes concorrem por essa mesma vaga (turno+hora) — > 1 significa que só um deles poderá ser atendido. */
    concorrentesNaVaga: number
    /** true quando o valor de sessão empata entre os concorrentes da vaga — a prioridade nesse caso vem da frequência semanal na clínica, não do valor. */
    priorizadoPorFrequencia: boolean
  }

  const linhasExibidas = useMemo((): Omit<LinhaCandidato, "concorrentesNaVaga" | "priorizadoPorFrequencia">[] =>
    periodosEnriquecidos.flatMap(s => s.candidatos.map(candidato => ({ dia: s.dia, unidade: s.unidade, sugestao: s, candidato }))),
  [periodosEnriquecidos])

  // Vagas reais = horários distintos (dia+turno+hora) — várias candidaturas podem disputar a mesma vaga.
  const vagasExibidas = useMemo(
    () => new Set(linhasExibidas.map(l => `${l.dia}|||${l.candidato.turno}|||${l.candidato.hora}`)).size,
    [linhasExibidas],
  )

  const gruposPorDia = useMemo(() => {
    const porDia = new Map<string, Omit<LinhaCandidato, "concorrentesNaVaga" | "priorizadoPorFrequencia">[]>()
    for (const l of linhasExibidas) {
      if (!porDia.has(l.dia)) porDia.set(l.dia, [])
      porDia.get(l.dia)!.push(l)
    }
    return DIAS_UTIL
      .filter(d => porDia.has(d))
      .map(dia => {
        const linhasDoDia = porDia.get(dia)!
        const porVaga = new Map<string, typeof linhasDoDia>()
        for (const l of linhasDoDia) {
          const chave = `${l.candidato.turno}|||${l.candidato.hora}`
          if (!porVaga.has(chave)) porVaga.set(chave, [])
          porVaga.get(chave)!.push(l)
        }
        const empatePorVaga = new Map<string, boolean>()
        for (const [chave, itens] of porVaga.entries()) {
          const valores = itens.map(l => l.candidato.valorSessaoProjetado ?? -Infinity)
          empatePorVaga.set(chave, valores.filter(v => v === Math.max(...valores)).length > 1)
        }
        const linhas: LinhaCandidato[] = linhasDoDia
          .map(l => {
            const chave = `${l.candidato.turno}|||${l.candidato.hora}`
            return {
              ...l,
              concorrentesNaVaga: porVaga.get(chave)?.length ?? 1,
              priorizadoPorFrequencia: empatePorVaga.get(chave) ?? false,
            }
          })
          .sort((a, b) =>
            a.candidato.turno.localeCompare(b.candidato.turno) ||
            a.candidato.hora.localeCompare(b.candidato.hora) ||
            a.candidato.ordemNaVaga - b.candidato.ordemNaVaga,
          )
        return { dia, linhas }
      })
  }, [linhasExibidas])

  const alternar = (dia: string, turno: Turno) => {
    setUnidadeFixada("")
    setPeriodosSel(prev => ({ ...prev, [dia]: { ...prev[dia], [turno]: !prev[dia]?.[turno] } }))
  }
  const alternarDiaInteiro = (dia: string) => {
    setUnidadeFixada("")
    setPeriodosSel(prev => {
      const atual = prev[dia] || {}
      const todosMarcados = !!atual.manha && !!atual.tarde
      return { ...prev, [dia]: { manha: !todosMarcados, tarde: !todosMarcados } }
    })
  }
  const selecionarTudo = () => { setUnidadeFixada(""); setPeriodosSel(Object.fromEntries(DIAS_UTIL.map(d => [d, { manha: true, tarde: true }]))) }
  const limparTudo = () => { setUnidadeFixada(""); setPeriodosSel({}) }

  const aplicarSugestao = (esp: string, periodos: { dia: string; turno: Turno }[], unidade: string) => {
    setEspecialidade(esp)
    setPeriodosSel(Object.fromEntries(
      DIAS_UTIL.map(dia => [dia, {
        manha: periodos.some(p => p.dia === dia && p.turno === "manha"),
        tarde: periodos.some(p => p.dia === dia && p.turno === "tarde"),
      }]),
    ))
    setUnidadeFixada(unidade)

    // Sem isso o usuário não percebe que a sugestão foi aplicada: os campos
    // preenchidos ficam abaixo da dobra, dentro de "Parâmetros da simulação".
    parametrosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setDestaqueAplicado(true)
    setTimeout(() => setDestaqueAplicado(false), 2200)
  }

  return (
    <div className="flex flex-col gap-3">
      <SugestoesContratacaoPanel onAplicarSugestao={aplicarSugestao} />

      {/* Parâmetros */}
      <div
        ref={parametrosRef}
        className={`rounded-2xl border p-4 transition-colors duration-700 ${
          destaqueAplicado
            ? "border-emerald-400 bg-emerald-50/60 ring-4 ring-emerald-200 dark:border-emerald-600 dark:bg-emerald-950/20 dark:ring-emerald-900/40"
            : "border-border bg-card"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold text-foreground">Parâmetros da simulação</span>
          {destaqueAplicado && (
            <span className="animate-in fade-in slide-in-from-left-1 duration-300 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white dark:bg-emerald-500">
              <Sparkles size={11} /> Sugestão aplicada
            </span>
          )}
        </div>
        <div className="mb-2.5 text-xs text-muted-foreground">
          Simule um novo profissional por especialidade, dia e turno para ver quantos pacientes com sessões pendentes ele conseguiria atender.
          <InfoTip text="A simulação considera pacientes com autorizado > ofertado que já frequentam a unidade naquele dia, sem conflito no horário e respeitando o sequenciamento clínico (mínimo 1 sessão no dia, sempre em blocos consecutivos de 40min)." />
        </div>

        {!laudosCarregados ? (
          <InlineNotice tone="amber" icon={<Lock size={15} />}>
            <strong>Relatório de laudos não anexado.</strong> Sem ele não é possível calcular quem tem sessões pendentes (autorizado × ofertado), então a simulação fica bloqueada. Anexe o relatório de laudos para liberar a especialidade e os dias/turnos.
          </InlineNotice>
        ) : (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex w-full sm:w-64 flex-col gap-1">
            <span className="text-[11px] font-bold text-muted-foreground">Especialidade</span>
            <EspecialidadeCombobox value={especialidade} onChange={setEspecialidade} opcoes={espOptions} />
          </div>

          <div className="w-full sm:w-fit rounded-xl border border-border bg-muted p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="whitespace-nowrap text-sm font-extrabold text-foreground">
                Dias e turnos afetados <InfoTip text="Marque manhã, tarde ou dia inteiro. A recomendação avalia cada período separadamente e pode indicar unidades diferentes por turno." />
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button variant="outline" size="xs" onClick={selecionarTudo}>Selecionar tudo</Button>
                <Button variant="outline" size="xs" onClick={limparTudo}>Limpar</Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {DIAS_UTIL.map(dia => {
                const diaInteiro = !!periodosSel[dia]?.manha && !!periodosSel[dia]?.tarde
                return (
                  <div key={dia} className="flex items-center gap-1.5">
                    <span className="w-[64px] shrink-0 text-xs font-extrabold text-foreground">{diaCurto(dia)}</span>
                    {(["manha", "tarde"] as Turno[]).map(turno => (
                      <button
                        key={turno}
                        type="button"
                        onClick={() => alternar(dia, turno)}
                        className={`h-8 w-16 sm:w-20 shrink-0 rounded-lg border text-xs font-bold transition-colors ${periodosSel[dia]?.[turno] ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {turnoNome[turno]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => alternarDiaInteiro(dia)}
                      className={`h-8 shrink-0 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${diaInteiro ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                    >
                      Dia inteiro
                    </button>
                  </div>
                )
              })}
            </div>
            {!periodosAlvo.length && (
              <div className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">Selecione pelo menos um dia/turno.</div>
            )}
          </div>

          {podeSimular && (
            <div className="w-full xl:w-fit">
              <div className="mb-2 flex items-center gap-1 text-sm font-extrabold text-foreground">
                Projeção financeira
                <InfoTip text="Soma, por vaga de horário, só a receita do paciente mais rentável entre os que disputam aquele horário — priorizando sempre quem paga mais. Projeção mensal usa a mesma lógica de dias úteis × feriados da Previsão de Receitas." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard tone="green" icon={<Wallet size={14} />} label="Por semana">
                  <div className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">{fmtReal(resumoFinanceiro.semanal)}</div>
                </StatCard>
                <StatCard tone="green" icon={<Wallet size={14} />} label={`Projetado/mês (${labelMesReferencia})`}>
                  <div className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">{fmtReal(resumoFinanceiro.mensal)}</div>
                </StatCard>
              </div>
              <Button variant="outline" size="xs" className="mt-2" onClick={() => setDetalheFinanceiroAberto(true)}>
                Ver detalhe
              </Button>
            </div>
          )}
        </div>
        )}
      </div>

      {gradeLoading && (
        <InlineNotice tone="slate">
          Carregando grade da semana de referência ({refWeek.label})…
        </InlineNotice>
      )}

      {!gradeLoading && gradeError && (
        <InlineNotice tone="red">
          Falha ao carregar a grade da semana de referência: {gradeError}
        </InlineNotice>
      )}

      {!gradeLoading && !gradeError && !cRows.length && (
        <InlineNotice tone="amber">
          Nenhuma sessão encontrada na semana de referência ({refWeek.label}). Verifique se a grade foi sincronizada, e anexe o relatório de laudos para usar esta ferramenta.
        </InlineNotice>
      )}

      {cRows.length > 0 && especialidade && !especialidadeValida && (
        <InlineNotice tone="red">
          Escolha uma especialidade válida da lista para simular.
        </InlineNotice>
      )}

      {/* Comparativo de unidades */}
      {podeSimular && (
        <>
          {/* SEÇÃO 1 — decisão: onde encaixar esse profissional */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2.5">
              <div className="text-sm font-extrabold text-foreground">Onde encaixar esse profissional</div>
              <div className="text-[11px] text-muted-foreground">{periodosAlvo.length} período(s) simulado(s) em {unitRank.length} unidade(s) candidatas</div>
            </div>

            <div className="flex flex-col lg:flex-row items-start gap-6 p-4">
              <button
                type="button"
                onClick={() => setUnidadeFixada("")}
                className={`w-full lg:w-[500px] shrink-0 rounded-xl border-2 p-3 text-left transition-colors ${!unidadeFixada ? "border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30" : "border-border bg-card hover:bg-muted/40"}`}
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Star size={13} className="text-sky-600 dark:text-sky-400" />
                  <span className="text-sm font-extrabold text-foreground">Plano recomendado (misto)</span>
                  <InfoTip text="Escolhe a melhor unidade para cada dia/turno separadamente. Se Padre Miguel for escolhida em um turno, o sistema não mistura com outra unidade no outro turno do mesmo dia (restrição geográfica)." />
                </div>
                <div className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <strong className="text-foreground">{planoStats.nPacientes} paciente(s)</strong> disputando {planoStats.totalVagas} vaga(s) de horário
                  <InfoTip text="Estimativa do plano antes de resolver remanejamento, disponibilidade interna e sala — o número final de vagas confirmadas aparece em 'Detalhamento' logo abaixo." />
                </div>
                <div className="overflow-x-auto">
                  <PlanoGradeSemanal periodos={planoRecomendado} />
                </div>
              </button>

              <div className="w-full flex-1 min-w-0 lg:border-l lg:border-border lg:pl-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-foreground">
                    Ou fixe numa unidade única
                    <InfoTip text="Cada barra mostra quantas vagas de horário você teria se contratasse o novo profissional só para essa unidade, nos mesmos dias/turnos escolhidos. A marca vertical indica o total do plano recomendado (misto)." />
                  </div>
                  {unidadeFixada && (
                    <Button variant="outline" size="xs" onClick={() => setUnidadeFixada("")}>Ver plano</Button>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {unitRank.map(u => {
                    const cor = estiloUnidade(u.unidade)
                    const vagasUnidade = vagasDaUnidade(u)
                    const largura = (vagasUnidade / escalaComparativo) * 100
                    const referencia = (planoStats.totalVagas / escalaComparativo) * 100
                    const delta = vagasUnidade - planoStats.totalVagas
                    const ativo = unidadeFixada === u.unidade
                    return (
                      <button
                        key={u.unidade}
                        type="button"
                        onClick={() => setUnidadeFixada(ativo ? "" : u.unidade)}
                        className={`flex items-center gap-3 sm:gap-4 rounded-xl border p-3 text-left transition-colors ${ativo ? "border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30" : "border-transparent hover:bg-muted/50"}`}
                      >
                        <span className={`w-20 sm:w-[110px] shrink-0 truncate text-[12.5px] sm:text-sm font-bold ${cor.text}`}>{u.unidade}</span>
                        <span className="relative h-8 min-w-[72px] flex-1 rounded-lg bg-muted">
                          <span className={`absolute inset-y-0 left-0 rounded-lg transition-[width] ${cor.bar}`} style={{ width: `${largura}%` }} />
                          <span className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-foreground/60" style={{ left: `${referencia}%` }} />
                        </span>
                        <span className="w-[92px] sm:w-[120px] shrink-0 text-right">
                          <span className="block text-[12.5px] sm:text-sm font-black tabular-nums text-foreground">{vagasUnidade} vaga(s)/semana</span>
                          <span className={`block text-[10px] font-bold ${delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                            {delta === 0 ? "igual ao plano" : `${delta} vs. plano`}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2 — detalhamento da opção selecionada acima */}
          {agendaNovoProf && agendaNovoProf.totalSlots > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
                <span className="text-sm font-extrabold text-foreground">Detalhamento — {unidadeFixada || "Plano recomendado (misto)"}</span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  {planoStats.nPacientes} pacientes · {slotsExibidos.length} vaga(s) de horário · {Math.round((agendaNovoProf.slotsComCandidato / agendaNovoProf.totalSlots) * 100)}% de ocupação
                  <InfoTip text="Vagas de horário são os horários distintos do novo profissional com pelo menos um candidato — diferente do total de candidaturas na tabela 'Sessões e candidatos' abaixo, já que mais de um paciente pode disputar a mesma vaga." />
                </span>
                <span className="w-full text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  Projeção priorizando os mais rentáveis: {fmtReal(resumoFinanceiro.semanal)}/semana · {fmtReal(resumoFinanceiro.mensal)}/mês ({labelMesReferencia})
                </span>
              </div>

              <div className="flex flex-col gap-4 p-4">
                <div className="grid grid-cols-1 xl:grid-cols-[auto_260px_1fr] gap-4 items-start">
                {/* Agenda do novo profissional */}
                <div className="w-full xl:w-fit shrink-0 rounded-xl bg-muted/40 p-3">
                  <div className="text-sm font-extrabold text-foreground">Agenda do novo profissional</div>
                  <div className="mb-3 text-[11px] text-muted-foreground">Colorido: paciente(s) candidato(s) · Cinza: horário livre/ocioso</div>
                  <div className="mb-1 text-[10px] font-bold text-muted-foreground sm:hidden">deslize para o lado →</div>
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-[11px]" style={{ width: `${56 + agendaNovoProf.dias.length * 108}px` }}>
                      <thead>
                        <tr>
                          <th className="w-14" />
                          {agendaNovoProf.dias.map(dia => (
                            <th key={dia} className="min-w-[108px] px-1 pb-2 text-center text-[12px] font-extrabold text-foreground">{diaCurto(dia)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {agendaNovoProf.horasGrid.map(hora => (
                          <tr key={hora} className="border-t border-border">
                            <td className="py-1 pr-2 text-right font-mono text-[10px] font-semibold text-muted-foreground">{hora}</td>
                            {agendaNovoProf.dias.map(dia => {
                              const celula = agendaNovoProf.grade[`${dia}|||${hora}`]
                              if (!celula) return <td key={dia} className="p-0.5" />
                              const cor = estiloUnidade(celula.unidade)
                              return (
                                <td key={dia} className="p-0.5">
                                  {celula.candidatos.length ? (
                                    <div className={`flex min-h-[32px] flex-col items-center justify-center rounded-md px-1 py-1 text-center ${cor.bg}`}>
                                      <div className={`text-[10px] font-bold leading-tight ${cor.text}`}>
                                        {celula.candidatos.length === 1 ? fmtName(celula.candidatos[0].pac) : `${celula.candidatos.length} candidatos`}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="min-h-[32px] rounded-md bg-muted" />
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                  {/* Carga semanal */}
                  <div className="w-full xl:w-[260px] shrink-0 rounded-xl bg-muted/40 p-4">
                    <div className="text-sm font-extrabold text-foreground">Carga semanal</div>
                    <div className="mb-3 text-[11px] text-muted-foreground">Novo profissional hipotético</div>
                    <div className="relative mx-auto aspect-square w-[150px] sm:w-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Com candidato", value: agendaNovoProf.slotsComCandidato, color: TONE_ACCENT.green },
                            { name: "Livre/ociosa", value: agendaNovoProf.slotsLivres, color: TONE_ACCENT.red },
                          ].filter(s => s.value > 0)}
                          cx="50%" cy="50%" innerRadius="62%" outerRadius="88%"
                          dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}
                        >
                          {[
                            { color: TONE_ACCENT.green }, { color: TONE_ACCENT.red },
                          ].filter((_, i) => [agendaNovoProf.slotsComCandidato, agendaNovoProf.slotsLivres][i] > 0)
                            .map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                        <RechartsTooltip formatter={(val, name) => [`${val ?? 0} slot(s)`, name]} contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-foreground">
                      {Math.round((agendaNovoProf.slotsComCandidato / agendaNovoProf.totalSlots) * 100)}%
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
                      <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">{fmtH(agendaNovoProf.chOcupMin / 60)}</div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400">com candidato</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
                      <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400">{fmtH(agendaNovoProf.chLivreMin / 60)}</div>
                      <div className="text-[11px] text-rose-700 dark:text-rose-400">livre/ociosa</div>
                    </div>
                  </div>
                  <div className="mt-3 text-center text-[12px] text-muted-foreground">
                    CH total: <strong className="text-foreground">{fmtH(agendaNovoProf.chTotalMin / 60)}</strong>
                  </div>
                </div>

                  {/* Ocupação por dia */}
                  <div className="min-w-0 xl:min-w-[320px] flex-1 rounded-xl bg-muted/40 p-4">
                    <div className="text-sm font-extrabold text-foreground">Ocupação por dia</div>
                    <div className="mb-3 text-[11px] text-muted-foreground">Novo profissional hipotético</div>
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="min-w-[80px] pb-2 pr-3 text-left text-[11px] font-bold text-muted-foreground">Dia</th>
                        <th className="min-w-[140px] pb-2 pr-3 text-left text-[11px] font-bold text-muted-foreground">Unidade</th>
                        <th className="min-w-[80px] pb-2 pr-3 text-center text-[11px] font-bold whitespace-nowrap text-muted-foreground">Sessões</th>
                        <th className="min-w-[90px] pb-2 text-right text-[11px] font-bold whitespace-nowrap text-muted-foreground">% ocup.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agendaNovoProf.porDia.map(row => (
                        <tr key={row.dia} className="border-b border-border last:border-b-0">
                          <td className="py-2 pr-3 font-bold text-foreground">{diaCurto(row.dia)}</td>
                          <td className="py-2 pr-3 text-foreground">{row.unidades}</td>
                          <td className="py-2 pr-3 text-center tabular-nums text-foreground">{row.sessoes}/{row.totalSlots}</td>
                          <td className="py-2 text-right">
                            <StatusPill tone={row.pct >= 70 ? "green" : row.pct >= 30 ? "amber" : "red"} variant="solid" dense>
                              {row.pct.toFixed(0)}%
                            </StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-foreground">Sessões e candidatos</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{linhasExibidas.length} candidatura(s) elegível(is) em {vagasExibidas} vaga(s) de horário</span>
                  </div>
                  {!linhasExibidas.length ? (
                    <InlineNotice tone="slate" className="text-center justify-center">Nenhuma sessão com candidatos nesta combinação.</InlineNotice>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <div className="text-[10px] font-bold text-muted-foreground sm:hidden">deslize para o lado →</div>
                      {gruposPorDia.map(grupo => (
                  <div key={grupo.dia}>
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      {grupo.dia}
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground" title="Pode oferecer agora / aguarda recusa do(s) anterior(es)">Prioridade</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Horário</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Unidade</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sala</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Modalidade</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Convênio</th>
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Paciente</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Autorizado</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ofertado</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Janela</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vagas a Oferecer</th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Valor da sessão</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.linhas.map((linha, i) => {
                            const { candidato: c, sugestao, unidade } = linha
                            const cor = estiloUnidade(unidade)
                            const adjacente = c.modalidade === "adjacente"
                            const sessoesNoDia = sessoesNoDiaDoPaciente(c.paciente, linha.dia, cRows)
                            const disputada = linha.concorrentesNaVaga > 1
                            return (
                              <tr
                                key={`${linha.dia}-${c.turno}-${c.hora}-${c.paciente}-${i}`}
                                className={`border-b border-border last:border-b-0 ${disputada && c.ordemNaVaga > 1 ? "bg-muted/40 dark:bg-muted/20" : ""}`}
                              >
                                <td className="px-3 py-2">
                                  {c.ordemNaVaga === 1 ? (
                                    <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" aria-label="Pode oferecer agora" />
                                  ) : (
                                    <Clock size={15} className="text-muted-foreground" aria-label="Aguarda recusa do(s) anterior(es)" />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400">{turnoNome[c.turno]}</div>
                                  <div className="font-mono text-sm font-bold tabular-nums text-foreground">{c.hora}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cor.bg} ${cor.text}`}>{unidade}</span>
                                </td>
                                <td className="px-3 py-2 text-foreground">
                                  {sugestao.salaVinculada ? sugestao.salaVinculada.numeroSala : "Sem sala livre"}
                                </td>
                                <td className="px-3 py-2">
                                  <StatusPill tone={adjacente ? "green" : "blue"} variant="soft" dense>
                                    {adjacente ? "Adjacência" : "Remanejamento"}
                                  </StatusPill>
                                </td>
                                <td className="px-3 py-2 text-foreground">
                                  {primeiroConvenioDoPaciente(c.paciente, cRows)}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-bold text-foreground">{c.paciente}</div>
                                  {disputada && (
                                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-bold text-muted-foreground">
                                      <StatusPill tone={c.ordemNaVaga === 1 ? "green" : "slate"} dense>
                                        {c.ordemNaVaga === 1 ? "Ofereça primeiro" : `${c.ordemNaVaga}ª opção`}
                                      </StatusPill>
                                      <span>
                                        {c.ordemNaVaga === 1
                                          ? `${linha.priorizadoPorFrequencia ? "mesmo valor, mas frequenta mais a clínica" : "mais rentável"} entre ${linha.concorrentesNaVaga} candidatos nesta vaga`
                                          : "só se o(s) anterior(es) recusar(em)"}
                                      </span>
                                    </div>
                                  )}
                                  {sessoesNoDia.length > 0 && (
                                    <div className="text-[10.5px] text-muted-foreground">Já neste dia: {sessoesNoDia.join(", ")}</div>
                                  )}
                                  {!!c.cobertosInternamente && c.ordemNaVaga === linha.concorrentesNaVaga && (
                                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                                      + {c.cobertosInternamente} paciente(s) desta vaga já atendido(s) por profissional existente
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.aut}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.of}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-extrabold text-rose-600 dark:text-rose-400">−{c.gap}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">+1</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                  {c.valorSessaoProjetado !== null ? fmtReal(c.valorSessaoProjetado) : "Sem valor cadastrado"}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {adjacente ? (
                                    <Button
                                      variant="outline" size="xs"
                                      onClick={() => setDetalhe({
                                        pac: c.paciente,
                                        slot: { dia: linha.dia, turno: c.turno, unidade, hora: c.hora, candidatos: [] },
                                        especialidade,
                                      })}
                                    >
                                      Ver detalhe
                                    </Button>
                                  ) : (
                                    <Button variant="outline" size="xs" onClick={() => setDetalheRemanejamento({ sugestao, candidato: c })}>
                                      Ver antes/depois
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {detalhe && <DetalheModal data={detalhe} cRows={cRows} onClose={() => setDetalhe(null)} />}
      {detalheRemanejamento?.candidato.remanejamento && (
        <RemanejamentoDetalheModal
          paciente={detalheRemanejamento.candidato.paciente}
          terapiaHipotetica={detalheRemanejamento.sugestao.especialidade}
          remanejamento={detalheRemanejamento.candidato.remanejamento}
          cRows={cRows}
          onClose={() => setDetalheRemanejamento(null)}
        />
      )}
      {detalheFinanceiroAberto && (
        <ProjecaoFinanceiraDetalheModal
          periodosEnriquecidos={periodosEnriquecidos}
          mesReferencia={mesReferencia}
          labelMesReferencia={labelMesReferencia}
          feriados={feriados}
          cRows={cRows}
          onClose={() => setDetalheFinanceiroAberto(false)}
        />
      )}
    </div>
  )
}
