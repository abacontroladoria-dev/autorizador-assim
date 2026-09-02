import { describe, expect, it } from 'vitest'
import { feriadosDoPeriodo } from './feriadosDoPeriodo'
import type { FeriadoInfo } from '@/types/feriados'

function integral(nome: string): FeriadoInfo {
  return { nome, tipo: 'integral', horario_inicio: '00:00', horario_fim: '23:59' }
}

const FERIADOS: Record<string, FeriadoInfo> = {
  '2026-06-04': integral('Corpus Christi'),
  '2026-05-01': integral('Dia do Trabalho'),
  '2026-09-07': integral('Independência'),
}

describe('feriadosDoPeriodo — o recorte que legenda o pico da auditoria', () => {
  it('acha o feriado dentro do intervalo', () => {
    const achados = feriadosDoPeriodo(FERIADOS, '2026-06-01', '2026-06-30')
    expect(achados).toHaveLength(1)
    expect(achados[0]![0]).toBe('2026-06-04')
    expect(achados[0]![1].nome).toBe('Corpus Christi')
  })

  it('inclui as pontas — o intervalo é fechado dos dois lados', () => {
    // Um intervalo de um dia só, sobre o próprio feriado, é o caso da tela
    // quando alguém aponta o modal exatamente para 04/06.
    expect(feriadosDoPeriodo(FERIADOS, '2026-06-04', '2026-06-04')).toHaveLength(1)
    expect(feriadosDoPeriodo(FERIADOS, '2026-05-01', '2026-06-04')).toHaveLength(2)
  })

  it('não deixa vazar feriado de fora do intervalo', () => {
    expect(feriadosDoPeriodo(FERIADOS, '2026-06-05', '2026-09-06')).toEqual([])
  })

  it('devolve em ordem de data, independente da ordem do mapa', () => {
    // O mapa vem de um Record e sua ordem não é contrato — a lista lida na tela
    // precisa ser cronológica.
    const datas = feriadosDoPeriodo(FERIADOS, '2026-01-01', '2026-12-31').map(([d]) => d)
    expect(datas).toEqual(['2026-05-01', '2026-06-04', '2026-09-07'])
  })

  it('não seleciona nada com intervalo invertido ou vazio', () => {
    // Os campos de data do modal são editáveis à mão e passam por estados
    // inválidos enquanto se digita; "de > ate" não pode virar "o ano inteiro".
    expect(feriadosDoPeriodo(FERIADOS, '2026-12-31', '2026-01-01')).toEqual([])
    expect(feriadosDoPeriodo(FERIADOS, '', '2026-06-30')).toEqual([])
    expect(feriadosDoPeriodo(FERIADOS, '2026-06-01', '')).toEqual([])
  })

  it('sobrevive a não haver feriado cadastrado', () => {
    expect(feriadosDoPeriodo({}, '2026-06-01', '2026-06-30')).toEqual([])
  })

  it('compara sem construir Date — 04/06 não escorrega para 03/06', () => {
    // `new Date('2026-06-04')` é lido como UTC e volta um dia em São Paulo.
    // Se a comparação passasse por Date, um intervalo que começa no próprio
    // feriado o perderia.
    const achados = feriadosDoPeriodo(FERIADOS, '2026-06-04', '2026-06-05')
    expect(achados.map(([d]) => d)).toEqual(['2026-06-04'])
  })
})
