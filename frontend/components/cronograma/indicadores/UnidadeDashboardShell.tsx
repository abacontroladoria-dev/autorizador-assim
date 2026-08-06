"use client"

// UnidadeDashboardShell — dashboard de ocupação agregada por unidade, consumindo
// useOcupacaoSalas() (cruzamento cronograma_salas × csv_grades_profissionais).

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import * as XLSX from "xlsx"
import { Building2, DoorOpen, Download, Info, Loader2, Percent, X } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { CAPACIDADE_LABEL_CURTO, STATUS_LABEL_CURTO, STATUS_SLOT_EXCLUIDO, capacidadeProjetadaSala } from "@/lib/cronograma/salasTypes"
import { listarSlotsDetalhados, listarBlocosDetalhados, resumoOcupacaoDeItens } from "@/lib/cronograma/salas"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { OcupacaoDetalheModal, type DetalheOcupacao } from "./OcupacaoDetalheModal"
import type { Tone } from "@/components/cronograma/ui/tones"

const POPOVER_W = 256 // w-64

// Ícone de informação clicável — abre um balão de explicação (com botão "X"
// pra fechar) em vez de depender do title nativo do navegador, que era
// minúsculo e inconsistente entre navegadores. Renderizado via portal em
// document.body: o StatCard usa overflow-hidden (pra arredondar a barra de
// gradiente do topo) — um balão posicionado normalmente (absolute) dentro
// dele ficaria cortado pela borda do card, que é exatamente o que acontecia.
function InfoTooltip({ text }: { text: string }) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function alternar(e: MouseEvent) {
    // Vários chamadores agora embrulham o InfoTooltip num card/linha clicável
    // (ver os cards de turno abaixo) — sem isso, clicar no ícone também
    // dispararia o onClick do card em volta.
    e.stopPropagation()
    if (!aberto && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        top: r.bottom + 8,
        left: Math.min(r.left, window.innerWidth - POPOVER_W - 16),
      })
    }
    setAberto(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        aria-label="Mais informações"
        aria-expanded={aberto}
        className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info size={13} />
      </button>
      {aberto && pos && createPortal(
        <>
          {/* Camada invisível atrás do balão — clicar em qualquer lugar fora dele fecha. */}
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_W }}
            className="z-50 rounded-lg border border-border bg-card p-3 pr-7 text-[11px] font-normal normal-case leading-relaxed text-foreground shadow-lg"
          >
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
            {text}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

function pctTone(pct: number | null): Tone {
  if (pct === null) return "slate"
  if (pct >= 0.8) return "green"
  if (pct >= 0.6) return "blue"
  if (pct >= 0.4) return "amber"
  return "red"
}

export function UnidadeDashboardShell() {
  const { resumoUnidades, salasComOcupacao, loading, error } = useOcupacaoSalas()
  const { setRightContent } = useHeader()

  // Pedido de drill-down (StatCard "Manhã/Tarde X/Y" clicado) — as linhas só
  // são calculadas (listarSlotsDetalhados/listarBlocosDetalhados) quando o
  // modal está de fato aberto, não a cada render.
  const [pedido, setPedido] = useState<{ unidade: string; turno: "Manhã" | "Tarde"; tipo: "slot" | "bloco" } | null>(null)

  const detalhe: DetalheOcupacao | null = useMemo(() => {
    if (!pedido) return null
    if (pedido.tipo === "slot") {
      return { tipo: "slot", unidade: pedido.unidade, turno: pedido.turno, linhas: listarSlotsDetalhados(salasComOcupacao, pedido.unidade, pedido.turno) }
    }
    return { tipo: "bloco", unidade: pedido.unidade, turno: pedido.turno, linhas: listarBlocosDetalhados(salasComOcupacao, pedido.unidade, pedido.turno) }
  }, [pedido, salasComOcupacao])

  const exportarXLSX = useCallback(() => {
    const r2 = (v: number) => Math.round(v * 100) / 100
    const pctVal = (v: number | null) => v !== null ? r2(v * 100) : 0

    // ── Folha 1: por unidade ──────────────────────────────────────────────────
    const unidRows = resumoUnidades.map(r => ({
      Unidade: r.unidade,
      Salas_Total: r.salasTotal,
      Salas_Operacionais: r.salasAtivas,
      Salas_Administrativas: r.salasAdm,
      Salas_Bloqueadas: r.salasBloqueadas,
      Salas_NTI: r.salasNti,
      Salas_Unico: r.salasPorCapacidade.unico,
      Salas_Duplo: r.salasPorCapacidade.duplo,
      Salas_Multiplo: r.salasPorCapacidade.multiplo,
      Capacidade_Simultanea: r.capacidadeSimultanea,
      Slots_Ocupados: r.slotsOcupados,
      Slots_Livres: r.slotsLivres,
      Slots_Bloqueados: r.slotsBloqueados,
      Slots_Total: r.slotsTotal,
      Ocupacao_percent: pctVal(r.pct),
      Blocos_Preenchidos: r.blocosPreenchidos,
      Blocos_Livres: r.blocosTotal - r.blocosPreenchidos,
      Blocos_Total: r.blocosTotal,
      Ocupacao_Real_percent: pctVal(r.pctGranular),
      Inconsistencias: r.inconsistencias,
    }))

    // ── Folha 2: por unidade e turno ─────────────────────────────────────────
    const unidTurnoRows = resumoUnidades.flatMap(r => r.porTurno.map(t => ({
      Unidade: r.unidade,
      Turno: t.turno,
      Slots_Ocupados: t.slotsOcupados,
      Slots_Livres: t.slotsLivres,
      Slots_Bloqueados: t.slotsBloqueados,
      Slots_Total: t.slotsTotal,
      Ocupacao_percent: pctVal(t.pct),
      Blocos_Preenchidos: t.blocosPreenchidos,
      Blocos_Livres: t.blocosTotal - t.blocosPreenchidos,
      Blocos_Total: t.blocosTotal,
      Ocupacao_Real_percent: pctVal(t.pctGranular),
    })))

    // ── Folha 3: por sala ─────────────────────────────────────────────────────
    const salaRows = salasComOcupacao.map(item => {
      const { sala, slots } = item
      const resumo = resumoOcupacaoDeItens([item])
      let blocosTotal = 0, blocosPreenchidos = 0
      slots.forEach(slot => {
        if (STATUS_SLOT_EXCLUIDO.includes(slot.status)) return
        blocosTotal += slot.blocos.length
        blocosPreenchidos += slot.blocos.filter(b => b.status === "preenchido").length
      })
      return {
        Unidade: sala.unidade_nome,
        Sala: sala.nome_exibicao,
        Numero_Sala: sala.numero_sala,
        Capacidade: CAPACIDADE_LABEL_CURTO[sala.capacidade],
        Status: STATUS_LABEL_CURTO[sala.status],
        Capacidade_Projetada: capacidadeProjetadaSala(sala.capacidade, sala.status),
        Slots_Ocupados: resumo.slotsOcupados,
        Slots_Livres: resumo.slotsTotal - resumo.slotsOcupados,
        Slots_Bloqueados: resumo.slotsBloqueados,
        Slots_Total: resumo.slotsTotal,
        Ocupacao_percent: pctVal(resumo.pct),
        Blocos_Preenchidos: blocosPreenchidos,
        Blocos_Livres: blocosTotal - blocosPreenchidos,
        Blocos_Total: blocosTotal,
        Ocupacao_Real_percent: pctVal(blocosTotal > 0 ? blocosPreenchidos / blocosTotal : null),
        Inconsistencias: resumo.inconsistencias,
      }
    }).sort((a, b) => {
      const cmpUnidade = a.Unidade.localeCompare(b.Unidade)
      if (cmpUnidade !== 0) return cmpUnidade
      const na = parseInt(a.Numero_Sala, 10), nb = parseInt(b.Numero_Sala, 10)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      return a.Numero_Sala.localeCompare(b.Numero_Sala)
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unidRows),      'Ocupacao por unidade')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unidTurnoRows), 'Ocupacao por unidade e turno')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salaRows),      'Ocupacao por sala')

    const nome = `Ocupacao_Salas_${getRefWeek().label.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '')}.xlsx`
    XLSX.writeFile(wb, nome)
  }, [resumoUnidades, salasComOcupacao])

  useEffect(() => {
    setRightContent(
      <button type="button" onClick={exportarXLSX} disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 active:scale-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <Download size={13} />
        Exportar XLSX
      </button>,
    )
    return () => setRightContent(null)
  }, [exportarXLSX, loading, setRightContent])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando dados de unidades...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  const capacidadeTotal = resumoUnidades.reduce((s, r) => s + r.capacidadeSimultanea, 0)
  const salasTotal = resumoUnidades.reduce((s, r) => s + r.salasTotal, 0)
  const slotsTotal = resumoUnidades.reduce((s, r) => s + r.slotsTotal, 0)
  const slotsOcupados = resumoUnidades.reduce((s, r) => s + r.slotsOcupados, 0)
  const pctGeral = slotsTotal > 0 ? slotsOcupados / slotsTotal : null

  const blocosTotalGeral = resumoUnidades.reduce((s, r) => s + r.blocosTotal, 0)
  const blocosPreenchidosGeral = resumoUnidades.reduce((s, r) => s + r.blocosPreenchidos, 0)
  const pctGeralGranular = blocosTotalGeral > 0 ? blocosPreenchidosGeral / blocosTotalGeral : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<Building2 size={15} />} label="Unidades">
          <div className="text-2xl font-black text-foreground">{resumoUnidades.length}</div>
        </StatCard>
        <StatCard tone="blue" icon={<DoorOpen size={15} />} label="Salas cadastradas">
          <div className="text-2xl font-black text-foreground">{salasTotal}</div>
        </StatCard>
        <StatCard
          tone="purple"
          icon={<DoorOpen size={15} />}
          label={
            <span className="inline-flex items-center">
              Capacidade simultânea
              <InfoTooltip text="Quantos atendimentos podem acontecer ao mesmo tempo, no mesmo horário, somando todas as salas operacionais: salas Único contam 1, Duplo contam 2, Múltiplo contam 3. Salas bloqueadas ou administrativas não entram na conta." />
            </span>
          }
        >
          <div className="text-2xl font-black text-foreground">{capacidadeTotal}</div>
        </StatCard>
        <StatCard
          tone={pctTone(pctGeral)}
          icon={<Percent size={15} />}
          label={
            <span className="inline-flex items-center">
              Salas que contém profissional
              <InfoTooltip text={`${slotsOcupados} slots ocupados ÷ ${slotsTotal} slots totais = ${pctGeral !== null ? Math.round(pctGeral * 100) : 0}%.`} />
            </span>
          }
        >
          <div className="text-2xl font-black text-foreground">{pctGeral !== null ? `${Math.round(pctGeral * 100)}%` : "—"}</div>
        </StatCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {resumoUnidades.map(r => (
          <div key={r.unidade} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center font-bold text-foreground">
                {r.unidade}
                <InfoTooltip text={`${r.slotsOcupados} slots ocupados ÷ ${r.slotsTotal} slots totais = ${r.pct !== null ? Math.round(r.pct * 100) : 0}%.`} />
              </div>
              <StatusPill tone={pctTone(r.pct)}>{r.pct !== null ? `${Math.round(r.pct * 100)}%` : "Sem base"}</StatusPill>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground sm:grid-cols-6">
              <div><span className="block text-sm font-bold text-foreground">{r.salasTotal}</span>Salas</div>
              <div><span className="block text-sm font-bold text-foreground">{r.salasAtivas}</span>Operacionais</div>
              <div><span className="block text-sm font-bold text-foreground">{r.salasAdm}</span>Administrativas</div>
              <div><span className="block text-sm font-bold text-foreground">{r.salasBloqueadas}</span>Bloqueadas</div>
              <div><span className="block text-sm font-bold text-foreground">{r.salasNti}</span>NTI</div>
              <div className="inline-flex items-start gap-0.5">
                <div><span className="block text-sm font-bold text-foreground">{r.inconsistencias}</span>Inconsistências</div>
                <InfoTooltip text={`${r.inconsistencias} slot(s) com mais profissionais alocados do que a capacidade da sala (1, 2 ou 3, conforme Único/Duplo/Múltiplo).`} />
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              {(["unico", "duplo", "multiplo"] as const).map(cap => (
                <div key={cap}>
                  <span className="font-bold text-foreground">{r.salasPorCapacidade[cap]}</span> {CAPACIDADE_LABEL_CURTO[cap]}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3 text-xs">
              {r.porTurno.map(t => (
                <div
                  key={t.turno}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPedido({ unidade: r.unidade, turno: t.turno, tipo: "slot" })}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setPedido({ unidade: r.unidade, turno: t.turno, tipo: "slot" }) }}
                  className="flex-1 cursor-pointer rounded-lg bg-muted/40 p-2 transition-colors hover:bg-muted/70"
                >
                  <div className="inline-flex items-center font-semibold text-foreground">
                    {t.turno}
                    <InfoTooltip text={`${t.slotsOcupados} slots ocupados ÷ ${t.slotsTotal} slots totais = ${t.pct !== null ? Math.round(t.pct * 100) : 0}%. Clique pra ver o detalhe.`} />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-muted-foreground">{t.slotsOcupados}/{t.slotsTotal} ocupados</div>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">Ver detalhes ›</span>
                  </div>
                </div>
              ))}
            </div>
            {r.porTerapia.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Terapias mais frequentes</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.porTerapia.slice(0, 5).map(t => (
                    <span key={t.terapia} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                      {t.terapia} · {t.sessoes}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2">
        <div className="mb-1 inline-flex items-center text-sm font-bold text-foreground">
          Ocupação Real (por sessão)
          <InfoTooltip text="Mesmos dados, cálculo diferente: em vez de tratar cada slot sala/dia/turno como ocupado/livre (tudo ou nada), aqui cada vaga simultânea da sala (1/2/3 conforme Único/Duplo/Múltiplo) é uma cadeira própria com 6 blocos de 40min na Manhã e 7 na Tarde. Uma cadeira vazia entra como 0 preenchido, e um profissional alocado só conta suas sessões reais daquele bloco — não a cadeira inteira. Por isso este % tende a ser MENOR que o do Dashboard acima." />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Ocupação agregada por unidade, ponderada pelas sessões reais em cada vaga — não só se a sala tem alguém alocado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<Building2 size={15} />} label="Unidades">
          <div className="text-2xl font-black text-foreground">{resumoUnidades.length}</div>
        </StatCard>
        <StatCard tone="blue" icon={<DoorOpen size={15} />} label="Salas cadastradas">
          <div className="text-2xl font-black text-foreground">{salasTotal}</div>
        </StatCard>
        <StatCard
          tone="purple"
          icon={<DoorOpen size={15} />}
          label={
            <span className="inline-flex items-center">
              Capacidade simultânea
              <InfoTooltip text="Quantos atendimentos podem acontecer ao mesmo tempo, no mesmo horário, somando todas as salas operacionais: salas Único contam 1, Duplo contam 2, Múltiplo contam 3. Salas bloqueadas ou administrativas não entram na conta." />
            </span>
          }
        >
          <div className="text-2xl font-black text-foreground">{capacidadeTotal}</div>
        </StatCard>
        <StatCard
          tone={pctTone(pctGeralGranular)}
          icon={<Percent size={15} />}
          label={
            <span className="inline-flex items-center">
              Ocupação real
              <InfoTooltip text={`${blocosPreenchidosGeral} blocos de 40min preenchidos ÷ ${blocosTotalGeral} blocos possíveis = ${pctGeralGranular !== null ? Math.round(pctGeralGranular * 100) : 0}%.`} />
            </span>
          }
        >
          <div className="text-2xl font-black text-foreground">{pctGeralGranular !== null ? `${Math.round(pctGeralGranular * 100)}%` : "—"}</div>
        </StatCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {resumoUnidades.map(r => (
          <div key={`${r.unidade}-granular`} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center font-bold text-foreground">
                {r.unidade}
                <InfoTooltip text={`${r.blocosPreenchidos} blocos de 40min preenchidos ÷ ${r.blocosTotal} blocos possíveis = ${r.pctGranular !== null ? Math.round(r.pctGranular * 100) : 0}%.`} />
              </div>
              <StatusPill tone={pctTone(r.pctGranular)}>{r.pctGranular !== null ? `${Math.round(r.pctGranular * 100)}%` : "Sem base"}</StatusPill>
            </div>
            <div className="mt-3 flex gap-3 text-xs">
              {r.porTurno.map(t => (
                <div
                  key={t.turno}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPedido({ unidade: r.unidade, turno: t.turno, tipo: "bloco" })}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setPedido({ unidade: r.unidade, turno: t.turno, tipo: "bloco" }) }}
                  className="flex-1 cursor-pointer rounded-lg bg-muted/40 p-2 transition-colors hover:bg-muted/70"
                >
                  <div className="inline-flex items-center font-semibold text-foreground">
                    {t.turno}
                    <InfoTooltip text={`${t.blocosPreenchidos} blocos de 40min preenchidos ÷ ${t.blocosTotal} blocos possíveis = ${t.pctGranular !== null ? Math.round(t.pctGranular * 100) : 0}%. Clique pra ver o detalhe.`} />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-muted-foreground">{t.blocosPreenchidos}/{t.blocosTotal} preenchidos</div>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">Ver detalhes ›</span>
                  </div>
                </div>
              ))}
            </div>
            {r.porTerapia.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Terapias mais frequentes</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.porTerapia.slice(0, 5).map(t => (
                    <span key={t.terapia} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                      {t.terapia} · {t.sessoes}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {detalhe && <OcupacaoDetalheModal detalhe={detalhe} onClose={() => setPedido(null)} />}
    </div>
  )
}
