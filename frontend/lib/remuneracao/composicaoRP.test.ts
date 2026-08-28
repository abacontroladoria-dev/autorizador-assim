// Testes da regra de composição da remuneração (/relacionamento-prestador/rp).
//
// Runner nativo do Node (v24 apaga os tipos e roda o .ts direto) — o `vitest` do
// package.json não está instalado nesta base. A partir de `frontend/`:
//
//   node --import ./test/resolve-ts.mjs --test lib/remuneracao/composicaoRP.test.ts
//
// O hook existe só porque o Node não resolve import relativo sem extensão; ver
// test/resolve-ts.mjs.
//
// Toda asserção de caso vem acompanhada das INVARIANTES UNIVERSAIS
// (`conferirInvariantes`), que valem para qualquer entrada. São elas que travam
// os três defeitos que este redesign corrige: percentual acima de 100%, sessão
// fora de toda aba, e duas contagens diferentes com o mesmo nome.

import test from "node:test"
import assert from "node:assert/strict"

import { composicaoRP } from "./composicaoRP"
import type { ProfRemunReal, SessaoComPapel } from "./calculo"

// ─── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0

/** Uma linha de sessão com só o que `bucketDaSessao` e a conta de R$ leem. */
function sessao(papel: string, classificacao: string, valorPA?: number): SessaoComPapel {
  seq += 1
  const dia = String((seq % 28) + 1).padStart(2, "0")
  return {
    id: `s${seq}`,
    data: `2026-08-${dia}`,
    hora: "08:00",
    papel,
    classificacao,
    valorPA,
    paciente: `Paciente ${seq}`,
    especialidade: "Psicologia",
  } as unknown as SessaoComPapel
}

const agenda = (cls: string, pa?: number) => sessao("Agenda", cls, pa)
const substituindo = (cls: string, pa?: number) => sessao("Substituição realizada", cls, pa)

type Extras = Partial<Pick<
  ProfRemunReal,
  "diariaPeriodo" | "etaBonusPeriodo" | "pe" | "valorConfirmado"
  | "modalidade" | "valorFixoBancoHoras" | "valorTotalAPagar"
>>

/**
 * Monta um `ProfRemunReal` sintético. Por padrão `valorConfirmado` é a soma
 * coerente das parcelas, para `paDivergente` ficar falso sem esforço — os testes
 * que querem o contrário passam o valor à mão.
 */
function prof(sessoes: SessaoComPapel[], extras: Extras = {}): ProfRemunReal {
  const paDasRemuneradas = sessoes.reduce((soma, s) => soma + (s.valorPA ?? 0), 0)
  const ppd = extras.diariaPeriodo ?? 0
  const eta = extras.etaBonusPeriodo ?? 0
  const pe = extras.pe ?? 0
  const confirmado = extras.valorConfirmado ?? paDasRemuneradas + ppd + eta + pe
  const fixo = extras.valorFixoBancoHoras ?? 0
  return {
    prof: "Fulano de Tal",
    sessoes,
    diariaPeriodo: ppd,
    etaBonusPeriodo: eta,
    pe,
    valorConfirmado: confirmado,
    modalidade: extras.modalidade ?? "atendimento",
    valorFixoBancoHoras: fixo,
    valorTotalAPagar: extras.valorTotalAPagar ?? confirmado + fixo,
  } as unknown as ProfRemunReal
}

// ─── Invariantes universais ──────────────────────────────────────────────────

function conferirInvariantes(p: ProfRemunReal) {
  const c = composicaoRP(p)
  const nosBuckets = Object.values(c.porBucket).reduce((n, lista) => n + lista.length, 0)

  // Partição: ninguém fica fora de toda aba, e ninguém aparece em duas.
  assert.equal(nosBuckets, p.sessoes.length, "toda sessão em exatamente um bucket")
  assert.equal(c.todas.length, p.sessoes.length, '"Todos" lista tudo')

  // A conta fecha por construção.
  assert.equal(c.validas, c.agendadas - c.canceladas - c.cedidas)
  assert.equal(c.baseRemuneravel, c.validas + c.substituicoes)

  // O numerador é subconjunto do denominador — o percentual não passa de 100%.
  assert.ok(c.remuneradas <= c.baseRemuneravel, `remuneradas ${c.remuneradas} <= base ${c.baseRemuneravel}`)
  assert.ok(c.pct <= 100, `pct ${c.pct} <= 100`)
  assert.ok(c.pct >= 0)

  // Um número, um nome: os dois lados da inconsistência somam o total.
  assert.equal(c.inconsistenciasProprias + c.substituicoesEmConferencia, c.inconsistencias)

  return c
}

