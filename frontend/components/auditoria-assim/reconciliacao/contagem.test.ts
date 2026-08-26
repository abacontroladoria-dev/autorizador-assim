import { describe, expect, it } from 'vitest'
import { contarPendencias } from './contagem'
import type { PlacarTuss } from '../types'

/**
 * A regra que estes testes guardam é UMA: `autorizacao-a-mais` é a união de dois
 * conjuntos de guias, não a soma de dois números.
 *
 * Ela nasceu de um defeito real (2026-08-26). A listagem tinha cinco espécies, e
 * duas delas — "sem vínculo" (guias que sobraram do pareamento) e "sobrando" (o
 * saldo `liberadas − agendadas` por TUSS) — eram o mesmo fato medido por dois
 * caminhos. `contarPendencias` somava as duas, então a guia que é as duas coisas
 * (o caso COMUM, não o raro) entrava duas vezes no total que a operação lê para
 * dimensionar trabalho.
 *
 * Somar de novo passaria despercebido em qualquer teste que só olhasse o
 * caminho feliz: com conjuntos disjuntos, união e soma dão o mesmo número. Por
 * isso o primeiro caso aqui é justamente o da sobreposição.
 */

/** Placar neutro: nenhuma sessão descoberta, para isolar a espécie em teste. */
const SEM_FALTA: PlacarTuss[] = []

const LEDGER_LIMPO = { orfas: new Set<string>(), glosas: 0, canceladas: 0 }

describe('contarPendencias — autorizacao-a-mais', () => {
  it('conta UMA vez a guia que é órfã e excedente ao mesmo tempo', () => {
    // A mesma guia nos dois conjuntos — o caso que o defeito inflava.
    const c = contarPendencias(
      SEM_FALTA,
      { ...LEDGER_LIMPO, orfas: new Set(['G1']) },
      new Set(['G1'])
    )
    expect(c['autorizacao-a-mais']).toBe(1)
    expect(c.total).toBe(1)
  })

  it('soma as duas quando são guias diferentes', () => {
    // Os dois casos legítimos de divergência coexistindo: uma órfã que não
    // estourou cota e uma excedente que já foi triada (logo, não é órfã).
    const c = contarPendencias(
      SEM_FALTA,
      { ...LEDGER_LIMPO, orfas: new Set(['G1']) },
      new Set(['G2'])
    )
    expect(c['autorizacao-a-mais']).toBe(2)
    expect(c.total).toBe(2)
  })

  it('conta a órfã que não estourou cota', () => {
    const c = contarPendencias(
      SEM_FALTA,
      { ...LEDGER_LIMPO, orfas: new Set(['G1', 'G2']) },
      new Set()
    )
    expect(c['autorizacao-a-mais']).toBe(2)
  })

  it('conta a excedente que não é órfã', () => {
    const c = contarPendencias(SEM_FALTA, LEDGER_LIMPO, new Set(['G9']))
    expect(c['autorizacao-a-mais']).toBe(1)
  })

  it('é zero quando os dois conjuntos estão vazios', () => {
    const c = contarPendencias(SEM_FALTA, LEDGER_LIMPO, new Set())
    expect(c['autorizacao-a-mais']).toBe(0)
    expect(c.total).toBe(0)
  })
})

describe('contarPendencias — total', () => {
  it('soma as quatro espécies, com a-mais já deduplicada', () => {
    const placar: PlacarTuss[] = [
      {
        codigo_tuss: '2250',
        terapias: 'Fono',
        agendadas: 5,
        decorridas: 5,
        autorizadas: 4,
        liberadas: 4,
        canceladas: 0,
        excedente: 0,
        faltante: 3,
        naoSolicitada: 3,
      },
    ]
    const c = contarPendencias(
      placar,
      { orfas: new Set(['G1']), glosas: 2, canceladas: 1 },
      new Set(['G1']) // mesma guia: a-mais vale 1, não 2
    )
    expect(c).toMatchObject({
      glosa: 2,
      cancelamento: 1,
      'autorizacao-a-mais': 1,
      faltando: 3,
    })
    expect(c.total).toBe(7)
  })

  it('faltando vem da soma de `naoSolicitada` por TUSS', () => {
    const placar: PlacarTuss[] = [
      { codigo_tuss: '2250', terapias: 'Fono', agendadas: 2, decorridas: 2, autorizadas: 0, liberadas: 0, canceladas: 0, excedente: 0, faltante: 2, naoSolicitada: 2 },
      { codigo_tuss: '2251', terapias: 'TO', agendadas: 1, decorridas: 1, autorizadas: 0, liberadas: 0, canceladas: 0, excedente: 0, faltante: 1, naoSolicitada: 1 },
    ]
    const c = contarPendencias(placar, LEDGER_LIMPO, new Set())
    expect(c.faltando).toBe(3)
    expect(c.total).toBe(3)
  })

  /**
   * O caso Yure Bernardo (agosto/2026), que motivou a separação.
   *
   * Nove sessões descobertas: cinco glosadas em 03/08 e quatro nunca
   * solicitadas em 07/08. `faltante` vale 9 (nenhuma delas foi coberta) e
   * `naoSolicitada` vale 4. A linha dizia 5 + 9 = 14.
   */
  it('não conta a sessão glosada duas vezes (glosa + não solicitada)', () => {
    const placar: PlacarTuss[] = [
      { codigo_tuss: '2250', terapias: 'Fono', agendadas: 9, decorridas: 9, autorizadas: 5, liberadas: 0, canceladas: 0, excedente: 0, faltante: 9, naoSolicitada: 4 },
    ]
    const c = contarPendencias(placar, { ...LEDGER_LIMPO, glosas: 5 }, new Set())
    expect(c.glosa).toBe(5)
    expect(c.faltando).toBe(4)
    expect(c.total).toBe(9) // e não 14
  })
})
