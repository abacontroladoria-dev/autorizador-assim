import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Sidebar from "@/components/Sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 🔐 Proteção de rota
  if (!user) {
    redirect("/login")
  }

  const nome = user.email?.split("@")[0] || "Usuário"

  return (
    <div className="min-h-screen bg-slate-100">

      {/* SIDEBAR */}
      <Sidebar />

      {/* CONTEÚDO */}
      <div className="ml-64 flex flex-col min-h-screen">

        {/* HEADER */}
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

        {/* CONTEÚDO DAS PÁGINAS */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>

      </div>

    </div>
  )
}