// ─── Casos ───────────────────────────────────────────────────────────────────

test("vazio: sem sessões, sem base e sem percentual", () => {
  const c = conferirInvariantes(prof([]))
  assert.equal(c.agendadas, 0)
  assert.equal(c.baseRemuneravel, 0)
  assert.equal(c.remuneradas, 0)
  // A UI mostra "—" nesse caso; a regra devolve 0 sem dividir por zero.
  assert.equal(c.pct, 0)
  assert.equal(c.todas.length, 0)
})

test("caso completo: cada bucket com uma linha", () => {
  const c = conferirInvariantes(prof([
    agenda("Evolução normal", 50),
    agenda("Não evoluído"),
    agenda("Cancelado"),
    agenda("Substituição"),          // cedida a outro
    agenda("Evolução sem presença"), // inconsistência própria
    substituindo("Evolução normal", 50),
  ]))

  assert.equal(c.agendadas, 5)
  assert.equal(c.canceladas, 1)
  assert.equal(c.cedidas, 1)
  assert.equal(c.validas, 3)          // 5 − 1 − 1
  assert.equal(c.substituicoes, 1)
  assert.equal(c.baseRemuneravel, 4)  // 3 + 1
  assert.equal(c.remuneradas, 2)      // 1 própria + 1 substituição
  assert.equal(c.pendentes, 1)
  assert.equal(c.inconsistencias, 1)
  assert.equal(c.inconsistenciasProprias, 1)
  assert.equal(c.substituicoesEmConferencia, 0)
  assert.equal(c.pct, 50)
})

test("substituição entra nos DOIS lados: quem só substitui fecha em 100%", () => {
  // Fórmula antiga: baseCalc = 0 − 0 − 0 = 0 e numerador 3 → divisão por zero
  // com 3 sessões remuneradas na tela.
  const c = conferirInvariantes(prof([
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
  ]))

  assert.equal(c.agendadas, 0)
  assert.equal(c.substituicoes, 3)
  assert.equal(c.baseRemuneravel, 3)
  assert.equal(c.remuneradas, 3)
  assert.equal(c.pct, 100)
})

test("substituições acima da própria agenda não passam de 100%", () => {
  // Fórmula antiga: (2 + 5) / (2 − 0 − 0) = 350%.
  const c = conferirInvariantes(prof([
    agenda("Evolução normal", 50),
    agenda("Evolução normal", 50),
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
    substituindo("Evolução normal", 50),
  ]))

  assert.equal(c.baseRemuneravel, 7)
  assert.equal(c.remuneradas, 7)
  assert.equal(c.pct, 100)
})

test("exceção maior que a base: tudo cancelado ou cedido zera o denominador", () => {
  const c = conferirInvariantes(prof([
    agenda("Cancelado"),
    agenda("Feriado/Ponto Fac."),
    agenda("Substituição"),
    agenda("Substituição"),
  ]))

  assert.equal(c.agendadas, 4)
  assert.equal(c.canceladas, 2)
  assert.equal(c.cedidas, 2)
  assert.equal(c.validas, 0)
  assert.equal(c.baseRemuneravel, 0)
  assert.equal(c.pct, 0)
})

test("abaixo de 100%: pendência derruba o percentual, inconsistência também", () => {
  const c = conferirInvariantes(prof([
    agenda("Evolução normal", 50),
    agenda("Evolução normal", 50),
    agenda("Pendente retroativa"),
    agenda("Cancelado evoluído"), // inconsistência própria: está na base, não é remunerada
  ]))

  assert.equal(c.baseRemuneravel, 4)
  assert.equal(c.remuneradas, 2)
  assert.equal(c.pct, 50)
  assert.equal(c.pendentes, 1)
  assert.equal(c.inconsistenciasProprias, 1)
})

