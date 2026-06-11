"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  CalendarDays,
  Users,
  UserX,
  UserMinus,
  Stethoscope,
  Calendar,
  CalendarCheck,
} from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { useHeader } from "@/contexts/HeaderContext"
import KpiCard from "@/components/home/KpiCard"
import FluxoOperacionalCard from "@/components/home/FluxoOperacional"
import { buildSlotData, FluxoSlotPoint } from "@/components/home/FluxoOperacional/data"

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
          .from("vw_dashboard_kpis")
          .select("*")

        if (kpiError) {
          console.error("[KPI] Erro ao buscar vw_dashboard_kpis:", kpiError)
          setLoadingKpi(false)
          return
        }

        // Parse KPI data (view returns 2 rows: atendimentos + faltas)
        const atend: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
        const faltas: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }

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
          }
        }

        setAtendimentos(atend)
        setFaltasPaciente(faltas)

        // Placeholder para terapeutas e indisponíveis (pode ser adicionado à view depois)
        setTerapeutas({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setTerapeutasIndisponiveis({ realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 })
        setSlotData([])

      } catch (err) {
        console.error("[KPI] Erro geral:", err)
      }

      setLoadingKpi(false)
    }
    load()
  }, [hoje])

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!authChecked) return null

  return (
    <div className="space-y-2">

      {/* ── 1. Header com saudação + atalhos ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_-2px_rgba(0,0,0,0.08)] px-7 py-6">
        <div className="flex items-center justify-between gap-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 leading-tight">
              {greeting()}, {nomeUsuario}! 👋
            </h1>
            <p className="text-sm text-slate-400 mt-1 capitalize">
              {capitalize(formatDate())}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 px-4 py-2 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-medium text-emerald-700">Sistema operacional</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Todos os serviços funcionando normalmente.</span>
            </div>
          </div>

          <div className="shrink-0 grid grid-cols-2 gap-2">
            <ShortcutButton href="/central-pacientes"  icon={Users}         label="Controle de Pacientes"  iconBg="bg-teal-50"   iconColor="text-teal-600"   accentHex="#0d9488" />
            <ShortcutButton href="/central-terapeutas" icon={Stethoscope}   label="Controle de Terapeutas" iconBg="bg-blue-50"   iconColor="text-[#3A8FB7]" accentHex="#3A8FB7" />
            <ShortcutButton href="/agenda/pacientes"   icon={Calendar}      label="Agenda Paciente"        iconBg="bg-purple-50" iconColor="text-purple-600" accentHex="#9333ea" />
            <ShortcutButton href="/agenda/terapeutas"  icon={CalendarCheck} label="Agenda Terapeuta"       iconBg="bg-orange-50" iconColor="text-orange-500" accentHex="#f97316" />
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

// ─── ShortcutButton ───────────────────────────────────────────────────────────

function ShortcutButton({
  href,
  icon: Icon,
  label,
  iconBg,
  iconColor,
  accentHex,
}: {
  href: string
  icon: typeof Users
  label: string
  iconBg: string
  iconColor: string
  accentHex: string
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 ${iconBg} rounded-xl border shadow-[0_1px_4px_rgba(0,0,0,0.07),0_3px_10px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-150`}
      style={{ borderColor: `${accentHex}55` }}
    >
      <div className={`bg-white/80 ${iconColor} p-2 rounded-lg shrink-0 shadow-sm`} style={{ boxShadow: `0 1px 4px ${accentHex}25` }}>
        <Icon size={16} />
      </div>
      <span className="text-xs font-semibold text-slate-700 leading-tight whitespace-nowrap">{label}</span>
    </Link>
  )
}

