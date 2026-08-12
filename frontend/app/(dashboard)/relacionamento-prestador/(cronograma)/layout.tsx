"use client"

// Grupo de rota (cronograma) — NÃO aparece na URL (convenção Next.js de
// parênteses), só serve pra estas 3 páginas (movidas de /cronograma/* pra
// /relacionamento-prestador/* a pedido do usuário, 2026-08-12) continuarem
// usando o mesmo provedor de dados (grade/laudos/disponibilidade) das demais
// páginas do módulo Cronograma, sem herdar o RemuneracaoRPProvider das
// páginas "de verdade" de Relacionamento Prestador (analise/rp/individual/...).
import { CronogramaDataLayout } from "@/components/cronograma/CronogramaDataLayout"

export default function RelacionamentoPrestadorCronogramaLayout({ children }: { children: React.ReactNode }) {
  return <CronogramaDataLayout>{children}</CronogramaDataLayout>
}
