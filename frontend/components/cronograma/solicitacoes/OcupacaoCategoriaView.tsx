"use client"

// Ocupar Profissionais Disponíveis — visão "por Unidade, Dia e Especialidade":
// em vez de escolher um profissional, escolhe-se a categoria (unidade +
// 1-N dias/turnos + especialidade) e vê-se, numa grade de horários fixa da
// semana, quais vagas existem ali — Livre sem oportunidade / Oportunidade
// direta / Oportunidade via remanejamento — com QUALQUER profissional que já
// tenha horário "Livre" real nessa combinação. Motor em
// lib/cronograma/ocupacaoCategoria.ts, mesmas 3 modalidades e o mesmo
// cálculo já usados na visão "por Nome" (DisponibilidadeInternaView.tsx), só
// reagrupado.
//
// Quando um horário tem mais de 1 profissional/candidato disponível, o
// clique abre VagaHorarioSelector (lista os candidatos, direto e
// remanejamento em seções separadas) em vez de ir direto pro modal de
// detalhe — só pula esse passo quando há exatamente 1 candidato acionável.

import { useMemo, useState } from "react"
import { Building2, Lock } from "lucide-react"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { calcularGaps, gapsParaMapa, type GapItem, type Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import { gerarVagasCategoria, contarOcupadosCategoria, type VagaCategoria } from "@/lib/cronograma/ocupacaoCategoria"
import { DIAS_UTIL, HORAS_GRID, TODAS_ESP, UNID_COR } from "@/lib/cronograma/constants"
import { diaCurto, fmtName, turnoFromHora, turnoNome } from "@/lib/cronograma/helpers"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { SearchCombobox } from "@/components/cronograma/ui/SearchCombobox"
import { Button } from "@/components/ui/button"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import { PacienteAgendaHipoteticaModal } from "./PacienteAgendaHipoteticaModal"
import { VagaHorarioSelector } from "./VagaHorarioSelector"
import { ProjecaoOcupacaoDonut } from "./ProjecaoOcupacaoDonut"
import { OportunidadesInternasPanel } from "./OportunidadesInternasPanel"
import type { CsvRow } from "@/types/cronograma"

const UNIDADES = Object.keys(UNID_COR)
const TURNOS: Turno[] = ["manha", "tarde"]

type PeriodosSel = Record<string, { manha?: boolean; tarde?: boolean }>

// Prioridade de exibição quando há mais de 1 vaga na mesma hora: mostra
// primeiro a mais "acionável" (direto > remanejamento > livre).
const PRIORIDADE: Record<VagaCategoria["status"], number> = { direto: 0, remanejamento: 1, livre: 2 }

const ESTILO_STATUS: Record<VagaCategoria["status"], string> = {
  livre: "border-dashed border-border bg-transparent",
  direto: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 cursor-pointer hover:brightness-95",
  remanejamento: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 cursor-pointer hover:brightness-95",
}

const LABEL_STATUS: Record<VagaCategoria["status"], string> = {
  livre: "Livre",
  direto: "Ver agenda",
  remanejamento: "Ver antes/depois",
}

// ─── Seletor de períodos (Segunda manhã/tarde/dia inteiro, Terça...) ───────
// Mesmo padrão de SimulacaoNovoPrestadorTab.tsx.
function PeriodosSelector({
  periodosSel, onChange,
}: { periodosSel: PeriodosSel; onChange: (p: PeriodosSel) => void }) {
  const alternar = (dia: string, turno: Turno) => {
    onChange({ ...periodosSel, [dia]: { ...periodosSel[dia], [turno]: !periodosSel[dia]?.[turno] } })
  }
  const alternarDiaInteiro = (dia: string) => {
    const atual = periodosSel[dia] || {}
    const todosMarcados = !!atual.manha && !!atual.tarde
    onChange({ ...periodosSel, [dia]: { manha: !todosMarcados, tarde: !todosMarcados } })
  }
  const selecionarTudo = () => onChange(Object.fromEntries(DIAS_UTIL.map(d => [d, { manha: true, tarde: true }])))
  const limparTudo = () => onChange({})

  return (
    <div className="w-full sm:w-fit rounded-xl border border-border bg-muted p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="whitespace-nowrap text-sm font-extrabold text-foreground">Dias e turnos</span>
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
              {TURNOS.map(turno => (
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
    </div>
  )
}

// Altura fixa (não só mínima) de todo bloco de 40min, ocupado, livre ou vazio
// — sem isso, cartões com mais texto (ex.: "Ver quem está livre") esticavam
// a linha inteira e desalinhavam as outras colunas do mesmo horário.
const ALTURA_CELULA = "h-[54px]"

function CelulaGrade({
  vagas, focada, onAbrirCelula,
}: { vagas: VagaCategoria[]; focada: boolean; onAbrirCelula: (vagas: VagaCategoria[]) => void }) {
  if (!focada) {
    return <div className={`${ALTURA_CELULA} rounded-lg border border-transparent bg-sky-50/50 dark:bg-sky-950/10`} />
  }
  if (!vagas.length) return <div className={ALTURA_CELULA} />

  const ordenadas = [...vagas].sort((a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status])
  const principal = ordenadas[0]
  const resto = ordenadas.length - 1
  // Clicável se há algo pra fazer (direto/remanejamento) OU se há mais de 1
  // profissional na célula — mesmo só "livre", vale poder ver quem são todos
  // (sem isso, o "+N" escondia profissionais sem nenhuma forma de revelar).
  const clicavel = principal.status !== "livre" || resto > 0

  return (
    <button
      type="button"
      disabled={!clicavel}
      onClick={() => clicavel && onAbrirCelula(vagas)}
      className={`${ALTURA_CELULA} w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left ${ESTILO_STATUS[principal.status]}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[11px] font-bold leading-tight text-foreground">{fmtName(principal.profissional)}</span>
        {resto > 0 && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">+{resto}</span>}
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        {principal.status === "livre" ? "Livre" : fmtName(principal.paciente?.pac ?? "")}
      </div>
      {clicavel && (
        <div className={`mt-0.5 truncate text-[10px] font-bold ${principal.status === "livre" ? "text-muted-foreground" : principal.status === "direto" ? "text-emerald-700 dark:text-emerald-400" : "text-sky-700 dark:text-sky-400"}`}>
          {resto > 0 ? "Ver quem está livre" : LABEL_STATUS[principal.status]}
        </div>
      )}
    </button>
  )
}

function GradeCategoria({
  unidade, periodosSel, especialidade, cRows, gapMap, onAbrirCelula,
}: { unidade: string; periodosSel: PeriodosSel; especialidade: string; cRows: CsvRow[]; gapMap: Record<string, GapItem>; onAbrirCelula: (dia: string, hora: string, vagas: VagaCategoria[]) => void }) {
  const diasAtivos = useMemo(
    () => DIAS_UTIL.filter(d => periodosSel[d]?.manha || periodosSel[d]?.tarde),
    [periodosSel],
  )

  const vagasPorDia = useMemo(() => {
    const m = new Map<string, VagaCategoria[]>()
    for (const d of diasAtivos) m.set(d, gerarVagasCategoria(unidade, d, especialidade, cRows, gapMap))
    return m
  }, [diasAtivos, unidade, especialidade, cRows, gapMap])

  const todasVagas = useMemo(() => [...vagasPorDia.values()].flat(), [vagasPorDia])
  const qtdDireto = todasVagas.filter(v => v.status === "direto").length
  const qtdRemanejamento = todasVagas.filter(v => v.status === "remanejamento").length
  const qtdLivre = todasVagas.filter(v => v.status === "livre").length

  const ocupado = useMemo(() => {
    const periodos = diasAtivos.flatMap(d => TURNOS.filter(t => periodosSel[d]?.[t]).map(turno => ({ dia: d, turno })))
    return contarOcupadosCategoria(unidade, periodos, especialidade, cRows)
  }, [diasAtivos, periodosSel, unidade, especialidade, cRows])

  const celulaAtiva = (dia: string, hora: string) => !!periodosSel[dia]?.[turnoFromHora(hora)]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 size={14} className="text-muted-foreground" />
        <span className="text-sm font-extrabold text-foreground">{unidade} · {especialidade}</span>
        <span className="text-[11px] text-muted-foreground">
          {qtdDireto + qtdRemanejamento} oportunidade(s) — {qtdDireto} direta(s), {qtdRemanejamento} via remanejamento · {qtdLivre} livre(s) sem oportunidade
        </span>
      </div>

      <div className="mb-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-border" /> Livre, sem oportunidade</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Oportunidade direta</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30" /> Oportunidade via remanejamento</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-50/50 dark:bg-sky-950/10" /> Fora do filtro de dias/turnos</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4 items-start">
        {!diasAtivos.length ? (
          <InlineNotice tone="slate">Selecione ao menos 1 dia/turno pra ver as vagas.</InlineNotice>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border p-3">
            <table className="table-fixed border-collapse text-[11px]" style={{ width: `${56 + DIAS_UTIL.length * 140}px` }}>
              <colgroup>
                <col style={{ width: 56 }} />
                {DIAS_UTIL.map(d => <col key={d} style={{ width: 140 }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="w-14" />
                  {DIAS_UTIL.map(d => (
                    <th key={d} className={`pb-1.5 text-center text-[11px] font-bold ${diasAtivos.includes(d) ? "text-foreground" : "text-muted-foreground/60"}`}>{diaCurto(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS_GRID.map(hora => (
                  <tr key={hora} className="border-t border-border">
                    <td className="py-1 pr-2 text-right font-mono text-[10px] font-semibold text-muted-foreground">{hora}</td>
                    {DIAS_UTIL.map(d => {
                      const ativa = celulaAtiva(d, hora)
                      const vagasCelula = ativa ? (vagasPorDia.get(d) ?? []).filter(v => v.hora === hora) : []
                      return (
                        <td key={d} className="p-0.5">
                          <CelulaGrade vagas={vagasCelula} focada={ativa} onAbrirCelula={vagas => onAbrirCelula(d, hora, vagas)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ProjecaoOcupacaoDonut titulo="Ocupação da categoria" ocupado={ocupado} oportunidade={qtdDireto + qtdRemanejamento} livre={qtdLivre} />
      </div>
    </div>
  )
}

interface Props {
  cRows: CsvRow[]
}

export function OcupacaoCategoriaView({ cRows }: Props) {
  const { lRows } = useCronogramaData()
  const laudosCarregados = lRows.length > 0
  const gapMap = useMemo(() => gapsParaMapa(calcularGaps(lRows, cRows)), [lRows, cRows])

  const [unidade, setUnidade] = useState("")
  const [periodosSel, setPeriodosSel] = useState<PeriodosSel>({})
  const [especialidade, setEspecialidade] = useState("")
  const [celulaSelecionada, setCelulaSelecionada] = useState<{ dia: string; hora: string; vagas: VagaCategoria[] } | null>(null)
  const [detalheDireto, setDetalheDireto] = useState<{ dia: string; vaga: VagaCategoria } | null>(null)
  const [detalheRemanejamento, setDetalheRemanejamento] = useState<VagaCategoria | null>(null)

  const diasSelecionados = useMemo(() => Object.keys(periodosSel).filter(d => periodosSel[d]?.manha || periodosSel[d]?.tarde), [periodosSel])
  const filtrosCompletos = !!unidade && !!especialidade && diasSelecionados.length > 0

  const aplicarOportunidade = (u: string, dia: string, turno: Turno, esp: string) => {
    setUnidade(u)
    setEspecialidade(esp)
    setPeriodosSel({ [dia]: { [turno]: true } })
  }

  // Só pula o seletor quando a célula tem exatamente 1 vaga no total (nenhuma
  // outra pra revelar) — se houver mais de 1 (mesmo que a extra seja só
  // "livre"), sempre abre o seletor, pra nunca esconder quem mais está livre.
  const abrirCelula = (dia: string, hora: string, vagas: VagaCategoria[]) => {
    if (vagas.length === 1) {
      const v = vagas[0]
      if (v.status === "direto") setDetalheDireto({ dia, vaga: v })
      else if (v.status === "remanejamento") setDetalheRemanejamento(v)
      return
    }
    setCelulaSelecionada({ dia, hora, vagas })
  }

  return (
    <div className="flex flex-col gap-4">
      {!laudosCarregados ? (
        <InlineNotice tone="amber" icon={<Lock size={15} />}>
          <strong>Relatório de laudos não anexado.</strong> Sem ele não é possível calcular quem tem sessões pendentes (autorizado × ofertado) — os horários "Livre" apareceriam sempre como "sem oportunidade", mesmo quando há demanda real. Anexe o relatório de laudos para liberar esta aba.
        </InlineNotice>
      ) : (
        <>
          <OportunidadesInternasPanel cRows={cRows} gapMap={gapMap} onAplicar={aplicarOportunidade} />

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-1.5">
              <Building2 size={15} className="text-violet-600 dark:text-violet-400" />
              <span className="text-[15px] font-extrabold text-foreground">Ocupar por unidade, dia e especialidade</span>
            </div>
            <div className="mb-3 text-xs text-muted-foreground">
              Escolha uma unidade, um ou mais dias/turnos e uma especialidade pra ver todas as vagas dessa combinação — com qualquer profissional que já tenha horário "Livre" real ali — direto ou via remanejamento. Sem escrever nada na TiTa, é só visualização.
            </div>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex w-full sm:w-56 flex-col gap-1">
                <span className="text-[11px] font-bold text-muted-foreground">Unidade</span>
                <SearchCombobox value={unidade} onChange={setUnidade} opcoes={UNIDADES} placeholder="Digite para buscar a unidade..." ariaLabel="Buscar unidade" />

                <span className="mt-2 text-[11px] font-bold text-muted-foreground">Especialidade</span>
                <SearchCombobox value={especialidade} onChange={setEspecialidade} opcoes={TODAS_ESP} placeholder="Digite para buscar a especialidade..." ariaLabel="Buscar especialidade" />
              </div>

              <PeriodosSelector periodosSel={periodosSel} onChange={setPeriodosSel} />
            </div>
          </div>

          {!filtrosCompletos ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Selecione unidade, especialidade e ao menos 1 dia/turno para ver as vagas.
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4">
              <GradeCategoria
                unidade={unidade}
                periodosSel={periodosSel}
                especialidade={especialidade}
                cRows={cRows}
                gapMap={gapMap}
                onAbrirCelula={abrirCelula}
              />
            </div>
          )}
        </>
      )}

      {celulaSelecionada && (
        <VagaHorarioSelector
          dia={celulaSelecionada.dia}
          hora={celulaSelecionada.hora}
          vagas={celulaSelecionada.vagas}
          onEscolherDireto={v => { setDetalheDireto({ dia: celulaSelecionada.dia, vaga: v }); setCelulaSelecionada(null) }}
          onEscolherRemanejamento={v => { setDetalheRemanejamento(v); setCelulaSelecionada(null) }}
          onClose={() => setCelulaSelecionada(null)}
        />
      )}

      {detalheDireto?.vaga.paciente && (
        <PacienteAgendaHipoteticaModal
          paciente={detalheDireto.vaga.paciente.pac}
          slot={{ dia: detalheDireto.dia, turno: detalheDireto.vaga.turno, hora: detalheDireto.vaga.hora, unidade }}
          especialidade={especialidade}
          profissionalHipotetico={detalheDireto.vaga.profissional}
          cRows={cRows}
          onClose={() => setDetalheDireto(null)}
        />
      )}

      {detalheRemanejamento?.remanejamento && (
        <RemanejamentoDetalheModal
          paciente={detalheRemanejamento.paciente!.pac}
          terapiaHipotetica={detalheRemanejamento.terapia}
          profissionalHipotetico={detalheRemanejamento.profissional}
          remanejamento={detalheRemanejamento.remanejamento}
          cRows={cRows}
          onClose={() => setDetalheRemanejamento(null)}
        />
      )}
    </div>
  )
}
