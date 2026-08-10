"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
  Users,
  UserX,
  UserMinus,
} from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { useHeader } from "@/contexts/HeaderContext"
import KpiCard from "@/components/home/KpiCard"
import FluxoOperacionalCard from "@/components/home/FluxoOperacional"
import { buildSlotData, FluxoSlotPoint } from "@/components/home/FluxoOperacional/data"
import PulsarHubCard from "@/components/dashboard/PulsarHubCard"

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnitCount {
  realengo: number | null
  fazendinha: number | null
  padreMiguel: number | null
  total: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ["Realengo", "Fazendinha", "Padre Miguel"] as const
type UnitName = (typeof UNITS)[number]

const UNIT_KEY: Record<UnitName, keyof Omit<UnitCount, "total">> = {
  Realengo: "realengo",
  Fazendinha: "fazendinha",
  "Padre Miguel": "padreMiguel",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate() {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}


function salaToUnitKey(salaNome: string | null): keyof Omit<UnitCount, "total"> | null {
  if (!salaNome) return null
  const lower = salaNome.toLowerCase()
  if (lower.includes("realengo")) return "realengo"
  if (lower.includes("fazendinha")) return "fazendinha"
  if (lower.includes("padre miguel")) return "padreMiguel"
  return null
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const supabase = getSupabaseClient()
  const router = useRouter()
  const { setHeader } = useHeader()

  useEffect(() => { setHeader("") }, [setHeader])

  const [nomeUsuario, setNomeUsuario] = useState("Usuário")
  const [atendimentos, setAtendimentos] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [terapeutas, setTerapeutas] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [faltasPaciente, setFaltasPaciente] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [terapeutasIndisponiveis, setTerapeutasIndisponiveis] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [slotData, setSlotData] = useState<FluxoSlotPoint[]>([])
  const [loadingKpi, setLoadingKpi] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  const hoje = todayISO()

  // Auth + user name
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nome")
        .eq("id", user.id)
        .single()

      setNomeUsuario(perfil?.nome?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Usuário")
      setAuthChecked(true)
    }
    init()
  }, [])

  // KPI: atendimentos via view otimizada
  useEffect(() => {
    async function load() {
      setLoadingKpi(true)

      try {
        const { data: kpiData, error: kpiError } = await supabase
          .rpc("get_dashboard_kpis")

        if (kpiError) {
          console.warn("[KPI] View não disponível, usando valores padrão:", kpiError?.message)
          setAtendimentos({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
          setFaltasPaciente({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
          setTerapeutas({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
          setTerapeutasIndisponiveis({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
          setSlotData([])
          setLoadingKpi(false)
          return
        }

        const atend: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
        const faltas: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
        const terapeutas: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
        const indisponiveis: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }

        for (const row of kpiData ?? []) {
          if (row.metric_type === 'kpi_atendimentos') {
            atend.realengo = row.realengo ?? 0
            atend.fazendinha = row.fazendinha ?? 0
            atend.padreMiguel = row.padreMiguel ?? 0
            atend.total = row.total ?? 0
          } else if (row.metric_type === 'kpi_faltas') {
            faltas.realengo = row.realengo ?? 0
            faltas.fazendinha = row.fazendinha ?? 0
            faltas.padreMiguel = row.padreMiguel ?? 0
            faltas.total = row.total ?? 0
          } else if (row.metric_type === 'kpi_terapeutas') {
            terapeutas.realengo = row.realengo ?? 0
            terapeutas.fazendinha = row.fazendinha ?? 0
            terapeutas.padreMiguel = row.padreMiguel ?? 0
            terapeutas.total = row.total ?? 0
          } else if (row.metric_type === 'kpi_terapeutas_indisponiveis') {
            indisponiveis.realengo = row.realengo ?? 0
            indisponiveis.fazendinha = row.fazendinha ?? 0
            indisponiveis.padreMiguel = row.padreMiguel ?? 0
            indisponiveis.total = row.total ?? 0
          }
        }

        setAtendimentos(atend)
        setFaltasPaciente(faltas)
        setTerapeutas(terapeutas)
        setTerapeutasIndisponiveis(indisponiveis)
        setSlotData([])

      } catch (err) {
        console.warn("[KPI] Erro ao carregar KPIs:", err)
        setAtendimentos({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setFaltasPaciente({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setTerapeutas({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setTerapeutasIndisponiveis({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setSlotData([])
      }

      setLoadingKpi(false)
    }
    load()
  }, [hoje])

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!authChecked) return null

  return (
    <div className="space-y-2">

      {/* ── 1. Header com saudação + Pulsar Connect ───────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_-2px_rgba(0,0,0,0.08)] px-7 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 leading-tight">
              {greeting()}, {nomeUsuario}! 👋
            </h1>
            <p className="text-sm text-slate-400 mt-1 capitalize">
              {capitalize(formatDate())}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-medium text-emerald-700">Sistema operacional</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Todos os serviços funcionando normalmente.</span>
            </div>
          </div>

          <div className="ml-auto w-full max-w-sm xl:w-62.5 xl:max-w-none">
            <PulsarHubCard />
          </div>
        </div>
      </div>

      {/* ── 2. KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <KpiCard
          title="Atendimentos Previstos Hoje"
          icon={CalendarDays}
          total={atendimentos.total}
          units={UNITS.map((u) => ({ label: u, value: atendimentos[UNIT_KEY[u]] }))}
          variant="blue"
        />
        <KpiCard
          title="Falta de Paciente"
          icon={UserX}
          total={faltasPaciente.total}
          units={UNITS.map((u) => ({ label: u, value: faltasPaciente[UNIT_KEY[u]] }))}
          variant="amber"
        />
        <KpiCard
          title="Terapeutas em Atendimento"
          icon={Users}
          total={terapeutas.total}
          units={UNITS.map((u) => ({ label: u, value: terapeutas[UNIT_KEY[u]] }))}
          variant="purple"
        />
        <KpiCard
          title="Terapeutas Indisponíveis"
          icon={UserMinus}
          total={terapeutasIndisponiveis.total}
          units={UNITS.map((u) => ({ label: u, value: terapeutasIndisponiveis[UNIT_KEY[u]] }))}
          variant="rose"
        />
      </div>

{/* ── 4. Fluxo Operacional do Dia ──────────────────────────────────── */}
      <FluxoOperacionalCard
        slotData={slotData}
        atendimentos={atendimentos}
        terapeutas={terapeutas}
        loading={loadingKpi}
      />

    </div>
  )
}


