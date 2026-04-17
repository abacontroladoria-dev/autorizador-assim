'use client'

import { FileText, PlusCircle, LogOut } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { getSupabaseClient } from "@/lib/supabase/client"

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = getSupabaseClient()

  function isActive(path: string) {
    return pathname === path
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = "/login" // 🔥 mais confiável que router.push
  }

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col">

      {/* LOGO */}
      <div className="px-6 pt-6 pb-3 border-b border-slate-100 flex justify-center">
        <img
          src="/logo-universo-aba.png"
          className="h-28 object-contain drop-shadow-sm"
        />
      </div>

      {/* MENU */}
      <nav className="flex-1 px-4 py-6 space-y-2">

        <a
          href="/autorizacoes"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition
          ${isActive("/autorizacoes")
            ? "bg-[#3A8FB7] text-white shadow-sm"
            : "text-slate-600 hover:bg-blue-50 hover:text-[#3A8FB7]"
          }`}
        >
          <FileText size={18} />
          Autorizações
        </a>

        <a
          href="/solicitar"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition
          ${isActive("/solicitar")
            ? "bg-[#3A8FB7] text-white shadow-sm"
            : "text-slate-600 hover:bg-blue-50 hover:text-[#3A8FB7]"
          }`}
        >
          <PlusCircle size={18} />
          Solicitar Autorização
        </a>

      </nav>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-4 py-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>

    </div>
  )
}