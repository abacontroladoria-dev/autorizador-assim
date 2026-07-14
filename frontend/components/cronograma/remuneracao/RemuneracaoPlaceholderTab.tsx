"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"

export function RemuneracaoPlaceholderTab({ title }: { title: string }) {
  const { setHeader } = useHeader()

  useEffect(() => {
    setHeader(title, "Relacionamento Prestador")
    return () => setHeader("", "")
  }, [title, setHeader])

  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
      <p className="font-medium text-foreground mb-1">{title}</p>
      <p>Em construção.</p>
    </div>
  )
}
