import { describe, expect, it } from 'vitest'
import { MARCA_COBERTURA, semTrechoDeCobertura } from './observacaoVinculo'

/** A observação real de uma GLOSA_RESOLVIDA, como a RPC a monta. */
const COBERTA =
  'Glosa: 1403 - NAO EXISTE INFORMACAO · Coberta pela guia 15032 de 03/08/2026 14:39 — vínculo por Fulano'

describe('semTrechoDeCobertura', () => {
  it('devolve só o motivo da recusa quando o texto traz a cobertura', () => {
    expect(semTrechoDeCobertura(COBERTA)).toBe('Glosa: 1403 - NAO EXISTE INFORMACAO')
  })

  it('não toca no texto de uma glosa sem cobertura', () => {
    const glosa = 'Glosa: 1013 - CADASTRO DO BENEFICIARIO COM PROBLEMAS'
    expect(semTrechoDeCobertura(glosa)).toBe(glosa)
  })

  // Guardas contra o corte silencioso: se o separador mudar no SQL, o teste
  // acima falha antes de a legenda começar a comer o motivo da recusa.
  it('corta no separador exato do SQL', () => {
    expect(COBERTA).toContain(MARCA_COBERTURA)
    expect(MARCA_COBERTURA).toBe(' · Coberta pela guia ')
  })

  it('não confunde a palavra "coberta" no meio de um motivo', () => {
    const motivo = 'Glosa: 1201 - SESSAO NAO COBERTA PELO CONTRATO'
    expect(semTrechoDeCobertura(motivo)).toBe(motivo)
  })

  it('sobrevive a texto vazio', () => {
    expect(semTrechoDeCobertura('')).toBe('')
  })
})