test('"Evolução duplicada" é remunerada, não some da tela', () => {
  // O card antigo só reconhecia "Evolução normal" no bloco "Recebe agora", e
  // não havia aba "Todos": essa linha não aparecia em lugar nenhum.
  const c = conferirInvariantes(prof([agenda("Evolução duplicada", 50)]))

  assert.equal(c.porBucket.comEvolucao.length, 1)
  assert.equal(c.remuneradas, 1)
  assert.equal(c.pct, 100)
  assert.equal(c.valorPA, 50)
})

test('"Evolução em conflito" é inconsistência dos dois lados', () => {
  // O filtro local do card antigo listava só 3 classes e omitia esta — a linha
  // não caía em bloco nenhum, enquanto o KPI (que usa as 4) já a contava.
  const c = conferirInvariantes(prof([
    agenda("Evolução em conflito"),
    substituindo("Evolução em conflito"),
  ]))

  assert.equal(c.inconsistencias, 2)
  assert.equal(c.inconsistenciasProprias, 1)
  assert.equal(c.substituicoesEmConferencia, 1)
  // A que está em conferência NÃO credita substituição nem entra na base.
  assert.equal(c.substituicoes, 0)
  assert.equal(c.remuneradas, 0)
  // A própria está na base (a sessão era desta pessoa) e não é remunerada.
  assert.equal(c.agendadas, 1)
  assert.equal(c.baseRemuneravel, 1)
  assert.equal(c.pct, 0)
})

test("parcelas de R$ fecham com valorConfirmado", () => {
  const c = conferirInvariantes(prof([
    agenda("Evolução normal", 50),
    agenda("Evolução normal", 50),
    substituindo("Evolução normal", 40),
    agenda("Cancelado"), // não soma PA
  ], { diariaPeriodo: 120, etaBonusPeriodo: 100, pe: 300 }))

  assert.equal(c.valorPA, 140)
  assert.equal(c.ppd, 120)
  assert.equal(c.bonusEta, 100)
  assert.equal(c.pe, 300)
  assert.equal(c.valorConfirmado, 660)
  assert.equal(c.paDivergente, false)
})

test("parcelas que não fecham com o total viram aviso, não silêncio", () => {
  const c = conferirInvariantes(prof(
    [agenda("Evolução normal", 50)],
    { valorConfirmado: 999 },
  ))
  assert.equal(c.valorPA, 50)
  assert.equal(c.paDivergente, true)
})

test("banco de horas puro: o fixo é a remuneração inteira", () => {
  const c = conferirInvariantes(prof(
    [agenda("Evolução normal", 0), agenda("Evolução normal", 0)],
    { modalidade: "banco_horas", valorFixoBancoHoras: 4000, valorConfirmado: 0 },
  ))

  assert.equal(c.emBancoDeHoras, true)
  assert.equal(c.soFixo, true)
  assert.equal(c.fixoNaoCadastrado, false)
  assert.equal(c.valorPA, 0)
  assert.equal(c.valorTotalAPagar, 4000)
  // A base de sessões continua existindo: o fixo cobre 2 sessões evoluídas.
  assert.equal(c.baseRemuneravel, 2)
  assert.equal(c.pct, 100)
})

test("banco de horas sem valor cadastrado é pendência, não R$ 0", () => {
  const c = conferirInvariantes(prof(
    [agenda("Evolução normal", 0)],
    { modalidade: "banco_horas", valorFixoBancoHoras: 0, valorConfirmado: 0 },
  ))
  assert.equal(c.fixoNaoCadastrado, true)
  assert.equal(c.valorTotalAPagar, 0)
})

test("híbrido conta como banco de horas sem ser só fixo", () => {
  const c = conferirInvariantes(prof(
    [agenda("Evolução normal", 50)],
    { modalidade: "hibrido", valorFixoBancoHoras: 2000 },
  ))
  assert.equal(c.emBancoDeHoras, true)
  assert.equal(c.soFixo, false)
  assert.equal(c.fixoNaoCadastrado, false)
  assert.equal(c.valorTotalAPagar, 2050)
})

test('"Todos" fica em ordem de data e inclui o que não conta', () => {
  const c = conferirInvariantes(prof([
    agenda("Cancelado"),
    agenda("Substituição"),
    agenda("Evolução normal", 50),
  ]))

  assert.equal(c.todas.length, 3)
  const datas = c.todas.map(s => s.data)
  assert.deepEqual([...datas].sort(), datas, "ordenado por data")
})
