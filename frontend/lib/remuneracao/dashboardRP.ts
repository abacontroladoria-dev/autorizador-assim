// Agregação para o dashboard no topo da aba relacionamento-prestador/rp: quanto a
// empresa paga no mês e como esse total se reparte por especialidade. Decompõe
// exatamente os mesmos componentes somados em ProfRemunReal.valorTotalAPagar
// (calculo.ts) — PA por sessão, PPD (diária), PE (Coordenador de Caso), bônus ETA
// e o valor fixo de banco de horas — então totalMes bate, por construção, com a
// folha real.
//
// Banco de horas é valor fixo do CONTRATO, não por sessão — mas cada contrato
// vigente em banco de horas tem UMA especialidade só (a `funcao` escolhida no
// cadastro em /cadastros/contratos), então o valor dele é dessa especialidade
// por definição. Regra de negócio: banco de horas SEMPRE é uma especialidade —
// por isso o valor entra direto na barra dela, sem precisar adivinhar pela
// sessão nem deixar nada de fora.
import type { ProfRemunReal } from "./calculo"

export type EspecialidadeTotal = {
  especialidade: string
  valor: number
  /** Fração de totalMes. */
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
  /** totalVariavel + totalBancoHoras — e também a soma de porEspecialidade. */
  totalMes: number
  porEspecialidade: EspecialidadeTotal[]
}

type ProfParaDashboard = Pick<ProfRemunReal, "prof" | "sessoes" | "diariaDetalhe" | "pe" | "etaBonusPeriodo" | "valorFixoBancoHoras" | "bancoHorasDetalhe">

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
      // Um item por contrato em banco de horas — cada um com sua própria
      // especialidade e valor, então soma direto na barra dela.
      p.bancoHorasDetalhe.forEach(bh => add(bh.funcao, bh.valorTotal, p.prof))
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

  const totalMes = Object.values(mapa).reduce((s, x) => s + x.valor, 0)
  const totalVariavel = totalMes - totalBancoHoras

  const porEspecialidade = Object.entries(mapa)
    .map(([especialidade, x]) => ({
      especialidade,
      valor: x.valor,
      pct: totalMes > 0 ? x.valor / totalMes : 0,
      profissionais: [...x.profs].sort(),
    }))
    .filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  return {
    totalVariavel,
    totalBancoHoras,
    profsBancoHoras,
    totalMes,
    porEspecialidade,
  }
}
