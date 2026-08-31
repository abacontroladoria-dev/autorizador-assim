import { describe, expect, it } from 'vitest'
import { montarBlocoId } from './blocoId'
import { resolverStatus } from './severity'

describe('montarBlocoId', () => {
  const SESSAO = {
    paciente_id: '18565',
    data_atendimento: '2026-08-21',
    codigo_tuss: '22070384',
    horario: '08:00:00',
  }

  it('reproduz o concat_ws do banco', () => {
    expect(montarBlocoId(SESSAO)).toBe('18565_2026-08-21_22070384_08:00:00')
  })

  it('completa a hora sem segundos — o formato do banco tem três campos', () => {
    expect(montarBlocoId({ ...SESSAO, horario: '08:00' })).toBe(
      '18565_2026-08-21_22070384_08:00:00'
    )
  })

  it('descarta fração de segundo em vez de carregá-la para a chave', () => {
    expect(montarBlocoId({ ...SESSAO, horario: '08:00:00.000' })).toBe(
      '18565_2026-08-21_22070384_08:00:00'
    )
  })

  it('aceita paciente_id numérico e com espaço em volta', () => {
    expect(montarBlocoId({ ...SESSAO, paciente_id: 18565 })).toBe(
      '18565_2026-08-21_22070384_08:00:00'
    )
    expect(montarBlocoId({ ...SESSAO, paciente_id: ' 18565 ' })).toBe(
      '18565_2026-08-21_22070384_08:00:00'
    )
  })

  // Um bloco_id parcial não é um bloco_id mais fraco: é uma string que pode
  // casar com o bloco de outra sessão e afirmar cobertura onde não há.
  it('devolve null quando falta qualquer parte', () => {
    expect(montarBlocoId({ ...SESSAO, codigo_tuss: null })).toBeNull()
    expect(montarBlocoId({ ...SESSAO, paciente_id: null })).toBeNull()
    expect(montarBlocoId({ ...SESSAO, data_atendimento: '' })).toBeNull()
    expect(montarBlocoId({ ...SESSAO, horario: null })).toBeNull()
  })
})

describe('resolverStatus — glosa coberta por vínculo', () => {
  const VINCULO = { guia: '15032', vinculado_por: 'Fulano' }

  it('sem vínculo, a glosa continua pedindo tratativa', () => {
    const token = resolverStatus({ status_operacional: 'glosa' })
    expect(token.key).toBe('glosa')
    expect(token.label).toBe('Glosa')
    expect(token.severidade).toBe('critico')
  })

  it('com vínculo, vira Glosa Resolvida e sai da fila de trabalho', () => {
    const token = resolverStatus({ status_operacional: 'glosa', vinculo: VINCULO })
    expect(token.key).toBe('glosa_resolvida')
    expect(token.label).toBe('Glosa Resolvida')
    expect(token.severidade).toBe('resolvido')
  })

  // O vínculo só fala sobre glosa. Uma falta continua sendo falta: a sessão não
  // aconteceu, e uma guia não a faz acontecer (mesma regra de situacaoComVinculo).
  it('não mexe em status que não seja glosa', () => {
    expect(
      resolverStatus({ status_operacional: 'falta_paciente', vinculo: VINCULO }).key
    ).toBe('falta_paciente')
    expect(resolverStatus({ status_operacional: 'erro', vinculo: VINCULO }).key).toBe(
      'erro'
    )
  })
})
