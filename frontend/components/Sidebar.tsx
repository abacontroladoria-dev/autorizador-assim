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
  BarChart3,
  CalendarPlus,
  Database,
  LogOut,
  TrendingUp,
  UserCheck,
  UserPlus,
  Zap,
  Clock,
  XCircle,
  AlertTriangle,
  CalendarOff,
  BookOpen,
  Settings,
  CalendarRange,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"
import { getFunctionHeaders, getFunctionUrl } from "@/lib/supabase/functions"
import toast from "react-hot-toast"
import ModalPerfil from "@/components/perfil/ModalPerfil"
import ModalAlterarSenha from "@/components/perfil/ModalAlterarSenha"
import ModalErros from "@/components/perfil/ModalErros"
import { SidebarGroup } from "@/components/sidebar/SidebarGroup"
import { ThemeSwitcher } from "@/components/sidebar/ThemeSwitcher"
import { useTheme } from "@/contexts/ThemeContext"
import { useImpersonation } from "@/contexts/ImpersonationContext"
import { ImpersonationSelector } from "@/components/admin/ImpersonationSelector"
import { ROLE_LABELS } from "@/constants/roleLabels"
import { getRoleDefaultPermissions, codigosToRotas } from "@/lib/permissions/routes"
import { getUsuarioPermissoes } from "@/services/permissoes.service"

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
  "/cco": BarChart3,
  "/admin": ShieldCheck,
  "/admin/permissoes": KeyRound,
  "/cronograma/solicitacoes?tab=simulacao": UserPlus,
  "/cronograma/solicitacoes?tab=ocup-prof": TrendingUp,
  "/cronograma/solicitacoes?tab=novo-cron": CalendarPlus,
  "/cronograma/solicitacoes?tab=banco": Database,
  "/cronograma/saida-profissional": LogOut,
  "/cronograma/ocupacao-paciente": TrendingUp,
  "/cronograma/ocupacao?tab=vagas": TrendingUp,
  "/cronograma/ocupacao?tab=fila": Clock,
  "/cronograma/ocupacao?tab=recusados": XCircle,
  "/cronograma/ocupacao?tab=inviavel": AlertTriangle,
  "/cronograma/ocupacao?tab=gaps": CalendarOff,
  "/cronograma/ocupacao?tab=inconsistencias": AlertTriangle,
  "/cronograma/ocupacao?tab=guia": BookOpen,
  "/cronograma/ocupacao?tab=config": Settings,
  "/cronograma/indicadores": BarChart3,
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getSupabaseClient()
  const { theme } = useTheme()
  const { isImpersonating, impersonatedTarget, canImpersonate } = useImpersonation()
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
  const [allowedPaths, setAllowedPaths] = useState<string[]>([])

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
    const [rawPart, queryPart] = path.split("?")
    const pathPart = rawPart.replace(/\/$/, "") || "/"
    const current = pathname.replace(/\/$/, "") || "/"
    if (current !== pathPart) return false
    if (!queryPart) return true
    const expected = new URLSearchParams(queryPart)
    for (const [k, v] of expected) {
      if (searchParams.get(k) !== v) return false
    }
    return true
  }

  async function handleLogout() {
    setLoadingLogout(true)
    await supabase.auth.signOut()
    router.replace("/login")
  }

  function canAccess(path: string) {
    if (!role) return false
    const barePath = path.split("?")[0]
    return allowedPaths.includes(barePath)
  }

  useEffect(() => {
    let isMounted = true

    async function loadRole() {
      let targetId: string | undefined
      let targetRole: string | null

      if (isImpersonating && impersonatedTarget) {
        targetId = impersonatedTarget.id
        targetRole = impersonatedTarget.role
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (isMounted) setLoadingRole(false)
          return
        }
        targetId = user.id
        const { data } = await supabase
          .from("usuarios")
          .select("role")
          .eq("id", user.id)
          .single()
        targetRole = data?.role || null
      }

      if (!isMounted) return

      setRole(targetRole)

      if (!targetRole) {
        setAllowedPaths([])
        setLoadingRole(false)
        return
      }

      const codigosPorRole = getRoleDefaultPermissions(targetRole)
      let codigos = new Set(codigosPorRole)

      if (targetId) {
        try {
          const overrides = await getUsuarioPermissoes(targetId)
          for (const o of overrides) {
            if (o.permitido) {
              codigos.add(o.permissao_codigo)
            } else {
              codigos.delete(o.permissao_codigo)
            }
          }
        } catch (error) {
          console.error("Erro ao carregar permissões do usuário:", error)
        }
      }

      const rotas = codigosToRotas(codigos)

      if (isMounted) {
        setAllowedPaths(rotas)
        setLoadingRole(false)
      }
    }

    loadRole()

    return () => {
      isMounted = false
    }
  }, [isImpersonating, impersonatedTarget, supabase])

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
            ? "border-l-2 border-sidebar-primary pl-2.5 font-semibold bg-sidebar-accent text-sidebar-accent-foreground"
            : "border-l-2 border-transparent pl-2.5 text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        }`}
      >
        <Icon
          size={16}
          className="shrink-0"
          style={{ color: active ? "var(--color-sidebar-primary)" : "var(--color-sidebar-foreground)" }}
        />
        <span className="flex-1 text-left">{label}</span>
        {path !== "/" && (
          <span
            onClick={e => { e.stopPropagation(); toggleFavorito(label, path) }}
            className={`p-1 rounded transition-all duration-150 hover:bg-sidebar-accent
              ${isFav
                ? "opacity-100 text-yellow-500"
                : "opacity-0 group-hover:opacity-100 text-sidebar-foreground/40 hover:text-yellow-500"
              }`}
          >
            <Star size={12} fill={isFav ? "currentColor" : "none"} />
          </span>
        )}
      </button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <>
      <aside
        className="fixed top-0 left-0 w-64 h-screen flex flex-col z-50 bg-sidebar border-r border-sidebar-border transition-colors duration-300"
      >

        {/* LOGO */}
        <div className="h-20 flex items-center justify-center px-6 border-b border-sidebar-border">
          <img
            src="/logo-universo-aba.png"
            className="h-20 object-contain"
            style={{ filter: isDark ? 'brightness(0) invert(1)' : 'none' }}
          />
        </div>

        {/* IMPERSONATION SELECTOR (apenas para admin) */}
        {canImpersonate && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <ImpersonationSelector />
          </div>
        )}

        {/* MENU */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">

          {/* Dashboard */}
          <MenuItem label="Dashboard" icon={LayoutDashboard} path="/" />

          {/* Favoritos */}
          <div className="pt-2">
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider select-none text-sidebar-foreground/50">
              ⭐ Favoritos
            </p>
            {favoritos
              .filter(f => canAccess(f.path))
              .map(f => (
                <MenuItem key={f.path} label={f.label} icon={pathIconMap[f.path] ?? Star} path={f.path} />
              ))}
          </div>

          <hr className="my-2 border-sidebar-border" />

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
          {(canAccess("/auditoria-assim") || canAccess("/guias-digitais") || canAccess("/cco")) && (
            <SidebarGroup title="Operações" icon={BriefcaseBusiness}>
              {canAccess("/cco") && (
                <MenuItem label="Conciliação ASSIM" icon={BarChart3} path="/cco" />
              )}
              {canAccess("/auditoria-assim") && (
                <MenuItem label="Auditoria ASSIM" icon={ClipboardList} path="/auditoria-assim" />
              )}
              {canAccess("/guias-digitais") && (
                <MenuItem label="Guias Digitais" icon={FileText} path="/guias-digitais" />
              )}
            </SidebarGroup>
          )}

          {/* Cronograma */}
          {(canAccess("/cronograma/saida-profissional") || canAccess("/cronograma/ocupacao-paciente") || canAccess("/cronograma/ocupacao")) && (
            <SidebarGroup title="Cronograma" icon={CalendarRange}>
              {canAccess("/cronograma/saida-profissional") && <MenuItem label="Saída Profissional" icon={LogOut} path="/cronograma/saida-profissional" />}
              {canAccess("/cronograma/ocupacao-paciente") && <MenuItem label="Ocupação Paciente" icon={UserCheck} path="/cronograma/ocupacao-paciente" />}
              {canAccess("/cronograma/ocupacao") && <MenuItem label="Aceites e Recusas" icon={ClipboardList} path="/cronograma/ocupacao?tab=acompanhamento" />}
            </SidebarGroup>
          )}

          {/* Indicadores */}
          {canAccess("/cronograma/indicadores") && (
            <SidebarGroup title="Indicadores" icon={TrendingUp}>
              <MenuItem label="Ocupação de Profissionais" icon={BarChart3} path="/cronograma/indicadores" />
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

        {/* THEME SWITCHER */}
        <div className="px-4 pb-3">
          <ThemeSwitcher />
        </div>

        {/* FOOTER — PERFIL */}
        <div className="p-4 border-t border-sidebar-border" ref={menuRef}>
          <div className="relative">

            <button
              onClick={() => setOpen(!open)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sidebar-accent/60 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-sidebar-primary text-white flex items-center justify-center font-semibold text-sm shrink-0">
                {nome?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">{nome}</p>
                {role && (
                  <p className={`text-xs capitalize leading-tight ${isImpersonating ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-sidebar-foreground/50'}`}>
                    {isImpersonating ? '👁️ ' : ''}
                    {ROLE_LABELS[role] ?? role}
                  </p>
                )}
              </div>
              <span className={`text-sidebar-foreground/40 text-xs transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {open && (
              <div className={`absolute bottom-full left-0 mb-2 w-72 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] p-3 text-sm z-999
                ${isDark
                  ? "bg-linear-to-br from-[#1f3f5b] to-[#2f6f95] text-white"
                  : "bg-white border border-sidebar-border text-slate-800"
                }`}
              >

                <div className="px-3 pb-3">
                  <div className="text-sm font-semibold">{nome}</div>
                  <div className={`text-xs ${isDark ? "text-white/60" : "text-slate-500"}`}>{email || "—"}</div>
                </div>

                <div className={`border-t my-2 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                <div className={`px-3 text-xs mb-1 ${isDark ? "text-white/50" : "text-slate-400"}`}>Conta</div>

                <button
                  onClick={() => { setOpen(false); setModalPerfil(true) }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition ${isDark ? "hover:bg-white/10 active:bg-white/20" : "hover:bg-slate-50 active:bg-slate-100"}`}
                >
                  Meu perfil
                </button>

                <button
                  onClick={() => { setOpen(false); setModalSenha(true) }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition ${isDark ? "hover:bg-white/10 active:bg-white/20" : "hover:bg-slate-50 active:bg-slate-100"}`}
                >
                  Alterar senha
                </button>

                <div className={`border-t my-2 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                <div className={`px-3 py-2 text-xs flex justify-between mb-1 ${isDark ? "text-white/50" : "text-slate-400"}`}>
                  <span>Automação</span>
                  <span className={`flex items-center gap-2 font-medium ${automacaoAtiva ? "text-green-500" : "text-orange-500"}`}>
                    <span className={`w-2 h-2 rounded-full ${automacaoAtiva ? "bg-green-400" : "bg-orange-400"}`} />
                    {automacaoAtiva ? "Ativa" : "Pausada"}
                  </span>
                </div>

                {automacaoAtiva ? (
                  <button
                    onClick={handlePausar}
                    disabled={loadingPausar}
                    className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                  >
                    {loadingPausar ? "Pausando..." : "Pausar automação"}
                  </button>
                ) : (
                  <button
                    onClick={handleRetomar}
                    disabled={loadingRetomar}
                    className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                  >
                    {loadingRetomar ? "Retomando..." : "Retomar automação"}
                  </button>
                )}

                <button
                  onClick={handleReiniciar}
                  disabled={loadingReiniciar}
                  className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                >
                  {loadingReiniciar ? "Reiniciando..." : "Reiniciar worker"}
                </button>

                <button
                  onClick={handleLiberarTravados}
                  disabled={loadingLiberar}
                  className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${isDark ? "hover:bg-white/10" : "hover:bg-slate-50"}`}
                >
                  {loadingLiberar ? "Liberando..." : "Liberar processos travados"}
                </button>

                <div className={`border-t my-2 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                <div className={`px-3 py-2 text-xs flex justify-between ${isDark ? "text-white/70" : "text-slate-500"}`}>
                  <span>{countProcessando} em processamento</span>
                  {countErros > 0 ? (
                    <button
                      onClick={() => { setOpen(false); setModalErros(true) }}
                      className="text-red-500 font-medium hover:text-red-600 transition"
                    >
                      {countErros} erro{countErros !== 1 ? "s" : ""}
                    </button>
                  ) : (
                    <span className={isDark ? "text-white/40" : "text-slate-400"}>0 erros</span>
                  )}
                </div>

                <div className={`border-t my-2 ${isDark ? "border-white/10" : "border-slate-100"}`} />

                <button
                  onClick={handleLogout}
                  disabled={loadingLogout}
                  className="w-full text-left px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
