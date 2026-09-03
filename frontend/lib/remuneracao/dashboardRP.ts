// Agregação para o dashboard no topo da aba relacionamento-prestador/rp: quanto a
// empresa paga no mês e como esse total se reparte por especialidade. Decompõe
// os componentes somados em ProfRemunReal.valorTotalAPagar (calculo.ts) — PA por
// sessão, PPD (diária), bônus ETA e o valor fixo de banco de horas — mais a PEP
// (Coordenador de Caso), que vem à parte de pep_apuracao_mensal (pepPorProf),
// não mais do antigo p.pe.
//
// Banco de horas é valor fixo do CONTRATO, não por sessão — mas cada contrato
// vigente em banco de horas tem UMA especialidade só (a `funcao` escolhida no
// cadastro em /cadastros/contratos), então o valor dele é dessa especialidade
// por definição. Regra de negócio: banco de horas SEMPRE é uma especialidade —
// por isso o valor entra direto na barra dela, sem precisar adivinhar pela
// sessão nem deixar nada de fora.
//
// Quando esse contrato foi salvo sem `funcao` (formulário antigo escondia o
// campo com 1 único contrato vigente — corrigido em ContratosCadastro.tsx,
// mas contratos já cadastrados continuam vazios), cai no fallback da
// especialidade geral do profissional (reboot_profissionais.especialidade)
// antes de virar "Sem especialidade".
import { buscarCadastroContratual, contratosAtuaisDoCadastro, FUNCAO_AC, FUNCAO_PS, FUNCAO_PS_LABEL, type CadastroContratual, type ProfRemunReal } from "./calculo"
import { normKey } from "./constants"

export type EspecialidadeTotal = {
  especialidade: string
  valor: number
  /** Fração de totalMes. */
  pct: number
  /** Quem tem esta especialidade PRÓPRIA (contrato vigente, ou sessão/diária
   * dela). Pode ser menos gente que "quantas pessoas geraram valor aqui" —
   * ver o parâmetro `contarProfissional` de `add()` acima. */
  profissionais: string[]
}

export type TotalRPResumo = {
  /** PA + PPD + PEP + ETA de todo mundo — a parte que varia por sessão/entrega. */
  totalVariavel: number
  /** Valor fixo dos contratos vigentes em banco de horas. */
  totalBancoHoras: number
  /** Quantos profissionais têm valor fixo de banco de horas neste total. */
  profsBancoHoras: number
  /** totalVariavel + totalBancoHoras — e também a soma de porEspecialidade. */
  totalMes: number
  porEspecialidade: EspecialidadeTotal[]
}

type ProfParaDashboard = Pick<ProfRemunReal, "prof" | "sessoes" | "diariaDetalhe" | "etaBonusPeriodo" | "valorFixoBancoHoras" | "bancoHorasDetalhe">

export function calcularTotalPorEspecialidade(
  resultado: ProfParaDashboard[],
  pepPorProf?: Map<string, { alcancado: number }>,
  cadastroPrestadores?: Record<string, CadastroContratual>,
  especialidadeGeralPorProf?: Map<string, string>
): TotalRPResumo {
  const mapa: Record<string, { valor: number; profs: Set<string> }> = {}

  // `contarProfissional=false` soma o valor na barra sem listar a pessoa em
  // `profissionais` (nem contá-la em "N profissionais") — usado quando o
  // dinheiro é real daquela especialidade mas o profissional não a tem como
  // especialidade própria (ex.: substituição avulsa de quem é banco de horas
  // em outra função, ver PEP abaixo).
  const add = (esp: string | undefined | null, valor: number, prof: string, contarProfissional = true) => {
    if (!valor) return
    const key = esp || "Sem especialidade"
    if (!mapa[key]) mapa[key] = { valor: 0, profs: new Set() }
    mapa[key].valor += valor
    if (contarProfissional) mapa[key].profs.add(prof)
  }

  let totalBancoHoras = 0
  let profsBancoHoras = 0

  resultado.forEach(p => {
    if (p.valorFixoBancoHoras > 0) {
      totalBancoHoras += p.valorFixoBancoHoras
      profsBancoHoras++
      // Um item por contrato em banco de horas — cada um com sua própria
      // especialidade e valor, então soma direto na barra dela. Se o contrato
      // foi cadastrado sem `funcao` (formulário antigo), cai na especialidade
      // geral do profissional antes de virar "Sem especialidade".
      p.bancoHorasDetalhe.forEach(bh => {
        // `bh.funcao` já vem normalizado (normalizarFuncaoContrato em
        // calculo.ts) — "PS" é o balde interno de Aplicador ABA, mas quem
        // vem de sessão usa o nome cheio. Mesmo rótulo aqui evita abrir uma
        // barra "PS" separada de "Aplicador ABA (PS)" no dashboard/filtro.
        const esp = bh.funcao === FUNCAO_PS ? FUNCAO_PS_LABEL : bh.funcao
        add(esp || especialidadeGeralPorProf?.get(normKey(p.prof)), bh.valorTotal, p.prof)
      })
    }
    // PA por sessão: valorPA só é preenchido nas sessões que efetivamente entram
    // no acumulado (evolução própria ou substituição realizada) — ver calculo.ts.
    p.sessoes.forEach(s => {
      if (s.valorPA != null) add(s.especialidade, s.valorPA, p.prof)
    })
    // PPD (diária) já vem quebrado por especialidade.
    p.diariaDetalhe.forEach(dd => add(dd.esp, dd.total, p.prof))
    // PEP é exclusiva de Analista do Comportamento (Coordenador de Caso na
    // agenda) — vem de pep_apuracao_mensal, não mais de um campo em ProfRemunReal.
    // Quem tem contrato vigente de Coordenador de Caso conta normalmente. Quem
    // não tem (ex.: banco de horas que fez UMA substituição avulsa nessa
    // função) segue somando o valor na barra — é receita real do mês nessa
    // especialidade —, mas não entra na lista/filtro de profissionais dela,
    // já que não é a especialidade própria da pessoa.
    const pep = pepPorProf?.get(p.prof)?.alcancado ?? 0
    if (pep > 0) {
      const cadastro = cadastroPrestadores ? buscarCadastroContratual(cadastroPrestadores, p.prof) : null
      const temContratoAC = contratosAtuaisDoCadastro(cadastro).some(c => c.funcao === FUNCAO_AC)
      add("Coordenador de Caso", pep, p.prof, temContratoAC)
    }
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
