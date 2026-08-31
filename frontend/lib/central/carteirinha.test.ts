import { describe, expect, it } from 'vitest'
import { fatiarCarteirinha, formatarCarteirinha } from './carteirinha'

describe('fatiarCarteirinha', () => {
  it('reproduz o corte do banco para o formato limpo de 15 dígitos', () => {
    // substring(x,1,6) / substring(x,7,7) / right(digitos,2)
    expect(fatiarCarteirinha('123456123456701')).toEqual({
      empresa: '123456',
      matricula: '1234567',
      dep: '01',
    })
  })

  it('a matrícula tem 7 dígitos — substring(x,7,7) é slice(6,13), não slice(6,7)', () => {
    expect(fatiarCarteirinha('123456123456701')?.matricula).toHaveLength(7)
  })

  it('normaliza a pontuação antes de cortar', () => {
    expect(fatiarCarteirinha('123456.1234567.01')).toEqual({
      empresa: '123456',
      matricula: '1234567',
      dep: '01',
    })
  })

  it('devolve null com dígitos faltando, em vez de um corte parcial', () => {
    // Um corte parcial viraria a carteirinha de outra pessoa no formulário da ASSIM.
    expect(fatiarCarteirinha('12345612345')).toBeNull()
  })

  it('devolve null para nulo, vazio e texto sem dígito', () => {
    expect(fatiarCarteirinha(null)).toBeNull()
    expect(fatiarCarteirinha(undefined)).toBeNull()
    expect(fatiarCarteirinha('')).toBeNull()
    expect(fatiarCarteirinha('sem numero')).toBeNull()
  })

  it('o dep vem dos DOIS ÚLTIMOS dígitos, não da posição 14', () => {
    // right(regexp_replace(...), 2) no original. Numa carteirinha mais longa que
    // 15 dígitos as duas leituras divergem, e a do banco é a de trás para frente.
    expect(fatiarCarteirinha('12345612345670199')?.dep).toBe('99')
  })
})

describe('formatarCarteirinha', () => {
  it('monta a forma legível com os pontos', () => {
    expect(formatarCarteirinha('123456123456701')).toBe('123456.1234567.01')
  })

  it('devolve null quando não há como fatiar', () => {
    expect(formatarCarteirinha('123')).toBeNull()
  })
})
