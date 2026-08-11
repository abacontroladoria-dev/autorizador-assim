"use client"

// Ocupar Profissionais Disponíveis — escolha UM profissional já contratado e
// veja onde a agenda dele tem espaço pra crescer, antes de abrir vaga de
// contratação nova. Mesmo espírito de /cronograma/ocupacao-paciente (escolher
// uma entidade por vez, ver oportunidades na agenda dela), só que na ótica do
// profissional em vez do paciente.
//
// Duas modalidades de oportunidade, calculadas por
// lib/cronograma/ocupacaoProfissional.ts:
//   1) Direto — o profissional já tem um horário "Livre" exato na grade, e
//      existe paciente com sessão pendente (gap) elegível ali.
//   2) Via remanejamento — o horário está ocupado por OUTRO profissional com
//      outro paciente, mas o PACIENTE candidato (não o ocupante) tem uma
//      sessão conflitante nesse horário com ESSE outro profissional, que pode
//      ser movida pra uma ponta adjacente da agenda do próprio paciente,
//      mantendo o outro profissional — liberando o horário pro selecionado.
//      A agenda do profissional selecionado NUNCA perde nada; só ganha.

import { useEffect, useMemo, useRef, useState } from "react"
import { Sparkles, Users } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useGradeAgendamentos } from "@/hooks/useGradeAgendamentos"
import { calcularGaps, gapsParaMapa } from "@/lib/cronograma/simulacaoNovoPrestador"
import { listarProfissionaisComOportunidade, gerarOportunidadesProfissional, type OportunidadeProfissional } from "@/lib/cronograma/ocupacaoProfissional"
import { listarSlotsLivres } from "@/lib/cronograma/disponibilidadeInterna"
import { DIAS_UTIL } from "@/lib/cronograma/constants"
import { diaCurto, fmtName } from "@/lib/cronograma/helpers"
import { InlineNotice } from "@/components/cronograma/ui/InlineNotice"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import { PacienteAgendaHipoteticaModal } from "./PacienteAgendaHipoteticaModal"
import type { CsvRow } from "@/types/cronograma"

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }

