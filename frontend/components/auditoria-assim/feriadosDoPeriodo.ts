import type { FeriadoInfo } from '@/types/feriados'

/** Um feriado do intervalo, já com a data ao lado do que a tabela guarda. */
export type FeriadoNoPeriodo = readonly [data: string, info: FeriadoInfo]

/**
 * Os feriados que caem DENTRO de um intervalo de calendário, em ordem de data.
 *
 * Duas decisões moram aqui, e as duas já morderam esta base:
 *
 * O recorte é sobre o CALENDÁRIO `de`–`ate`, nunca sobre os dias que têm
 * movimento. Um feriado em que ninguém atendeu não gera linha no resumo diário
 * e portanto não existe na série do gráfico — e é justamente esse o caso que
 * mais precisa ser dito, porque na tela ele é indistinguível de um dia que
 * ninguém auditou.
 *
 * A comparação é de STRING ISO, que é ordenável por construção (`YYYY-MM-DD`).
 * Passar por `new Date('2026-06-04')` leria a data como UTC e devolveria o dia
 * anterior em São Paulo — o erro de fuso que este arquivo evita por não
 * construir data nenhuma.
 */
export function feriadosDoPeriodo(
  feriados: Record<string, FeriadoInfo>,
  de: string,
  ate: string
): FeriadoNoPeriodo[] {
  // Intervalo invertido não seleciona nada, em vez de selecionar tudo: os
  // campos de data do modal são editáveis à mão e passam por estados inválidos
  // enquanto se digita.
  if (!de || !ate || de > ate) return []

  return Object.entries(feriados)
    .filter(([data]) => data >= de && data <= ate)
    .sort(([a], [b]) => a.localeCompare(b))
}
