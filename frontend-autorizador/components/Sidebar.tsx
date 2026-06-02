"use client"

import {
  LayoutDashboard,
  PlusCircle,
  Users,
  Activity,
  FileText,
  ShieldCheck,
  ClipboardList,
  CalendarDays,
  UserRound,
  Building2,
  Stethoscope,
  BriefcaseBusiness,
  Star,
  KeyRound,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"
import { getFunctionHeaders, getFunctionUrl } from "@/lib/supabase/functions"
import toast from "react-hot-toast"
import ModalPerfil from "@/components/perfil/ModalPerfil"
import ModalAlterarSenha from "@/components/perfil/ModalAlterarSenha"
import ModalErros from "@/components/perfil/ModalErros"
import { SidebarGroup } from "@/components/sidebar/SidebarGroup"

type Favorito = { label: string; path: string }

const pathIconMap: Record<string, any> = {
  "/": LayoutDashboard,
  "/solicitar": PlusCircle,
  "/central-pacientes": Activity,
  "/central-terapeutas": UserRound,
  "/agenda/pacientes": CalendarDays,
  "/agenda/terapeutas": CalendarDays,
  "/agenda/salas": Building2,
  "/guias-digitais": FileText,
  "/auditoria-assim": ClipboardList,
  "/admin": ShieldCheck,
  "/admin/permissoes": KeyRound,
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = getSupabaseClient()
  const [loadingLogout, setLoadingLogout] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState(true)
  const [nome, setNome] = useState("Usuário")
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [machineId, setMachineId] = useState<string | null>(null)
  const [automacaoAtiva, setAutomacaoAtiva] = useState(true)
  const [countProcessando, setCountProcessando] = useState(0)
  const [countErros, setCountErros] = useState(0)
  const [loadingPausar, setLoadingPausar] = useState(false)
  const [loadingRetomar, setLoadingRetomar] = useState(false)
  const [loadingReiniciar, setLoadingReiniciar] = useState(false)
  const [loadingLiberar, setLoadingLiberar] = useState(false)
  const [modalPerfil, setModalPerfil] = useState(false)
  const [modalSenha, setModalSenha] = useState(false)
  const [modalErros, setModalErros] = useState(false)
  const [favoritos, setFavoritos] = useState<Favorito[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar_favoritos")
      if (stored) setFavoritos(JSON.parse(stored))
    } catch {}
  }, [])

  function toggleFavorito(label: string, path: string) {
    setFavoritos(prev => {
      const next = prev.some(f => f.path === path)
        ? prev.filter(f => f.path !== path)
        : [...prev, { label, path }]
      localStorage.setItem("sidebar_favoritos", JSON.stringify(next))
      return next
    })
  }

  function isActive(path: string) {
    const current = pathname.replace(/\/$/, "") || "/"
    return current === path
  }

  async function handleLogout() {
    setLoadingLogout(true)
    await supabase.auth.signOut()
    router.replace("/login")
  }

  const permissions = {
    admin: [
      "/",
      "/solicitar",
      "/central-pacientes",
      "/central-terapeutas",
      "/agenda/pacientes",
      "/agenda/terapeutas",
      "/agenda/salas",
      "/guias-digitais",
      "/financeiro",
      "/admin",
      "/admin/permissoes",
      "/auditoria-assim",
    ],
    diretoria: [
      "/",
      "/solicitar",
      "/central-pacientes",
      "/central-terapeutas",
      "/agenda/pacientes",
      "/agenda/terapeutas",
      "/agenda/salas",
      "/guias-digitais",
      "/financeiro",
      "/auditoria-assim",
    ],
    recepcao: [
      "/",
      "/solicitar",
      "/central-pacientes",
      "/agenda/pacientes",
      "/auditoria-assim",
    ],
    autorizacao: [
      "/",
      "/agenda/pacientes",
      "/agenda/terapeutas",
      "/agenda/salas",
      "/auditoria-assim",
    ],
    terapeutico: [
      "/",
      "/central-terapeutas",
      "/agenda/salas",
      "/agenda/terapeutas",
    ],
    faturamento: [
      "/",
      "/guias-digitais",
      "/agenda/pacientes",
      "/agenda/terapeutas",
      "/agenda/salas",
    ],
    rp: [
      "/",
      "/central-terapeutas",
    ],
  }

  const allowedPaths =
    permissions[role as keyof typeof permissions] || []

  function canAccess(path: string) {
    return allowedPaths.includes(path)
  }

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingRole(false); return }
      const { data } = await supabase
        .from("usuarios")
        .select("role")
        .eq("id", user.id)
        .single()
      setRole(data?.role || null)
      setLoadingRole(false)
    }
    loadRole()
  }, [])

  useEffect(() => {
    async function checkUser() {
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError || !data.user) return
      const uid = data.user.id
      setUserId(uid)
      setEmail(data.user.email ?? "")
      const { data: maquina, error } = await supabase
        .from("maquinas")
        .select("id, nome, ativa, user_id")
        .eq("user_id", uid)
        .maybeSingle()
      if (error) console.error("Erro ao carregar dados da máquina:", error.message)
      if (maquina) {
        setMachineId(maquina.id)
        setAutomacaoAtiva(maquina.ativa ?? true)
      }
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nome")
        .eq("id", uid)
        .single()
      if (perfil?.nome) {
        setNome(perfil.nome.split(" ")[0])
      } else {
        setNome(data.user.email?.split("@")[0] || "Usuário")
      }
    }
    checkUser()
  }, [])

  useEffect(() => {
    async function fetchCounts() {
      const [{ count: cp }, { count: ce }] = await Promise.all([
        supabase.from("fila_autorizacoes").select("*", { count: "exact", head: true }).eq("status", "processando"),
        supabase.from("fila_autorizacoes").select("*", { count: "exact", head: true }).eq("status", "erro"),
      ])
      setCountProcessando(cp ?? 0)
      setCountErros(ce ?? 0)
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handlePausar() {
    if (!machineId) { toast.error("Máquina não identificada"); return }
    setLoadingPausar(true)
    try {
      const res = await fetch(getFunctionUrl("automation-pause"), {
        method: "POST",
        headers: await getFunctionHeaders(),
        body: JSON.stringify({ machineId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setAutomacaoAtiva(false)
      toast.success("Automação pausada")
    } catch (err: any) { toast.error(err.message) }
    setLoadingPausar(false)
  }

  async function handleRetomar() {
    if (!machineId) { toast.error("Máquina não identificada"); return }
    setLoadingRetomar(true)
    try {
      const res = await fetch(getFunctionUrl("automation-resume"), {
        method: "POST",
        headers: await getFunctionHeaders(),
        body: JSON.stringify({ machineId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setAutomacaoAtiva(true)
      toast.success("Automação retomada")
    } catch (err: any) { toast.error(err.message) }
    setLoadingRetomar(false)
  }

  async function handleReiniciar() {
    if (!machineId) { toast.error("Máquina não identificada"); return }
    setLoadingReiniciar(true)
    try {
      const res = await fetch(getFunctionUrl("automation-restart"), {
        method: "POST",
        headers: await getFunctionHeaders(),
        body: JSON.stringify({ machineId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Worker reiniciado")
    } catch (err: any) { toast.error("Falha ao reiniciar: " + err.message) }
    setLoadingReiniciar(false)
  }

  async function handleLiberarTravados() {
    setLoadingLiberar(true)
    try {
      const res = await fetch(getFunctionUrl("automation-release-stuck"), {
        method: "POST",
        headers: await getFunctionHeaders(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${json.liberados} processo${json.liberados !== 1 ? "s" : ""} liberado${json.liberados !== 1 ? "s" : ""}`)
    } catch (err: any) { toast.error(err.message) }
    setLoadingLiberar(false)
  }

  function MenuItem({
    label,
    icon: Icon,
    path,
  }: {
    label: string
    icon: any
    path: string
  }) {
    const active = isActive(path)
    const isFav = favoritos.some(f => f.path === path)

    return (
      <button
        onClick={() => router.push(path)}
        className={`group flex w-full items-center gap-2.5 py-2 pr-2 rounded-lg text-sm transition-all duration-150
        ${
          active
            ? "border-l-2 border-[#3A8FB7] pl-2.5 font-semibold"
            : "border-l-2 border-transparent pl-2.5 hover:bg-white/5"
        }`}
        style={active ? { backgroundColor: "rgba(58,143,183,0.22)", color: "#e8f5fc" } : { color: "#b0c8e0" }}
      >
        <Icon
          size={16}
          className="shrink-0"
          style={{ color: active ? "#5BAFD4" : "#7a9ab8" }}
        />
        <span className="flex-1 text-left">{label}</span>
        {path !== "/" && (
          <span
            onClick={e => { e.stopPropagation(); toggleFavorito(label, path) }}
            className={`p-1 rounded transition-all duration-150 hover:bg-white/10
              ${isFav
                ? "opacity-100 text-yellow-400"
                : "opacity-0 group-hover:opacity-100 text-slate-600 hover:text-yellow-400"
              }`}
          >
            <Star size={12} fill={isFav ? "currentColor" : "none"} />
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <aside className="fixed top-0 left-0 w-64 h-screen flex flex-col z-50"
        style={{ background: "linear-gradient(180deg, #0e1c2e 0%, #0a1620 100%)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* LOGO */}
        <div className="h-20 flex items-center justify-center px-6"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <img src="/logo-universo-aba.png" className="h-20 object-contain" />
        </div>

        {/* MENU */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>

          {/* Dashboard */}
          <MenuItem label="Dashboard" icon={LayoutDashboard} path="/" />

          {/* Favoritos */}
          <div className="pt-2">
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider select-none" style={{ color: "#6b8ba8" }}>
              ⭐ Favoritos
            </p>
            {favoritos
              .filter(f => canAccess(f.path))
              .map(f => (
                <MenuItem key={f.path} label={f.label} icon={pathIconMap[f.path] ?? Star} path={f.path} />
              ))}
          </div>

          <hr className="my-2" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

          {/* Pacientes */}
          {(canAccess("/solicitar") || canAccess("/central-pacientes") || canAccess("/agenda/pacientes")) && (
            <SidebarGroup title="Pacientes" icon={Users}>
              {canAccess("/solicitar") && (
                <MenuItem label="Atendimentos" icon={PlusCircle} path="/solicitar" />
              )}
              {canAccess("/central-pacientes") && (
                <MenuItem label="Gestão" icon={Activity} path="/central-pacientes" />
              )}
              {canAccess("/agenda/pacientes") && (
                <MenuItem label="Cronograma" icon={CalendarDays} path="/agenda/pacientes" />
              )}
            </SidebarGroup>
          )}

          {/* Terapêutico */}
          {(canAccess("/central-terapeutas") || canAccess("/agenda/terapeutas") || canAccess("/agenda/salas")) && (
            <SidebarGroup title="Terapêutico" icon={Stethoscope}>
              {canAccess("/central-terapeutas") && (
                <MenuItem label="Gestão" icon={UserRound} path="/central-terapeutas" />
              )}
              {canAccess("/agenda/terapeutas") && (
                <MenuItem label="Agenda Terapêutica" icon={CalendarDays} path="/agenda/terapeutas" />
              )}
              {canAccess("/agenda/salas") && (
                <MenuItem label="Salas" icon={Building2} path="/agenda/salas" />
              )}
            </SidebarGroup>
          )}

          {/* Operações */}
          {(canAccess("/auditoria-assim") || canAccess("/guias-digitais")) && (
            <SidebarGroup title="Operações" icon={BriefcaseBusiness}>
              {canAccess("/auditoria-assim") && (
                <MenuItem label="Auditoria ASSIM" icon={ClipboardList} path="/auditoria-assim" />
              )}
              {canAccess("/guias-digitais") && (
                <MenuItem label="Guias Digitais" icon={FileText} path="/guias-digitais" />
              )}
            </SidebarGroup>
          )}

          {/* Administração */}
          {canAccess("/admin") && (
            <SidebarGroup title="Administração" icon={ShieldCheck}>
              <MenuItem label="Usuários" icon={Users} path="/admin" />
              {canAccess("/admin/permissoes") && (
                <MenuItem label="Permissões" icon={KeyRound} path="/admin/permissoes" />
              )}
            </SidebarGroup>
          )}


        </nav>

        {/* FOOTER — PERFIL */}
        <div className="p-4" ref={menuRef} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative">

            <button
              onClick={() => setOpen(!open)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-[#3A8FB7] text-white flex items-center justify-center font-semibold text-sm shrink-0">
                {nome?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate leading-tight">{nome}</p>
                {role && (
                  <p className="text-xs text-slate-500 capitalize leading-tight">
                    {{
                      admin: "Administrador",
                      diretoria: "Diretoria",
                      recepcao: "Recepção",
                      autorizacao: "Autorização",
                      terapeutico: "Terapêutico",
                      faturamento: "Faturamento",
                      rp: "RP — Remuneração e Pagamentos",
                    }[role] ?? role}
                  </p>
                )}
              </div>
              <span className={`text-slate-600 text-xs transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {open && (
              <div className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.2)] p-3 text-sm z-999 bg-linear-to-br from-[#1f3f5b] to-[#2f6f95] text-white">

                <div className="px-3 pb-3">
                  <div className="text-sm font-semibold">{nome}</div>
                  <div className="text-xs text-white/60">{email || "—"}</div>
                </div>

                <div className="border-t border-white/10 my-2" />

                <div className="px-3 text-xs text-white/50 mb-1">Conta</div>

                <button
                  onClick={() => { setOpen(false); setModalPerfil(true) }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition"
                >
                  Meu perfil
                </button>

                <button
                  onClick={() => { setOpen(false); setModalSenha(true) }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition"
                >
                  Alterar senha
                </button>

                <div className="border-t border-white/10 my-2" />

                <div className="px-3 text-xs text-white/50 mb-1 flex justify-between items-center">
                  <span>Automação</span>
                  <span className={`flex items-center gap-2 font-medium ${automacaoAtiva ? "text-green-300" : "text-orange-300"}`}>
                    <span className={`w-2 h-2 rounded-full ${automacaoAtiva ? "bg-green-400" : "bg-orange-400"}`} />
                    {automacaoAtiva ? "Ativa" : "Pausada"}
                  </span>
                </div>

                {automacaoAtiva ? (
                  <button
                    onClick={handlePausar}
                    disabled={loadingPausar}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition disabled:opacity-50"
                  >
                    {loadingPausar ? "Pausando..." : "Pausar automação"}
                  </button>
                ) : (
                  <button
                    onClick={handleRetomar}
                    disabled={loadingRetomar}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition disabled:opacity-50"
                  >
                    {loadingRetomar ? "Retomando..." : "Retomar automação"}
                  </button>
                )}

                <button
                  onClick={handleReiniciar}
                  disabled={loadingReiniciar}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition disabled:opacity-50"
                >
                  {loadingReiniciar ? "Reiniciando..." : "Reiniciar worker"}
                </button>

                <button
                  onClick={handleLiberarTravados}
                  disabled={loadingLiberar}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition disabled:opacity-50"
                >
                  {loadingLiberar ? "Liberando..." : "Liberar processos travados"}
                </button>

                <div className="border-t border-white/10 my-2" />

                <div className="px-3 py-2 text-xs flex justify-between text-white/70">
                  <span>{countProcessando} em processamento</span>
                  {countErros > 0 ? (
                    <button
                      onClick={() => { setOpen(false); setModalErros(true) }}
                      className="text-red-300 font-medium hover:text-red-200 transition"
                    >
                      {countErros} erro{countErros !== 1 ? "s" : ""}
                    </button>
                  ) : (
                    <span className="text-white/40">0 erros</span>
                  )}
                </div>

                <div className="border-t border-white/10 my-2" />

                <button
                  onClick={handleLogout}
                  disabled={loadingLogout}
                  className="w-full text-left px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/30 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingLogout ? "Saindo..." : "Sair"}
                </button>

              </div>
            )}

          </div>
        </div>

      </aside>

      {userId && (
        <>
          <ModalPerfil open={modalPerfil} onClose={() => setModalPerfil(false)} userId={userId} />
          <ModalAlterarSenha open={modalSenha} onClose={() => setModalSenha(false)} email={email} />
        </>
      )}
      <ModalErros open={modalErros} onClose={() => setModalErros(false)} />
    </>
  )
}