// ─── Combobox de profissional (mesmo padrão ARIA do EspecialidadeCombobox de
//     SimulacaoNovoPrestadorTab.tsx, por sua vez copiado do autocomplete de
//     paciente do OcupPacMode) ─────────────────────────────────────────────
function ProfissionalCombobox({
  value, onChange, opcoes, contagemLivres,
}: { value: string; onChange: (v: string) => void; opcoes: string[]; contagemLivres: Map<string, number> }) {
  const [texto, setTexto] = useState(value)
  const [aberto, setAberto] = useState(false)
  const [ativoIdx, setAtivoIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const [ultimoValor, setUltimoValor] = useState(value)
  if (value !== ultimoValor) {
    setUltimoValor(value)
    setTexto(value)
  }

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter(o => fmtName(o).toLowerCase().includes(q))
  }, [texto, opcoes])

  const selecionar = (p: string) => { onChange(p); setTexto(p); setUltimoValor(p); setAberto(false); setAtivoIdx(-1) }
  const valida = opcoes.includes(value)

  return (
    <div className="relative w-full sm:w-80">
      <input
        id="ocupar-prof-input"
        type="text"
        aria-label="Buscar profissional"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={aberto ? "ocupar-prof-listbox" : undefined}
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
        placeholder="Digite para buscar um profissional..."
        className={`w-full rounded-lg border px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${valida ? "border-border bg-card" : "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"}`}
      />
      {aberto && filtradas.length > 0 && (
        <div
          ref={listRef}
          id="ocupar-prof-listbox"
          role="listbox"
          aria-label="Profissionais"
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-[100] max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtradas.map((p, i) => {
            const selecionada = p === value
            const ativa = i === ativoIdx
            return (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={selecionada}
                onMouseDown={() => selecionar(p)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${ativa ? "bg-sky-600 text-white" : selecionada ? "bg-muted font-semibold text-foreground" : "text-foreground hover:bg-muted/60"}`}
              >
                <span className="truncate">{fmtName(p)}</span>
                <span className={`shrink-0 text-[10px] font-bold ${ativa ? "text-white/80" : "text-muted-foreground"}`}>
                  {contagemLivres.get(p) ?? 0} livre(s)
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Grade semanal do profissional (existente + oportunidades) ────────────
type TagCelula = "ocupado" | "livre" | "direto" | "remanejamento"

interface CelulaProf {
  tag: TagCelula
  terapia: string
  paciente?: string
  oportunidade?: OportunidadeProfissional
}

const ESTILO_CELULA: Record<TagCelula, string> = {
  ocupado: "border-border bg-muted",
  livre: "border-dashed border-border bg-transparent",
  direto: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 cursor-pointer hover:brightness-95",
  remanejamento: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 cursor-pointer hover:brightness-95",
}

function AgendaProfissional({
  profissional, cRows, onAbrirOportunidade,
}: { profissional: string; cRows: CsvRow[]; onAbrirOportunidade: (o: OportunidadeProfissional) => void }) {
  const { lRows } = useCronogramaData()
  const gapMap = useMemo(() => gapsParaMapa(calcularGaps(lRows, cRows)), [lRows, cRows])
  const oportunidades = useMemo(
    () => gerarOportunidadesProfissional(profissional, cRows, gapMap),
    [profissional, cRows, gapMap],
  )

  const mapa = useMemo(() => {
    const m: Record<string, CelulaProf> = {}
    for (const row of cRows) {
      if (row["Profissional"] !== profissional) continue
      const status = row["Status do Agendamento"]
      if (status !== "Agendado" && status !== "Livre") continue
      const chave = `${row["Dia da Semana"]}|||${hiStr(row)}`
      if (status === "Agendado") {
        m[chave] = { tag: "ocupado", terapia: row.Terapia, paciente: row["Nome Favorecido"] }
      } else if (!m[chave]) {
        m[chave] = { tag: "livre", terapia: row.Terapia }
      }
    }
    for (const o of oportunidades) {
      const chave = `${o.dia}|||${o.hora}`
      m[chave] = { tag: o.modalidade, terapia: o.terapia, paciente: o.paciente.pac, oportunidade: o }
    }
    return m
  }, [cRows, profissional, oportunidades])

  const dias = useMemo(() => DIAS_UTIL.filter(d => Object.keys(mapa).some(k => k.startsWith(`${d}|||`))), [mapa])
  const horas = useMemo(() => [...new Set(Object.keys(mapa).map(k => k.split("|||")[1]))].sort(), [mapa])

  const qtdDireto = oportunidades.filter(o => o.modalidade === "direto").length
  const qtdRemanejamento = oportunidades.length - qtdDireto

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Users size={14} className="text-muted-foreground" />
        <span className="text-sm font-extrabold text-foreground">{fmtName(profissional)}</span>
        <span className="text-[11px] text-muted-foreground">
          {oportunidades.length} oportunidade(s) — {qtdDireto} direta(s), {qtdRemanejamento} via remanejamento
        </span>
      </div>

      <div className="mb-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-muted" /> Ocupado</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-border" /> Livre, sem oportunidade</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Oportunidade direta</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30" /> Oportunidade via remanejamento</span>
      </div>

      {!dias.length ? (
        <InlineNotice tone="slate">Nenhum horário (ocupado ou livre) encontrado pra esse profissional na semana de referência.</InlineNotice>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border p-3">
          <table className="border-collapse text-[11px]" style={{ width: `${56 + dias.length * 140}px` }}>
            <thead>
              <tr>
                <th className="w-14" />
                {dias.map(d => (
                  <th key={d} className="pb-1.5 text-center text-[11px] font-bold text-foreground">{diaCurto(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horas.map(hora => (
                <tr key={hora} className="border-t border-border">
                  <td className="py-1 pr-2 text-right font-mono text-[10px] font-semibold text-muted-foreground">{hora}</td>
                  {dias.map(dia => {
                    const c = mapa[`${dia}|||${hora}`]
                    if (!c) return <td key={dia} className="p-0.5" />
                    const clicavel = c.tag === "direto" || c.tag === "remanejamento"
                    return (
                      <td key={dia} className="p-0.5">
                        <button
                          type="button"
                          disabled={!clicavel}
                          onClick={() => c.oportunidade && onAbrirOportunidade(c.oportunidade)}
                          className={`w-full min-h-[46px] rounded-lg border px-2 py-1.5 text-left ${ESTILO_CELULA[c.tag]}`}
                        >
                          <div className="text-[11px] font-bold leading-tight text-foreground">{c.terapia}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {c.tag === "livre" ? "Livre" : fmtName(c.paciente ?? "")}
                          </div>
                          {clicavel && (
                            <div className={`mt-0.5 text-[10px] font-bold ${c.tag === "direto" ? "text-emerald-700 dark:text-emerald-400" : "text-sky-700 dark:text-sky-400"}`}>
                              {c.tag === "direto" ? "Ver agenda" : "Ver antes/depois"}
                            </div>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DisponibilidadeInternaView() {
  const { cRows, loading, error, refWeek } = useGradeAgendamentos()
  const { setHeader } = useHeader()
  const [profissional, setProfissional] = useState("")
  const [detalheDireto, setDetalheDireto] = useState<OportunidadeProfissional | null>(null)
  const [detalheRemanejamento, setDetalheRemanejamento] = useState<OportunidadeProfissional | null>(null)

  useEffect(() => {
    setHeader("Ocupar Profissionais Disponíveis", `Escolha um profissional já contratado pra ver onde a agenda dele tem espaço pra crescer — semana de referência: ${refWeek.label}`)
    return () => setHeader("", "")
  }, [refWeek.label, setHeader])

  const profissionais = useMemo(() => listarProfissionaisComOportunidade(cRows), [cRows])
  const contagemLivres = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of listarSlotsLivres(cRows)) {
      if (!s.especialidade) continue
      m.set(s.profissional, (m.get(s.profissional) ?? 0) + 1)
    }
    return m
  }, [cRows])

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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <Sparkles size={15} className="text-violet-600 dark:text-violet-400" />
          <span className="text-[15px] font-extrabold text-foreground">Ocupar profissional já contratado</span>
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          Escolha um profissional pra ver, dentro dos horários “Livre” reais da agenda dele, quais pacientes com sessão pendente (autorizado &gt; ofertado) poderiam entrar — direto ou remanejando a sessão conflitante de outro paciente com OUTRO profissional, mantido. Sem escrever nada na TiTa por enquanto — é só visualização.
        </div>
        <ProfissionalCombobox value={profissional} onChange={setProfissional} opcoes={profissionais} contagemLivres={contagemLivres} />
        {!profissionais.length && (
          <div className="mt-3">
            <InlineNotice tone="slate">Nenhum profissional com horário “Livre” na semana de referência.</InlineNotice>
          </div>
        )}
      </div>

      {!profissional ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Selecione um profissional. Só aparecem na lista profissionais com pelo menos 1 horário “Livre” na semana de referência.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4">
          <AgendaProfissional
            profissional={profissional}
            cRows={cRows}
            onAbrirOportunidade={o => (o.modalidade === "direto" ? setDetalheDireto(o) : setDetalheRemanejamento(o))}
          />
        </div>
      )}

      {detalheDireto && (
        <PacienteAgendaHipoteticaModal
          paciente={detalheDireto.paciente.pac}
          slot={{ dia: detalheDireto.dia, turno: detalheDireto.turno, hora: detalheDireto.hora, unidade: detalheDireto.unidade }}
          especialidade={detalheDireto.especialidade}
          profissionalHipotetico={profissional}
          cRows={cRows}
          onClose={() => setDetalheDireto(null)}
        />
      )}

      {detalheRemanejamento?.remanejamento && (
        <RemanejamentoDetalheModal
          paciente={detalheRemanejamento.paciente.pac}
          terapiaHipotetica={detalheRemanejamento.terapia}
          profissionalHipotetico={profissional}
          remanejamento={detalheRemanejamento.remanejamento}
          cRows={cRows}
          onClose={() => setDetalheRemanejamento(null)}
        />
      )}
    </div>
  )
}
