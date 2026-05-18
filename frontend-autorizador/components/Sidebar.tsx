"use client"

import {
  LayoutDashboard,
  PlusCircle,
  LogOut,
  Users,
  Activity,
  FileText,
  ShieldCheck,
} from "lucide-react"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"
import { getFunctionHeaders, getFunctionUrl } from "@/lib/supabase/functions"
import { useState } from "react"

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = getSupabaseClient()
  const [loadingLogout, setLoadingLogout] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState(true)
  
	function isActive(path: string) {
	  if (path === "/") {
		return pathname === "/"
	  }

	  return pathname.startsWith(path)
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
		"/guias-digitais",
		"/financeiro",
		"/admin",
	  ],

	  diretoria: [
		"/",
		"/solicitar",
		"/central-pacientes",
		"/central-terapeutas",
		"/guias-digitais",
		"/financeiro",
	  ],

	  recepcao: [
		"/",
		"/solicitar",
		"/central-pacientes",
	  ],

	  terapeutico: [
		"/",
		"/central-terapeutas",
	  ],

	  faturamento: [
		"/",
		"/guias-digitais",
	  ],
	}

	const allowedPaths =
	  permissions[role as keyof typeof permissions] || []

	function canAccess(path: string) {
	  return allowedPaths.includes(path)
	}
	
	useEffect(() => {
	  async function loadRole() {
		const response = await fetch(getFunctionUrl('verify-perfil'), {
		  method: 'POST',
		  headers: await getFunctionHeaders(),
		})

		if (!response.ok) {
		  setRole(null)
		  setLoadingRole(false)
		  return
		}

		const json = await response.json()
		setRole(json.data?.role || null)
		setLoadingRole(false)
	  }
	  loadRole()
	}, [])
	
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

    return (
      <button
        onClick={() => router.push(path)}
        className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${
			active
			  ? "text-white bg-[#3A8FB7] shadow-sm"
			  : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {/* 🔥 INDICADOR LATERAL */}
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-r-full bg-[#3A8FB7] transition-all duration-300
          ${active ? "opacity-100" : "opacity-0"}`}
        />

        <Icon size={18} />
        {label}
      </button>
    )
  }

  return (
    <aside className="fixed top-0 left-0 w-64 h-screen bg-white border-r border-slate-200 flex flex-col z-50">

      {/* LOGO */}
      <div className="h-20 flex items-center justify-center border-b border-slate-100 px-6">
        <img src="/logo-universo-aba.png" className="h-20 object-contain" />
      </div>

      {/* MENU */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">

{canAccess("/") && (
  <MenuItem
    label="Home"
    icon={LayoutDashboard}
    path="/"
  />
)}

{canAccess("/solicitar") && (
  <MenuItem
    label="Nova Solicitação"
    icon={PlusCircle}
    path="/solicitar"
  />
)}

{canAccess("/central-pacientes") && (		
		<MenuItem
		  label="Controle de Pacientes"
		  icon={Activity}
		  path="/central-pacientes"
		/>
)}

{canAccess("/central-terapeutas") && (
		<MenuItem
		  label="Controle de Terapeutas"
		  icon={Users}
		  path="/central-terapeutas"
		/>
)}

{canAccess("/guias-digitais") && (
        <MenuItem
          label="Guias Digitais"
          icon={FileText}
          path="/guias-digitais"
        />
)}

{canAccess("/admin") && (
        <MenuItem
          label="Admin"
          icon={ShieldCheck}
          path="/admin"
        />
)}

      </nav>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-100">
		<button
		  onClick={handleLogout}
		  disabled={loadingLogout}
		  className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
		>
		  <LogOut size={16} />
		  {loadingLogout ? "Saindo..." : "Sair"}
		</button>
      </div>

    </aside>
  )
}
