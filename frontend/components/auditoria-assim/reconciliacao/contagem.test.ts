import { describe, expect, it } from 'vitest'
import {
  autorizacaoReincidencia,
  calcularLedger,
  contarPendencias,
  excedentesDoPlacar,
} from './contagem'
import type { AutorizacaoAssimSemana, PlacarTuss } from '../types'

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

const LEDGER_LIMPO = {
  orfas: new Set<string>(),
  reincidentes: new Set<string>(),
  glosas: 0,
  canceladas: 0,
}

function autorizacao(p: Partial<AutorizacaoAssimSemana> & { guia: string }): AutorizacaoAssimSemana {
  return {
    matricula: null, paciente_nome: null, data_execucao: null, status: 'Liberado',
    codigo_tuss: null, codigo_erro: null, descricao_erro: null, teve_token: null, token: null,
    ...p,
  }
}

const NUNCA_ORFA = () => false

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
  /**
   * O caso Theo Meneses (26/08), reportado da tela: "aparece uma glosa que não
   * existe". As seis sessões do dia estavam LIBERADA, cada uma com sua guia. O
   * que havia era a guia 405760, tirada 16 min depois da 405507 para o mesmo
   * TUSS, e recusada com `1601-REINCIDENCIA NO ATEN`.
   */
  it('a recusa por reincidência NÃO é glosa', () => {
    const ledger = calcularLedger(
      [
        autorizacao({ guia: '405507', status: 'Liberado' }),
        autorizacao({ guia: '405760', status: '1601-REINCIDENCIA NO ATEN' }),
      ],
      NUNCA_ORFA
    )
    expect(ledger.glosas).toBe(0)
    expect([...ledger.reincidentes]).toEqual(['405760'])

    const c = contarPendencias(SEM_FALTA, ledger, new Set())
    expect(c.glosa).toBe(0)
    expect(c['autorizacao-a-mais']).toBe(1)
    expect(c.total).toBe(1)
  })

  it('a reincidente que o placar já achou excedente conta UMA vez', () => {
    // O motivo de ela entrar na união e não numa soma: o pedido duplicado é,
    // com frequência, o mesmo que estourou a cota do TUSS.
    const ledger = calcularLedger(
      [autorizacao({ guia: 'G1', status: '1601-REINCIDENCIA NO ATEN' })],
      NUNCA_ORFA
    )
    const c = contarPendencias(SEM_FALTA, ledger, new Set(['G1']))
    expect(c['autorizacao-a-mais']).toBe(1)
    expect(c.total).toBe(1)
  })

  it('a glosa de verdade continua sendo glosa', () => {
    // A fronteira: 1013 é recusa de cadastro e pede tratativa com a ASSIM.
    const ledger = calcularLedger(
      [autorizacao({ guia: 'G9', status: '1013-CADASTRO DO BENEFICI' })],
      NUNCA_ORFA
    )
    expect(ledger.glosas).toBe(1)
    expect(ledger.reincidentes.size).toBe(0)
  })

  it('reconhece o 1601 pelo prefixo — o rótulo vem cortado em 25 caracteres', () => {
    expect(autorizacaoReincidencia('1601-REINCIDENCIA NO ATEN')).toBe(true)
    expect(autorizacaoReincidencia('1601-REINCIDENCIA NO ATENDIMENTO')).toBe(true)
    // Os outros códigos medidos em produção (agosto/2026) não podem casar.
    expect(autorizacaoReincidencia('1013-CADASTRO DO BENEFICI')).toBe(false)
    expect(autorizacaoReincidencia('1403-NAO EXISTE INFORMACA')).toBe(false)
    expect(autorizacaoReincidencia('Liberado')).toBe(false)
    expect(autorizacaoReincidencia(null)).toBe(false)
  })

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

/**
 * QUAL guia veste o número do excedente.
 *
 * A regra era posicional ("as últimas `excedente` liberações por
 * `data_execucao`"), justificada por um pareamento posicional do banco que
 * medição em produção mostrou não existir: cada sessão carrega a guia
 * autorizada NAQUELE DIA. O efeito era marcar uma guia que TEM sessão e deixar
 * a órfã sem marca — errado nos dois sentidos ao mesmo tempo, em 2 dos 3
 * excedentes de agosto/2026.
 */
