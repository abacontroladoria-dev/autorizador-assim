"use client"

import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  LogOut,
} from "lucide-react"

import { usePathname, useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = getSupabaseClient()

  function isActive(path: string) {
    return pathname.startsWith(path)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
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

    return (
      <button
        onClick={() => router.push(path)}
        className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${
          active
            ? "text-[#3A8FB7] bg-blue-50"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {/* 🔥 INDICADOR LATERAL */}
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-[#3A8FB7] transition-all duration-300
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
        <img src="/logo-universo-aba.png" className="h-12 object-contain" />
      </div>

      {/* MENU */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">

        <MenuItem
          label="Home"
          icon={LayoutDashboard}
          path="/home"
        />

        <MenuItem
          label="Nova Solicitação"
          icon={PlusCircle}
          path="/solicitar"
        />

        <MenuItem
          label="Fila de Autorizações"
          icon={ClipboardList}
          path="/autorizacoes"
        />

      </nav>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>

    </aside>
  )
}