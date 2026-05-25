"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
  Users,
  PlusCircle,
  Activity,
  FileText,
  ClipboardList,
  Wifi,
  Bot,
  ListChecks,
  RefreshCw,
} from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"
import KpiCard from "@/components/home/KpiCard"
import QuickActionCard from "@/components/home/QuickActionCard"
import FluxoOperacionalCard from "@/components/home/FluxoOperacional"
import { buildSlotData, FluxoSlotPoint } from "@/components/home/FluxoOperacional/data"
import RecentRecords, { RecentRecord } from "@/components/home/RecentRecords"

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


function formatDateTime() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const supabase = getSupabaseClient()
  const router = useRouter()

  const [nomeUsuario, setNomeUsuario] = useState("Usuário")
  const [atendimentos, setAtendimentos] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [terapeutas, setTerapeutas] = useState<UnitCount>({
    realengo: null, fazendinha: null, padreMiguel: null, total: null,
  })
  const [slotData, setSlotData] = useState<FluxoSlotPoint[]>([])
  const [loadingKpi, setLoadingKpi] = useState(true)
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [countProcessando, setCountProcessando] = useState(0)
  const [lastUpdate, setLastUpdate] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    setLastUpdate(formatDateTime())
  }, [])

  const hoje = todayISO()

  // Auth + user name
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }

      setAuthChecked(true)

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nome")
        .eq("id", user.id)
        .single()

      if (perfil?.nome) {
        setNomeUsuario(perfil.nome.split(" ")[0])
      } else {
        setNomeUsuario(user.email?.split("@")[0] ?? "Usuário")
      }
    }
    init()
  }, [])

  // KPI: atendimentos e terapeutas — mesma fonte da página solicitar
  useEffect(() => {
    async function load() {
      setLoadingKpi(true)

      const [
        { data: centralData, error: centralError },
        { data: blacklistData },
      ] = await Promise.all([
        supabase
          .from("vw_central_autorizacoes")
          .select("sala_nome, terapias, profissionais, horario")
          .eq("data_atendimento", hoje),
        supabase
          .from("config_regras_terapias")
          .select("terapia_nome")
          .eq("categoria", "blacklist_autorizacao")
          .eq("ativo", true),
      ])

      if (centralError) {
        console.error("[KPI] Erro ao buscar vw_central_autorizacoes:", centralError)
        setLoadingKpi(false)
        return
      }

      const blacklist = new Set((blacklistData ?? []).map((r) => r.terapia_nome))

      const atend: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
      const terap: UnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
      const seenTerapeutas = new Set<string>()
      const slotRows: { horario: string | null; sala_nome: string[] | null }[] = []

      for (const row of centralData ?? []) {
        const terapias: string[] = row.terapias ?? []
        if (terapias.some((t: string) => blacklist.has(t))) continue

        // Unidade a partir do array sala_nome
        const salas: string[] = row.sala_nome ?? []
        let uk: keyof Omit<UnitCount, "total"> | null = null
        for (const sala of salas) {
          uk = salaToUnitKey(sala)
          if (uk) break
        }

        if (uk) atend[uk] = (atend[uk] ?? 0) + 1
        atend.total = (atend.total ?? 0) + 1

        if (uk) {
          const profissionais: string[] = row.profissionais ?? []
          for (const prof of profissionais) {
            const key = `${prof}-${uk}`
            if (seenTerapeutas.has(key)) continue
            seenTerapeutas.add(key)
            terap[uk] = (terap[uk] ?? 0) + 1
            terap.total = (terap.total ?? 0) + 1
          }
        }

        slotRows.push({ horario: row.horario ?? null, sala_nome: row.sala_nome ?? null })
      }

      setAtendimentos(atend)
      setTerapeutas(terap)
      setSlotData(buildSlotData(slotRows, blacklist, salaToUnitKey))
      setLoadingKpi(false)
    }
    load()
  }, [hoje])

  // Recent records + chart + fila count
  useEffect(() => {
    async function load() {
      setLoadingRecords(true)

      const [{ data }, { count: cp }] = await Promise.all([
        supabase
          .from("fila_autorizacoes")
          .select("id, paciente_nome, status, created_at, unidade")
          .eq("data_atendimento", hoje)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("fila_autorizacoes")
          .select("*", { count: "exact", head: true })
          .eq("status", "processando"),
      ])

      if (data) {
        setRecentRecords(data.slice(0, 4) as RecentRecord[])
      }
      setCountProcessando(cp ?? 0)
      setLoadingRecords(false)
    }
    load()
  }, [hoje])

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!authChecked) return null

  return (
    <div className="space-y-6">

      {/* ── 1. Header com saudação + ilustração ──────────────────────────── */}
      <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden px-7 py-6">
        <div className="max-w-[55%]">
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">
            {greeting()}, {nomeUsuario}! 👋
          </h1>
          <p className="text-sm text-slate-400 mt-1 capitalize">
            {capitalize(formatDate())}
          </p>

          {/* Status pill */}
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

      </div>

      {/* ── 2. KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          title="Atendimentos Previstos Hoje"
          icon={CalendarDays}
          total={atendimentos.total}
          units={UNITS.map((u) => ({ label: u, value: atendimentos[UNIT_KEY[u]] }))}
          variant="blue"
        />
        <KpiCard
          title="Terapeutas em Atendimento"
          icon={Users}
          total={terapeutas.total}
          units={UNITS.map((u) => ({ label: u, value: terapeutas[UNIT_KEY[u]] }))}
          variant="purple"
        />
      </div>

      {/* ── 3. Ações rápidas ──────────────────────────────────────────────── */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Ações rápidas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickActionCard
            label="Nova Solicitação"
            description="Iniciar uma nova solicitação"
            icon={PlusCircle}
            href="/solicitar"
            iconBg="bg-blue-50"
            iconColor="text-[#3A8FB7]"
            borderColor="border-blue-100"
          />
          <QuickActionCard
            label="Pacientes"
            description="Buscar ou cadastrar"
            icon={Activity}
            href="/central-pacientes"
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            borderColor="border-teal-100"
          />
          <QuickActionCard
            label="Guias Digitais"
            description="Emitir ou consultar guias"
            icon={FileText}
            href="/guias-digitais"
            iconBg="bg-orange-50"
            iconColor="text-orange-500"
            borderColor="border-orange-100"
          />
          <QuickActionCard
            label="Auditoria ASSIM"
            description="Acessar auditorias"
            icon={ClipboardList}
            href="/auditoria-assim"
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            borderColor="border-purple-100"
          />
        </div>
      </div>

      {/* ── 4 + 5. Gráfico + Últimos registros ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Fluxo Operacional do Dia */}
        <div className="lg:col-span-2">
          <FluxoOperacionalCard
            slotData={slotData}
            atendimentos={atendimentos}
            terapeutas={terapeutas}
            loading={loadingKpi}
          />
        </div>

        {/* Últimos registros */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-800">Últimos registros</p>
            <button
              onClick={() => router.push("/autorizacoes")}
              className="text-xs text-[#3A8FB7] hover:underline"
            >
              Ver todos
            </button>
          </div>
          <RecentRecords records={recentRecords} loading={loadingRecords} />
        </div>

      </div>

      {/* ── 6. Barra de status inferior ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusItem
          icon={Wifi}
          label="Integração ASSIM"
          value="Online"
          dot="emerald"
        />
        <StatusItem
          icon={Bot}
          label="Robôs de Processamento"
          value="Ativos"
          dot="emerald"
        />
        <StatusItem
          icon={ListChecks}
          label="Fila de Processos"
          value={`${countProcessando} em andamento`}
          dot={countProcessando > 0 ? "blue" : "slate"}
        />
        <StatusItem
          icon={RefreshCw}
          label="Última atualização"
          value={lastUpdate}
        />
      </div>

    </div>
  )
}

// ─── StatusItem ───────────────────────────────────────────────────────────────

function StatusItem({
  icon: Icon,
  label,
  value,
  dot,
}: {
  icon: typeof Wifi
  label: string
  value: string
  dot?: "emerald" | "blue" | "slate"
}) {
  const dotColor = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    slate: "bg-slate-400",
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="text-slate-400 shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 truncate">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {dot && (
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[dot]}`} />
          )}
          <p className="text-xs font-semibold text-slate-700 truncate">{value}</p>
        </div>
      </div>
    </div>
  )
}
