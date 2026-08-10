"use client"

import { Bot, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export default function PulsarHubCard() {
  const router = useRouter()

  return (
    <Button
      type="button"
      onClick={() => router.push("/connect")}
      aria-label="Entrar no Pulsar Connect"
      className="group relative h-full min-h-19 w-full overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#21106c_0%,#4c1d95_48%,#6d28d9_100%)] bg-[length:180%_180%] p-0 text-left whitespace-normal shadow-[0_10px_24px_rgba(88,28,135,0.22)] transition-all duration-200 ease-out hover:scale-[1.01] hover:bg-[position:100%_50%] hover:shadow-[0_14px_30px_rgba(88,28,135,0.28)] active:scale-[0.985] active:brightness-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_86%_22%,rgba(255,255,255,0.22),transparent_30%),linear-gradient(90deg,rgba(255,255,255,0.10),transparent_46%)] opacity-95 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="absolute -right-14 top-0 h-full w-36 rotate-12 bg-white/10 blur-xl transition-transform duration-300 group-hover:translate-x-[-10px] motion-reduce:transform-none" />

      <span className="relative flex h-full w-full items-center gap-3 px-4 py-2.5 sm:px-5">
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.16] text-white ring-1 ring-white/[0.28] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
            <Bot className="size-5" strokeWidth={2.25} />
            <Sparkles className="absolute -right-1 -top-1 size-3.5 text-amber-200" strokeWidth={2.4} />
          </span>

          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight text-white sm:text-base">
              PULSAR Connect
            </span>
            <span className="mt-0.5 block text-xs font-semibold leading-snug text-violet-100 sm:text-[13px]">
              Central de Atendimento
            </span>
            <span className="mt-0.5 block text-xs font-medium leading-snug text-white/78">
              CRM
            </span>
          </span>
        </span>

      </span>
    </Button>
  )
}

