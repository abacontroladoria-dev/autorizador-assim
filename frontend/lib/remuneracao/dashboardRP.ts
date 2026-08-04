// Agregação para o dashboard no topo da aba relacionamento-prestador/rp: quanto a
// empresa paga no mês e como esse total se reparte por especialidade. Decompõe
// exatamente os mesmos quatro componentes somados em ProfRemunReal.valorConfirmado
// (calculo.ts) — PA por sessão, PPD (diária), PE (Coordenador de Caso) e bônus ETA —
// então totalVariavel bate, por construção, com a soma de valorConfirmado de todo mundo.
//
// O valor fixo dos contratos de banco de horas fica FORA de porEspecialidade: não é
// pago por sessão, logo não se reparte por especialidade nenhuma. Mas entra em
// totalMes, senão o número que a tela chama de "total do mês que a empresa vai
// pagar" ficaria menor que a folha real.
import type { ProfRemunReal } from "./calculo"

export type EspecialidadeTotal = {
  especialidade: string
  valor: number
  /** Fração de totalVariavel (o valor fixo não se reparte por especialidade). */
  pct: number
  profissionais: string[]
}

export type TotalRPResumo = {
  /** PA + PPD + PE + ETA de todo mundo — a parte que varia por sessão/entrega. */
  totalVariavel: number
  /** Valor fixo dos contratos vigentes em banco de horas. */
  totalBancoHoras: number
  /** Quantos profissionais têm valor fixo de banco de horas neste total. */
  profsBancoHoras: number
  /** totalVariavel + totalBancoHoras. */
  totalMes: number
  porEspecialidade: EspecialidadeTotal[]
}

type ProfParaDashboard = Pick<ProfRemunReal, "prof" | "sessoes" | "diariaDetalhe" | "pe" | "etaBonusPeriodo" | "valorFixoBancoHoras">

export function calcularTotalPorEspecialidade(resultado: ProfParaDashboard[]): TotalRPResumo {
  const mapa: Record<string, { valor: number; profs: Set<string> }> = {}

  const add = (esp: string | undefined | null, valor: number, prof: string) => {
    if (!valor) return
    const key = esp || "Sem especialidade"
    if (!mapa[key]) mapa[key] = { valor: 0, profs: new Set() }
    mapa[key].valor += valor
    mapa[key].profs.add(prof)
  }

  let totalBancoHoras = 0
  let profsBancoHoras = 0

  resultado.forEach(p => {
    if (p.valorFixoBancoHoras > 0) {
      totalBancoHoras += p.valorFixoBancoHoras
      profsBancoHoras++
    }
    // PA por sessão: valorPA só é preenchido nas sessões que efetivamente entram
    // no acumulado (evolução própria ou substituição realizada) — ver calculo.ts.
    p.sessoes.forEach(s => {
      if (s.valorPA != null) add(s.especialidade, s.valorPA, p.prof)
    })
    // PPD (diária) já vem quebrado por especialidade.
    p.diariaDetalhe.forEach(dd => add(dd.esp, dd.total, p.prof))
    // PE é exclusivo de Coordenador de Caso.
    if (p.pe > 0) add("Coordenador de Caso", p.pe, p.prof)
    // Bônus ETA é exclusivo de Especialista Técnico de Área.
    if (p.etaBonusPeriodo > 0) add("Especialista Técnico de Área", p.etaBonusPeriodo, p.prof)
  })

  const totalVariavel = Object.values(mapa).reduce((s, x) => s + x.valor, 0)

  const porEspecialidade = Object.entries(mapa)
    .map(([especialidade, x]) => ({
      especialidade,
      valor: x.valor,
      pct: totalVariavel > 0 ? x.valor / totalVariavel : 0,
      profissionais: [...x.profs].sort(),
    }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  return {
    totalVariavel,
    totalBancoHoras,
    profsBancoHoras,
    totalMes: totalVariavel + totalBancoHoras,
    porEspecialidade,
  }
}
