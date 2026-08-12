"use client"

import { CronogramaDataLayout } from "@/components/cronograma/CronogramaDataLayout"

export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  return <CronogramaDataLayout>{children}</CronogramaDataLayout>
}
