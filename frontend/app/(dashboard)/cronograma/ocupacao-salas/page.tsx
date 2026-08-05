"use client"

import { useEffect, useMemo, useState } from "react"
import { DoorOpen, Eye, Loader2, Plus, Settings2 } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { SegmentedTabs } from "@/components/cronograma/ui/SegmentedTabs"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { resumoOcupacaoDeItens } from "@/lib/cronograma/salas"
import { SalasFiltros, SALAS_FILTROS_VAZIO, aplicarFiltrosSala, salaTemProfissional, type SalasFiltrosState } from "@/components/cronograma/salas/SalasFiltros"
import { SalasGridView } from "@/components/cronograma/salas/SalasGridView"
import { SalasHeatmapView } from "@/components/cronograma/salas/SalasHeatmapView"
import { RegularizacoesView } from "@/components/cronograma/salas/RegularizacoesView"
import { SalaEditModal } from "@/components/cronograma/salas/SalaEditModal"
import { GerenciarCategoriasModal } from "@/components/cronograma/salas/GerenciarCategoriasModal"
import type { Sala, SlotOcupacaoSala } from "@/lib/cronograma/salasTypes"

type ViewTab = "grade" | "mapa" | "regularizacoes"

export default function OcupacaoSalasPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Ocupação de Salas", "Cadastro estrutural de salas cruzado com a agenda real")
    return () => setHeader("", "")
  }, [setHeader])

  const { salas, alocacoes, linhas, salasComOcupacao, loading, error, recarregarSalas, recarregarAlocacoes, encontrarAlocacaoDoProfissional } = useOcupacaoSalas()

  const [tab, setTab] = useState<ViewTab>("grade")
  const [filtros, setFiltros] = useState<SalasFiltrosState>(SALAS_FILTROS_VAZIO)
  const [editando, setEditando] = useState<Sala | null | "novo">(null)
  const [isolada, setIsolada] = useState<{ id: string; nome: string } | null>(null)
  const [gerenciandoCategorias, setGerenciandoCategorias] = useState(false)

  const unidades = useMemo(() => [...new Set(salasComOcupacao.map(s => s.sala.unidade_nome))].sort(), [salasComOcupacao])
  const nucleos = useMemo(() => [...new Set(salasComOcupacao.map(s => s.sala.nucleo).filter((n): n is string => !!n))].sort(), [salasComOcupacao])
  const andares = useMemo(() => [...new Set(salasComOcupacao.map(s => s.sala.andar).filter((n): n is string => !!n))].sort(), [salasComOcupacao])

  function alternarIsolarSala(salaId: string, nome: string) {
    setIsolada(prev => (prev?.id === salaId ? null : { id: salaId, nome }))
  }

  const filtradas = useMemo(() => {
    return salasComOcupacao
      .filter(item => (isolada ? item.sala.id === isolada.id : true))
      .filter(item => aplicarFiltrosSala(filtros, item.sala) && salaTemProfissional(item, filtros.profissional))
      .map(item => {
        let slots = item.slots
        if (filtros.turno.length) slots = slots.filter((s: SlotOcupacaoSala) => filtros.turno.includes(s.turno))
        if (filtros.semSessao) slots = slots.filter((s: SlotOcupacaoSala) => s.alocacoes.some(a => a.semCruzamentoCsv))
        return { ...item, slots }
      })
      .filter(item => !filtros.semSessao || item.slots.length > 0)
  }, [salasComOcupacao, filtros, isolada])

  // Os 4 cards respondem aos filtros atuais (unidade/núcleo/andar/capacidade/
  // turno/status/profissional/isolada) — calculados sobre `filtradas`, a mesma
  // lista que já alimenta a Grade e o Mapa de calor. Antes usavam
  // salasComOcupacao/resumoUnidades (agregado de TODAS as unidades, sem
  // nenhuma relação com o filtro selecionado na tela).
  const totalSalas = filtradas.length
  const totalBloqueadas = filtradas.filter(s => s.sala.status === "bloqueada").length
  const resumoFiltrado = useMemo(() => resumoOcupacaoDeItens(filtradas), [filtradas])
  const totalInconsistencias = resumoFiltrado.inconsistencias
  const pctGeral = resumoFiltrado.pct

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<DoorOpen size={15} />} label="Salas cadastradas">
          <div className="text-2xl font-black text-foreground">{totalSalas}</div>
        </StatCard>
        <StatCard tone="blue" icon={<DoorOpen size={15} />} label="Ocupação da semana">
          <div className="text-2xl font-black text-foreground">{pctGeral !== null ? `${Math.round(pctGeral * 100)}%` : "—"}</div>
        </StatCard>
        <StatCard tone="red" icon={<DoorOpen size={15} />} label="Salas bloqueadas">
          <div className="text-2xl font-black text-foreground">{totalBloqueadas}</div>
        </StatCard>
        <StatCard tone="amber" icon={<DoorOpen size={15} />} label="Turnos sobreocupados">
          <div className="text-2xl font-black text-foreground">{totalInconsistencias}</div>
        </StatCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          ariaLabel="Visão de ocupação de salas"
          tabs={[
            { value: "grade", label: "Grade" },
            { value: "mapa", label: "Mapa de calor" },
            { value: "regularizacoes", label: "Regularizações" },
          ]}
        />
        <div className="flex items-center gap-3">
          {isolada && (
            <button
              type="button"
              onClick={() => setIsolada(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50"
            >
              <Eye size={13} /> Mostrando só <strong className="font-semibold text-foreground">{isolada.nome}</strong> · voltar para todas
            </button>
          )}
          <button
            type="button"
            onClick={() => setGerenciandoCategorias(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            <Settings2 size={14} /> Gerenciar categorias
          </button>
          <button
            type="button"
            onClick={() => setEditando("novo")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            <Plus size={14} /> Nova sala
          </button>
        </div>
      </div>

      {tab !== "regularizacoes" && (
        <SalasFiltros value={filtros} onChange={setFiltros} unidades={unidades} nucleos={nucleos} andares={andares} />
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando salas e agenda...
        </div>
      )}
      {error && <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {!loading && !error && tab === "grade" && (
        <SalasGridView
          salas={filtradas}
          onEditarSala={id => setEditando(salasComOcupacao.find(s => s.sala.id === id)?.sala ?? null)}
          onIsolarSala={alternarIsolarSala}
          salaIsoladaId={isolada?.id ?? null}
          encontrarAlocacaoDoProfissional={encontrarAlocacaoDoProfissional}
          onRecarregar={recarregarAlocacoes}
          buscaProfissional={filtros.profissional}
        />
      )}
      {!loading && !error && tab === "mapa" && (
        <SalasHeatmapView salas={filtradas} onIsolarSala={alternarIsolarSala} salaIsoladaId={isolada?.id ?? null} />
      )}
      {!loading && !error && tab === "regularizacoes" && (
        <RegularizacoesView
          alocacoes={alocacoes}
          linhas={linhas}
          onVerNaGrade={nome => {
            setFiltros(f => ({ ...f, profissional: nome }))
            setTab("grade")
          }}
        />
      )}

      {editando && (
        <SalaEditModal
          sala={editando === "novo" ? null : editando}
          todasSalas={salas}
          onClose={() => setEditando(null)}
          onSaved={recarregarSalas}
        />
      )}

      {gerenciandoCategorias && (
        <GerenciarCategoriasModal
          onClose={() => setGerenciandoCategorias(false)}
          onChanged={recarregarSalas}
        />
      )}
    </div>
  )
}
