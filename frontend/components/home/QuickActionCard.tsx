"use client"

import { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"

interface QuickActionCardProps {
  label: string
  description: string
  icon: LucideIcon
  href: string
  iconBg: string
  iconColor: string
  borderColor: string
}

export default function QuickActionCard({
  label,
  description,
  icon: Icon,
  href,
  iconBg,
  iconColor,
  borderColor,
}: QuickActionCardProps) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(href)}
      className={`group w-full bg-white rounded-xl border ${borderColor} p-4 text-left
                  flex items-center gap-4
                  hover:shadow-md hover:scale-[1.01] active:scale-[0.99]
                  transition-all duration-150 ease-out`}
    >
      <div
        className={`${iconBg} ${iconColor} w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                    group-hover:scale-110 transition-transform duration-200`}
      >
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-snug truncate">{description}</p>
      </div>
    </button>
  )
}
