import { describe, expect, it } from 'vitest'
import { diasUteisDe, primeiraSegundaDoMes, segundaDe, somarDias } from './datas'

/**
 * A faixa de semanas do modal não pode oferecer uma semana vazia.
 *
 * O defeito (2026-08-26): a faixa começava em `segundaDe(dia 1 do mês)`, e
 * quando o dia 1 cai num sábado ou domingo essa segunda — e os cinco dias úteis
 * dela — ficam inteiramente no mês anterior. Em agosto/2026 a faixa abria
 * oferecendo 27/07–31/07, sem um único dia de agosto, e clicar nela mostrava
 * uma grade vazia.
 *
 * Não é caso de borda exótico: em 2026 acontece em fevereiro, março, agosto e
 * novembro. Por isso os testes varrem os 12 meses de dois anos em vez de checar
 * só o mês que motivou a correção.
 */
describe('primeiraSegundaDoMes', () => {
  it('é a própria segunda quando o dia 1 cai num dia útil', () => {
    // 2026-04-01 é quarta: a semana 30/03–03/04 já encosta em abril.
    expect(primeiraSegundaDoMes('2026-04-01')).toBe('2026-03-30')
    // 2026-01-01 é quinta.
    expect(primeiraSegundaDoMes('2026-01-01')).toBe('2025-12-29')
    // 2026-05-01 é sexta — a semana entra no mês por um dia só, e isso basta.
    expect(primeiraSegundaDoMes('2026-05-01')).toBe('2026-04-27')
  })

  it('avança uma semana quando o dia 1 cai num sábado', () => {
    // 2026-08-01 é sábado. Antes devolvia 2026-07-27 (só dias de julho).
    expect(primeiraSegundaDoMes('2026-08-01')).toBe('2026-08-03')
    expect(primeiraSegundaDoMes('2027-05-01')).toBe('2027-05-03')
  })

  it('avança uma semana quando o dia 1 cai num domingo', () => {
    expect(primeiraSegundaDoMes('2026-02-01')).toBe('2026-02-02')
    expect(primeiraSegundaDoMes('2026-03-01')).toBe('2026-03-02')
    expect(primeiraSegundaDoMes('2026-11-01')).toBe('2026-11-02')
  })

  it('aceita o mês sem o dia ("2026-08")', () => {
    expect(primeiraSegundaDoMes('2026-08')).toBe('2026-08-03')
  })

  it('devolve sempre uma segunda-feira', () => {
    for (const ano of [2026, 2027]) {
      for (let mes = 1; mes <= 12; mes++) {
        const alvo = primeiraSegundaDoMes(`${ano}-${String(mes).padStart(2, '0')}-01`)
        expect(segundaDe(alvo), `${ano}-${mes} devolveu ${alvo}`).toBe(alvo)
      }
    }
  })

  it('a semana devolvida SEMPRE tem ao menos um dia útil do mês', () => {
    // A invariante que o defeito violava — a única que de fato importa.
    for (const ano of [2026, 2027]) {
      for (let mes = 1; mes <= 12; mes++) {
        const chave = `${ano}-${String(mes).padStart(2, '0')}`
        const dias = diasUteisDe(primeiraSegundaDoMes(`${chave}-01`))
        expect(
          dias.filter((d) => d.slice(0, 7) === chave).length,
          `${chave} abriu em ${dias[0]}, semana ${dias.join(' ')}`
        ).toBeGreaterThan(0)
      }
    }
  })

  it('nunca pula trabalho — a semana ANTERIOR à devolvida não tem dia do mês', () => {
    // O outro lado do defeito: avançar demais esconderia sessões reais do começo
    // do mês. Esta é a invariante que impede as duas falhas de uma vez —
    // a semana devolvida encosta no mês (teste acima) e a de antes dela, não.
    for (const ano of [2026, 2027]) {
      for (let mes = 1; mes <= 12; mes++) {
        const chave = `${ano}-${String(mes).padStart(2, '0')}`
        const anterior = diasUteisDe(somarDias(primeiraSegundaDoMes(`${chave}-01`), -7))
        expect(
          anterior.filter((d) => d.slice(0, 7) === chave).length,
          `${chave}: a semana ${anterior.join(' ')} tem dia do mês e foi pulada`
        ).toBe(0)
      }
    }
  })
})
