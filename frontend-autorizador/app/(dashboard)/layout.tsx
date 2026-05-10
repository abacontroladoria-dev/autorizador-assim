'use client'

import Sidebar from "@/components/Sidebar"
import {
  useEffect,
  useState,
  useRef,
} from "react"

import { getSupabaseClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

import {
  HeaderProvider,
  useHeader,
} from '@/contexts/HeaderContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (

    <HeaderProvider>

      <DashboardShell>
        {children}
      </DashboardShell>

    </HeaderProvider>
  )
}

function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {

  const supabase = getSupabaseClient()
  const router = useRouter()

  const [nome, setNome] =
    useState("Usuário")

  const [open, setOpen] =
    useState(false)

  const menuRef =
    useRef<HTMLDivElement>(null)

  const {
    title,
    subtitle,
  } = useHeader()

  // ============================================
  // AUTH
  // ============================================

  useEffect(() => {

    async function checkUser() {

      const {
        data,
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error(
          "Erro ao pegar usuário:",
          userError
        )
        return
      }

      if (!data.user) {
        router.push("/login")
        return
      }

      const userId = data.user.id

      const {
        data: maquina,
        error,
      } = await supabase

        .from("maquinas")

        .select("nome, user_id")

        .eq("user_id", userId)

        .maybeSingle()

      if (error) {
        console.error(
          "Erro real do Supabase:",
          error.message
        )
      }

      if (maquina?.nome) {

        setNome(maquina.nome)

      } else {

        const fallback =
          data.user.email?.split("@")[0]
          || "Usuário"

        setNome(fallback)
      }
    }

    checkUser()

  }, [])

  // ============================================
  // CLOSE MENU
  // ============================================

  useEffect(() => {

    function handleClickOutside(
      event: MouseEvent
    ) {

      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target as Node
        )
      ) {
        setOpen(false)
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    )

    return () => {

      document.removeEventListener(
        "mousedown",
        handleClickOutside
      )
    }

  }, [])

  // ============================================
  // UI
  // ============================================

  return (

    <div className="
      min-h-screen
      bg-slate-100
    ">

      <Sidebar />

      <div className="
        ml-64
        flex flex-col
        min-h-screen
      ">

        {/* HEADER */}
        <header className="
          h-20
          bg-white
          flex items-center justify-between
          px-6
          relative
          shrink-0
        ">

          {/* TÍTULO DINÂMICO */}
          <div>

            <h1 className="
              text-lg
              font-bold
              text-slate-800
              leading-tight
            ">
              {title}
            </h1>

            {subtitle && (

              <p className="
                text-xs
                text-slate-500
                mt-0.5
              ">
                {subtitle}
              </p>

            )}

          </div>

          {/* USER */}
          <div
            ref={menuRef}
            className="relative"
          >

            <button
              onClick={() => setOpen(!open)}
              className="
                flex items-center gap-2
                px-2 py-1
                rounded-lg
                hover:bg-gray-100
                transition
                cursor-pointer
              "
            >

              <div className="
                w-8 h-8
                rounded-full
                bg-[#3A8FB7]
                text-white
                flex items-center justify-center
                font-semibold
              ">
                {
                  nome?.charAt(0)
                    ?.toUpperCase()
                  || "U"
                }
              </div>

              <span className="
                text-sm
                text-gray-700
              ">
                {nome}
              </span>

              {/* SETA */}
              <span
                className={`
                  text-gray-400
                  text-xs
                  transition-transform
                  duration-200
                  ${open ? "rotate-180" : ""}
                `}
              >
                ▼
              </span>

            </button>

            {/* MENU */}
            {open && (

              <div className="
                absolute right-0
                mt-3
                w-72
                rounded-2xl
                shadow-[0_10px_30px_rgba(0,0,0,0.2)]
                p-3
                text-sm
                z-[999]
                bg-gradient-to-br
                from-[#1f3f5b]
                to-[#2f6f95]
                text-white
              ">

                {/* USER */}
                <div className="px-3 pb-3">

                  <div className="
                    text-sm
                    font-semibold
                  ">
                    {nome}
                  </div>

                  <div className="
                    text-xs
                    text-white/60
                  ">
                    email@email.com
                  </div>

                  <div className="
                    text-xs
                    text-white/60
                  ">
                    atendente_01
                  </div>

                </div>

                <div className="
                  border-t
                  border-white/10
                  my-2
                " />

                {/* CONTA */}
                <div className="
                  px-3
                  text-xs
                  text-white/50
                  mb-1
                ">
                  Conta
                </div>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Meu perfil
                </button>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Alterar senha
                </button>

                <div className="
                  border-t
                  border-white/10
                  my-2
                " />

                {/* AUTOMAÇÃO */}
                <div className="
                  px-3
                  text-xs
                  text-white/50
                  mb-1
                  flex justify-between items-center
                ">

                  <span>Automação</span>

                  <span className="
                    flex items-center gap-2
                    text-green-300
                    font-medium
                  ">

                    <span className="
                      w-2 h-2
                      bg-green-400
                      rounded-full
                    " />

                    Ativa

                  </span>

                </div>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Pausar automação
                </button>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Retomar automação
                </button>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Reiniciar worker
                </button>

                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  hover:bg-white/10
                  active:bg-white/20
                  transition
                ">
                  Liberar processos travados
                </button>

                <div className="
                  border-t
                  border-white/10
                  my-2
                " />

                {/* STATUS */}
                <div className="
                  px-3 py-2
                  text-xs
                  flex justify-between
                  text-white/70
                ">

                  <span>
                    2 em processamento
                  </span>

                  <span className="
                    text-red-300
                    font-medium
                  ">
                    1 erro
                  </span>

                </div>

                <div className="
                  border-t
                  border-white/10
                  my-2
                " />

                {/* SAIR */}
                <button className="
                  w-full
                  text-left
                  px-3 py-2
                  rounded-lg
                  text-red-300
                  hover:bg-red-500/30
                  transition
                  font-medium
                ">
                  Sair
                </button>

              </div>

            )}

          </div>

        </header>

        {/* PAGE */}
        <main className="
          flex-1
          p-6
          overflow-auto
        ">
          {children}
        </main>

      </div>

    </div>
  )
}