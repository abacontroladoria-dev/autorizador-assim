"use client"

// Disponibilidade Interna (Tarefa 4) — antes de abrir vaga de contratação,
// mostra se um profissional já contratado consegue cobrir a necessidade.
// Duas modalidades:
//   1) Direto (E1) — o profissional já tem horário "Livre" exato na grade.
//   2) Via transferência (E1 de saida.ts, adaptado) — o profissional está
//      ocupado ali com OUTRO paciente, mas existe um profissional
//      EQUIVALENTE (mesma terapia) livre no MESMO dia/hora/unidade, pro
//      paciente ocupante ser transferido pra ele — só assim o profissional
//      original fica de fato livre pro paciente novo. Importante: isso NÃO É
//      remanejamento.ts/tentarRemanejamento — aquela função move a sessão do
//      paciente pra OUTRO HORÁRIO mantendo o MESMO profissional, o que não
//      libera capacidade nenhuma do profissional em questão (ele continua
//      com a agenda cheia, só embaralhada). Só é oferecida quando não há
//      cobertura direta no mesmo dia/hora/unidade/especialidade.

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, Search, Users, X } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useGradeAgendamentos } from "@/hooks/useGradeAgendamentos"
import { avaliarPeriodo, calcularGaps, gapsParaMapa, type GapItem, type Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import { listarOportunidadesDiretas } from "@/lib/cronograma/disponibilidadeInterna"
import { tentarTransferirParaOutroProfissional, type TransferenciaProfissional } from "@/lib/cronograma/remanejamento"
import { TERAPIA_TO_ESP } from "@/lib/cronograma/constants"
import { turnoFromHora, turnoNome, fmtName } from "@/lib/cronograma/helpers"
import { SortableTh, ordenarPor, type SortDir } from "@/components/cronograma/ui/SortableTh"
import { Button } from "@/components/ui/button"
import { PacienteAgendaHipoteticaModal } from "./PacienteAgendaHipoteticaModal"
import { TransferenciaProfissionalModal } from "./TransferenciaProfissionalModal"
import { ProfissionalAgendaTransferenciaModal } from "./ProfissionalAgendaTransferenciaModal"
import type { CsvRow } from "@/types/cronograma"

const POR_PAGINA = 50

/** Multi-seleção em lista suspensa (checkbox) — filtro "OR": qualquer um dos
 *  marcados passa. `<details>/<summary>` nativo, sem JS de posicionamento,
 *  funciona por toque em telas sensíveis sem lib extra. */
function MultiSelectDropdown({
  label, opcoes, selecionadas, onChange,
}: { label: string; opcoes: string[]; selecionadas: Set<string>; onChange: (v: Set<string>) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const alternar = (opcao: string) => {
    const proxima = new Set(selecionadas)
    if (proxima.has(opcao)) proxima.delete(opcao)
    else proxima.add(opcao)
    onChange(proxima)
  }
  return (
    <details ref={detailsRef} className="relative">
      <summary className={`flex cursor-pointer list-none items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        selecionadas.size ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400" : "border-border bg-card text-foreground hover:bg-muted/50"
      }`}>
        {label}{selecionadas.size ? ` (${selecionadas.size})` : ""} <ChevronDown size={12} />
      </summary>
      <div className="absolute left-0 top-[calc(100%+4px)] z-[100] max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
        {selecionadas.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="mb-1 w-full rounded-md px-2 py-1 text-left text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-muted/50"
          >
            Limpar seleção
          </button>
        )}
        {opcoes.map(op => (
          <label key={op} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/50">
            <input type="checkbox" checked={selecionadas.has(op)} onChange={() => alternar(op)} className="shrink-0" />
            <span className="truncate">{op}</span>
          </label>
        ))}
      </div>
    </details>
  )
}

interface LinhaDisponibilidade {
  profissional: string
  dia: string
  turno: Turno
  hora: string
  unidade: string
  terapia: string
  especialidade: string
  modalidade: "direto" | "transferencia"
  transferencia?: TransferenciaProfissional
  pacientes: { pac: string; gap: number }[]
}

type SortKey = "profissional" | "dia" | "hora" | "unidade" | "especialidade" | "modalidade" | "qtdPacientes"

/** Um profissional livre = no máximo 1 paciente coberto — casamento já feito
 *  por listarOportunidadesDiretas (lib/cronograma/disponibilidadeInterna.ts),
 *  a mesma fonte que a simulação de contratação usa pra descontar
 *  disponibilidade interna. Antes esta função listava TODOS os candidatos
 *  elegíveis em cada linha de profissional livre, sem descontar que só 1
 *  paciente ocupa cada vaga — podia mostrar 2 pacientes como "cobertos" por
 *  um único profissional livre. */
function linhasDiretas(rows: CsvRow[], gapMap: Record<string, GapItem>): LinhaDisponibilidade[] {
  return listarOportunidadesDiretas(rows, gapMap).map(o => ({
    profissional: o.profissional, dia: o.dia, turno: o.turno, hora: o.hora, unidade: o.unidade,
    terapia: o.terapia, especialidade: o.especialidade, modalidade: "direto",
    pacientes: [{ pac: o.paciente.pac, gap: o.paciente.gap }],
  }))
}

/** Profissional A está ocupado com outro paciente naquele dia/hora — só entra
 *  aqui se existir um profissional B EQUIVALENTE (mesma terapia) livre no
 *  MESMO dia/hora/unidade pra quem esse paciente possa ser transferido
 *  (tentarTransferirParaOutroProfissional). Isso de fato libera a agenda de A
 *  pro paciente novo — diferente da versão anterior, que só reorganizava a
 *  agenda do PRÓPRIO profissional A sem abrir capacidade nenhuma. */
function linhasViaTransferencia(
  rows: CsvRow[], gapMap: Record<string, GapItem>, jaCobertos: Set<string>,
): LinhaDisponibilidade[] {
  const cachePeriodo = new Map<string, ReturnType<typeof avaliarPeriodo>>()
  const vistos = new Set<string>()
  const out: LinhaDisponibilidade[] = []

  for (const row of rows) {
    if (row["Status do Agendamento"] !== "Agendado") continue
    const prof = row["Profissional"]
    const dia = row["Dia da Semana"]
    const hora = String(row.HI_str || "")
    const unidade = String(row.Unidade || "Desconhecida")
    const pacienteOcupante = row["Nome Favorecido"]
    if (!prof || !dia || !hora || !pacienteOcupante) continue

    const especialidade = TERAPIA_TO_ESP[row.Terapia]
    if (!especialidade) continue

    const chaveVista = `${dia}|||${hora}|||${unidade}|||${prof}`
    if (vistos.has(chaveVista)) continue
    vistos.add(chaveVista)

    const chaveCoberta = `${dia}|||${hora}|||${unidade}|||${especialidade}`
    if (jaCobertos.has(chaveCoberta)) continue // já tem cobertura direta ali — transferência seria redundante

    const turno = turnoFromHora(hora)
    const chavePeriodo = `${dia}|||${turno}|||${unidade}|||${especialidade}`
    let periodo = cachePeriodo.get(chavePeriodo)
    if (!periodo) {
      periodo = avaliarPeriodo(dia, turno, unidade, especialidade, rows, gapMap)
      cachePeriodo.set(chavePeriodo, periodo)
    }
    const slotAvaliado = periodo.slots.find(s => s.hora === hora)
    if (!slotAvaliado?.candidatos.length) continue

    const detalhe = tentarTransferirParaOutroProfissional(pacienteOcupante, dia, hora, unidade, prof, rows)
    if (!detalhe) continue

    out.push({
      profissional: prof, dia, turno, hora, unidade, terapia: row.Terapia, especialidade,
      modalidade: "transferencia", transferencia: detalhe,
      pacientes: slotAvaliado.candidatos.map(c => ({ pac: c.pac, gap: c.gap })),
    })
  }
  return out
}

function useLinhasDisponibilidade(): { linhas: LinhaDisponibilidade[]; loading: boolean; error: string | null; refWeekLabel: string; cRows: CsvRow[] } {
  const { cRows: rows, loading, error, refWeek } = useGradeAgendamentos()
  const { lRows } = useCronogramaData()

  const linhas = useMemo((): LinhaDisponibilidade[] => {
    if (!rows.length) return []
    const gapMap = gapsParaMapa(calcularGaps(lRows, rows))
    const diretas = linhasDiretas(rows, gapMap)
    const cobertas = new Set(diretas.map(l => `${l.dia}|||${l.hora}|||${l.unidade}|||${l.especialidade}`))
    const transferidas = linhasViaTransferencia(rows, gapMap, cobertas)
    return [...diretas, ...transferidas]
  }, [rows, lRows])

  return { linhas, loading, error, refWeekLabel: refWeek.label, cRows: rows }
}

export function DisponibilidadeInternaView() {
  const { linhas, loading, error, refWeekLabel, cRows } = useLinhasDisponibilidade()
  const { setHeader } = useHeader()
  const [detalhePaciente, setDetalhePaciente] = useState<LinhaDisponibilidade | null>(null)
  const [detalheDireto, setDetalheDireto] = useState<LinhaDisponibilidade | null>(null)
  const [detalheProfissional, setDetalheProfissional] = useState<LinhaDisponibilidade | null>(null)

  useEffect(() => {
    setHeader("Ocupar Profissionais Disponíveis", `Profissionais já contratados que cobririam sessões pendentes (direto ou via transferência) — semana de referência: ${refWeekLabel}`)
    return () => setHeader("", "")
  }, [refWeekLabel, setHeader])

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "qtdPacientes", dir: "desc" })
  const [busca, setBusca] = useState("")
  const [profissionaisSel, setProfissionaisSel] = useState<Set<string>>(new Set())
  const [especialidadesSel, setEspecialidadesSel] = useState<Set<string>>(new Set())
  const [unidadesSel, setUnidadesSel] = useState<Set<string>>(new Set())
  const [modalidadesSel, setModalidadesSel] = useState<Set<string>>(new Set())
  const [pagina, setPagina] = useState(0)

  const linhasCalc = useMemo(() =>
    linhas.map(l => ({ ...l, qtdPacientes: l.pacientes.length })),
  [linhas])

  const linhasOrdenadas = useMemo(
    () => ordenarPor(linhasCalc, sort.key, sort.dir),
    [linhasCalc, sort.key, sort.dir],
  )

  const opcoesProfissionais = useMemo(() => [...new Set(linhas.map(l => l.profissional))].sort(), [linhas])
  const opcoesEspecialidades = useMemo(() => [...new Set(linhas.map(l => l.especialidade))].sort(), [linhas])
  const opcoesUnidades = useMemo(() => [...new Set(linhas.map(l => l.unidade))].sort(), [linhas])

  const filtroAtivo = !!(busca || profissionaisSel.size || especialidadesSel.size || unidadesSel.size || modalidadesSel.size)

  // Busca varre TODAS as linhas calculadas (não só a página atual) — nome do
  // profissional OU de qualquer paciente coberto naquela linha.
  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return linhasOrdenadas.filter(l => {
      if (termo && !fmtName(l.profissional).toLowerCase().includes(termo) && !l.pacientes.some(p => p.pac.toLowerCase().includes(termo))) return false
      if (profissionaisSel.size && !profissionaisSel.has(l.profissional)) return false
      if (especialidadesSel.size && !especialidadesSel.has(l.especialidade)) return false
      if (unidadesSel.size && !unidadesSel.has(l.unidade)) return false
      if (modalidadesSel.size && !modalidadesSel.has(l.modalidade)) return false
      return true
    })
  }, [linhasOrdenadas, busca, profissionaisSel, especialidadesSel, unidadesSel, modalidadesSel])

  const qtdDireto = linhas.filter(l => l.modalidade === "direto").length
  const qtdTransferencia = linhas.length - qtdDireto

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const linhasDaPagina = linhasFiltradas.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA)

  function onSortClick(key: string) {
    setSort(prev => ({ key: key as SortKey, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))
    setPagina(0)
  }

  function limparFiltros() {
    setBusca(""); setProfissionaisSel(new Set()); setEspecialidadesSel(new Set()); setUnidadesSel(new Set()); setModalidadesSel(new Set()); setPagina(0)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Carregando disponibilidade interna...
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-24 text-sm text-destructive">
      Erro ao carregar dados: {error}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-4 py-3 text-xs text-sky-900 dark:text-sky-200">
        <strong>{linhas.length}</strong> oportunidade(s) de cobertura interna antes de abrir vaga de contratação —{" "}
        <strong>{qtdDireto}</strong> com horário já livre, <strong>{qtdTransferencia}</strong> possíveis transferindo o paciente ocupante para outro profissional equivalente livre no mesmo horário.
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(0) }}
            placeholder="Buscar profissional ou paciente..."
            className="w-56 rounded-lg border border-border bg-card py-1.5 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <MultiSelectDropdown label="Profissional" opcoes={opcoesProfissionais} selecionadas={profissionaisSel} onChange={v => { setProfissionaisSel(v); setPagina(0) }} />
        <MultiSelectDropdown label="Especialidade" opcoes={opcoesEspecialidades} selecionadas={especialidadesSel} onChange={v => { setEspecialidadesSel(v); setPagina(0) }} />
        <MultiSelectDropdown label="Unidade" opcoes={opcoesUnidades} selecionadas={unidadesSel} onChange={v => { setUnidadesSel(v); setPagina(0) }} />
        <MultiSelectDropdown label="Modalidade" opcoes={["direto", "transferencia"]} selecionadas={modalidadesSel} onChange={v => { setModalidadesSel(v); setPagina(0) }} />
        {filtroAtivo && (
          <Button variant="outline" size="xs" className="gap-1" onClick={limparFiltros}>
            <X size={12} /> Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{linhasFiltradas.length} de {linhas.length} linha(s)</span>
      </div>

      {!linhasFiltradas.length ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {filtroAtivo
            ? "Nenhuma linha corresponde aos filtros selecionados."
            : "Nenhum profissional interno (direto ou via transferência) cobre pacientes com sessões pendentes na semana de referência."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <SortableTh label="Profissional" sortKey="profissional" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Dia" sortKey="dia" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Horário" sortKey="hora" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Unidade" sortKey="unidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Especialidade" sortKey="especialidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Modalidade" sortKey="modalidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Pacientes cobertos" sortKey="qtdPacientes" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick} />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhasDaPagina.map((l, i) => {
                const direto = l.modalidade === "direto"
                return (
                  <tr key={`${l.profissional}|${l.dia}|${l.hora}|${l.terapia}|${i}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-bold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={12} className="text-muted-foreground" />
                        {fmtName(l.profissional)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{l.dia.replace("-feira", "")}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-foreground">{turnoNome[l.turno]}</span>{" "}
                      <span className="font-mono tabular-nums text-foreground">{l.hora}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{l.unidade}</td>
                    <td className="px-3 py-2 text-foreground">{l.especialidade}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        direto
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
                      }`}>
                        {!direto && <ArrowRightLeft size={10} />}
                        {direto ? "Direto" : "Via transferência"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">{l.pacientes.length}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{l.pacientes.map(p => `${p.pac} (−${p.gap})`).join(", ")}</span>
                        {direto ? (
                          <Button variant="outline" size="xs" onClick={() => setDetalheDireto(l)}>
                            Ver agenda
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="xs" onClick={() => setDetalhePaciente(l)}>
                              Ver antes/depois (paciente)
                            </Button>
                            <Button variant="outline" size="xs" onClick={() => setDetalheProfissional(l)}>
                              Ver antes/depois (profissional)
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="icon-xs" disabled={paginaAtual === 0} onClick={() => setPagina(p => Math.max(0, p - 1))} aria-label="Página anterior">
            <ChevronLeft size={13} />
          </Button>
          <span className="px-2 text-[11px] font-bold text-muted-foreground">Página {paginaAtual + 1} de {totalPaginas}</span>
          <Button variant="outline" size="icon-xs" disabled={paginaAtual === totalPaginas - 1} onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} aria-label="Próxima página">
            <ChevronRight size={13} />
          </Button>
        </div>
      )}

      {detalhePaciente?.transferencia && detalhePaciente.pacientes[0] && (
        <TransferenciaProfissionalModal
          transferencia={detalhePaciente.transferencia}
          pacienteNovo={detalhePaciente.pacientes[0].pac}
          cRows={cRows}
          onClose={() => setDetalhePaciente(null)}
        />
      )}

      {detalheProfissional?.transferencia && detalheProfissional.pacientes[0] && (
        <ProfissionalAgendaTransferenciaModal
          transferencia={detalheProfissional.transferencia}
          pacienteNovo={detalheProfissional.pacientes[0].pac}
          terapiaNova={detalheProfissional.terapia}
          cRows={cRows}
          onClose={() => setDetalheProfissional(null)}
        />
      )}

      {detalheDireto?.pacientes[0] && (
        <PacienteAgendaHipoteticaModal
          paciente={detalheDireto.pacientes[0].pac}
          slot={{ dia: detalheDireto.dia, turno: detalheDireto.turno, hora: detalheDireto.hora, unidade: detalheDireto.unidade }}
          especialidade={detalheDireto.especialidade}
          profissionalHipotetico={detalheDireto.profissional}
          cRows={cRows}
          onClose={() => setDetalheDireto(null)}
        />
      )}
    </div>
  )
}
