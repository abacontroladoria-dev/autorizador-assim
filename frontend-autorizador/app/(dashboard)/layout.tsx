'use client'

import Sidebar from "@/components/Sidebar"
import { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = getSupabaseClient()
  const router = useRouter()
  const [nome, setNome] = useState("Usuário")

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser()

      if (!data.user) {
        router.push("/login")
      } else {
        const nomeUser = data.user.email?.split("@")[0] || "Usuário"
        setNome(nomeUser)
      }
    }

    checkUser()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">

      <Sidebar />

      <div className="ml-64 flex flex-col min-h-screen">

        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold text-gray-700">
            Central de Autorizações
          </h1>

          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="w-8 h-8 rounded-full bg-[#3A8FB7] text-white flex items-center justify-center font-semibold">
              {nome.charAt(0).toUpperCase()}
            </div>

            <span>{nome}</span>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>

      </div>
    </div>
  )
}