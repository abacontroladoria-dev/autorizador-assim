// Agregação para o dashboard no topo da aba relacionamento-prestador/rp: quanto a
// empresa paga no mês e como esse total se reparte por especialidade. Decompõe
// exatamente os mesmos quatro componentes somados em ProfRemunReal.valorConfirmado
// (calculo.ts) — PA por sessão, PPD (diária), PE (Coordenador de Caso) e bônus ETA —
// então totalMes bate, por construção, com a soma de valorConfirmado de todo mundo.
import type { ProfRemunReal } from "./calculo"

export type EspecialidadeTotal = {
  especialidade: string
  valor: number
  pct: number
  profissionais: string[]
}

export type TotalRPResumo = {
  totalMes: number
  porEspecialidade: EspecialidadeTotal[]
}

type ProfParaDashboard = Pick<ProfRemunReal, "prof" | "sessoes" | "diariaDetalhe" | "pe" | "etaBonusPeriodo">

export function calcularTotalPorEspecialidade(resultado: ProfParaDashboard[]): TotalRPResumo {
  const mapa: Record<string, { valor: number; profs: Set<string> }> = {}

  const add = (esp: string | undefined | null, valor: number, prof: string) => {
    if (!esp || !valor) return
    if (!mapa[esp]) mapa[esp] = { valor: 0, profs: new Set() }
    mapa[esp].valor += valor
    mapa[esp].profs.add(prof)
  }

  resultado.forEach(p => {
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

  const totalMes = Object.values(mapa).reduce((s, x) => s + x.valor, 0)

  const porEspecialidade = Object.entries(mapa)
    .map(([especialidade, x]) => ({
      especialidade,
      valor: x.valor,
      pct: totalMes > 0 ? x.valor / totalMes : 0,
      profissionais: [...x.profs].sort(),
    }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  return { totalMes, porEspecialidade }
}