describe('excedentesDoPlacar', () => {
  const placar = (excedente: number): PlacarTuss[] => [
    {
      codigo_tuss: '22070400', terapias: 'Psicomotricidade', agendadas: 7, decorridas: 7,
      autorizadas: 8, liberadas: 8, canceladas: 0, excedente, faltante: 0, naoSolicitada: 0,
    },
  ]

  /** O caso Theo Meneses, TUSS 22070400: a 51500 (05/08) é a que não tem sessão. */
  const DO_THEO = [
    autorizacao({ guia: '26824', codigo_tuss: '22070400', data_execucao: '2026-08-04T08:48:00' }),
    autorizacao({ guia: '51500', codigo_tuss: '22070400', data_execucao: '2026-08-05T07:57:00' }),
    autorizacao({ guia: '380679', codigo_tuss: '22070400', data_execucao: '2026-08-25T08:47:00' }),
    autorizacao({ guia: '405507', codigo_tuss: '22070400', data_execucao: '2026-08-26T08:57:00' }),
  ]
  const PAREADAS_DO_THEO = new Set(['26824', '380679', '405507'])

  it('marca a guia SEM sessão, não a mais recente', () => {
    const exc = excedentesDoPlacar(placar(1), DO_THEO, PAREADAS_DO_THEO)
    expect([...exc]).toEqual(['51500'])
  })

  it('nunca marca uma guia que já tem sessão', () => {
    const exc = excedentesDoPlacar(placar(1), DO_THEO, PAREADAS_DO_THEO)
    for (const guia of exc) expect(PAREADAS_DO_THEO.has(guia), guia).toBe(false)
  })

  it('recusada não entra: não gastou cota', () => {
    const com1601 = [
      ...DO_THEO,
      autorizacao({
        guia: '405760', codigo_tuss: '22070400',
        status: '1601-REINCIDENCIA NO ATEN', data_execucao: '2026-08-26T09:13:00',
      }),
    ]
    expect([...excedentesDoPlacar(placar(1), com1601, PAREADAS_DO_THEO)]).toEqual(['51500'])
  })

  it('sobrando mais sem-par que o excedente, fica com as mais recentes', () => {
    const pareadas = new Set(['26824'])
    // 51500, 380679 e 405507 estão sem par; o excedente é 2.
    const exc = excedentesDoPlacar(placar(2), DO_THEO, pareadas)
    expect([...exc].sort()).toEqual(['380679', '405507'])
  })

  it('sem nenhuma guia solta, o desempate por data responde', () => {
    // O excedente veio de outro lugar (sessão cancelada, por exemplo). O número
    // existe no placar e precisa de dono, senão a grade fica com um número no
    // topo e nenhum cartão marcado.
    const todasPareadas = new Set(['26824', '51500', '380679', '405507'])
    const exc = excedentesDoPlacar(placar(1), DO_THEO, todasPareadas)
    expect([...exc]).toEqual(['405507'])
  })

  it('o orçamento é por TUSS — o segundo não nasce cheio', () => {
    // `marcadas` acumula o mês inteiro; contar o orçamento nele faria o segundo
    // TUSS não marcar nada.
    const doisTuss: PlacarTuss[] = [
      { codigo_tuss: 'A', terapias: 'x', agendadas: 1, decorridas: 1, autorizadas: 2, liberadas: 2, canceladas: 0, excedente: 1, faltante: 0, naoSolicitada: 0 },
      { codigo_tuss: 'B', terapias: 'y', agendadas: 1, decorridas: 1, autorizadas: 2, liberadas: 2, canceladas: 0, excedente: 1, faltante: 0, naoSolicitada: 0 },
    ]
    const autz = [
      autorizacao({ guia: 'A1', codigo_tuss: 'A', data_execucao: '2026-08-01T08:00:00' }),
      autorizacao({ guia: 'A2', codigo_tuss: 'A', data_execucao: '2026-08-02T08:00:00' }),
      autorizacao({ guia: 'B1', codigo_tuss: 'B', data_execucao: '2026-08-01T09:00:00' }),
      autorizacao({ guia: 'B2', codigo_tuss: 'B', data_execucao: '2026-08-02T09:00:00' }),
    ]
    const exc = excedentesDoPlacar(doisTuss, autz, new Set(['A1', 'B1']))
    expect([...exc].sort()).toEqual(['A2', 'B2'])
  })

  it('sem `pareadas`, cai no comportamento antigo em vez de marcar tudo', () => {
    // Compatibilidade: o parâmetro é opcional e um chamador que não o passe não
    // pode ver o mês inteiro marcado.
    expect([...excedentesDoPlacar(placar(1), DO_THEO)]).toEqual(['405507'])
  })
})
