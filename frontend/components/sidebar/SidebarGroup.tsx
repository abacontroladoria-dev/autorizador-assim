"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

interface SidebarGroupProps {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: ReactNode
}

export function SidebarGroup({ title, icon: Icon, defaultOpen = false, children }: SidebarGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors hover:bg-white/10"
        style={{ color: "#8fb3cc", backgroundColor: "rgba(255,255,255,0.07)" }}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: "#7a9ab8" }} />
        <span className="flex-1 text-left">{title}</span>
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          style={{ color: "#7a9ab8" }}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="pl-3 pb-1 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}
