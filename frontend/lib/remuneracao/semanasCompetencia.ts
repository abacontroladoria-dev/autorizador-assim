// Quantidade esperada de Supervisão/Estudo Técnico (itens semanais) numa
// competência — PRD Seção 9.11/11, calculada automaticamente a partir do
// calendário (dias úteis + feriados cadastrados em `feriados`), sem exigir
// que a clínica informe manualmente o número de semanas.
//
// Regras do PRD, ao pé da letra:
//   • §9.11: "Em mês com menos de 4 semanas por recesso, Supervisão e Estudo
//     esperam 3 unidades" — só RECESSO (semana inteira sem dia útil) reduz.
//   • §9.11: "Em mês de 4 a 5 semanas COM FERIADO, a quantidade esperada NÃO
//     é reduzida" — um feriado isolado dentro de uma semana não tira a
//     semana da contagem.
//   • §11: "Mês de 5 semanas não altera o valor" — o teto é sempre 4,
//     mesmo que o mês tenha 5 semanas seg-sex.
//
// Como o cadastro de feriados (public.feriados) só marca `tipo` como
// integral/parcial — não existe um campo "recesso" — o recesso é DERIVADO:
// uma semana só deixa de contar quando TODOS os seus dias úteis (seg-sex)
// daquele mês são feriado integral. Um feriado integral isolado no meio de
// uma semana com outros dias úteis não reduz nada (bate com o exemplo do
// próprio §9.11).

import type { FeriadoRow } from "@/types/feriados"

function paraISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Segunda-feira da semana em que `d` cai, como chave estável de agrupamento. */
function chaveDaSemana(d: Date): string {
  const dow = d.getDay() // 0=dom ... 6=sáb
  const offsetAteSegunda = (dow + 6) % 7 // seg=1→0, ter=2→1, ..., dom=0→6
  const segunda = new Date(d)
  segunda.setDate(d.getDate() - offsetAteSegunda)
  return paraISO(segunda)
}

export function semanasEsperadas(competencia: string, feriados: FeriadoRow[]): number {
  const [ano, mes] = competencia.split("-").map(Number)
  if (!ano || !mes) return 4

  const feriadosIntegrais = new Set(feriados.filter(f => f.tipo === "integral").map(f => f.data))
  const primeiroDia = new Date(ano, mes - 1, 1)
  const ultimoDia = new Date(ano, mes, 0)

  // Por semana (chave = segunda-feira), conta quantos dias úteis (seg-sex)
  // do mês ela tem, e quantos desses são feriado integral.
  const uteisPorSemana = new Map<string, number>()
  const feriadosPorSemana = new Map<string, number>()

  for (let d = new Date(primeiroDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue // fim de semana não conta como dia útil
    const chave = chaveDaSemana(d)
    uteisPorSemana.set(chave, (uteisPorSemana.get(chave) ?? 0) + 1)
    if (feriadosIntegrais.has(paraISO(d))) {
      feriadosPorSemana.set(chave, (feriadosPorSemana.get(chave) ?? 0) + 1)
    }
  }

  let semanasAtivas = 0
  for (const [chave, uteis] of uteisPorSemana) {
    const feriadosNaSemana = feriadosPorSemana.get(chave) ?? 0
    if (feriadosNaSemana < uteis) semanasAtivas++ // sobrou pelo menos 1 dia útil não-feriado
  }

  // §11: mês de 5 semanas não altera o valor — teto sempre 4.
  return Math.min(4, semanasAtivas)
}
