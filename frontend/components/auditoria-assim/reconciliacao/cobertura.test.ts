import { describe, expect, it } from 'vitest'
import { sessaoNaoSolicitada, sessaoSemCobertura } from './cobertura'
import type { AuditoriaAssimItem } from '../types'

/**
 * As duas perguntas que a tela faz sobre uma sessão descoberta, e por que elas
 * têm respostas diferentes.
 *
 * `sessaoSemCobertura` pergunta "alguém cobriu esta sessão?" — é o que a GRADE
 * precisa para marcar o cartão, e ali a sessão glosada conta: a recusa não
 * cobriu nada.
 *
 * `sessaoNaoSolicitada` pergunta "esta sessão é uma pendência que mais ninguém
 * está contando?" — é o que a LISTAGEM precisa, porque ali a mesma recusa já
 * entra como `glosa` pelo lado da autorização.
 *
 * O defeito que separou as duas (Yure Bernardo, agosto/2026): cinco sessões
 * glosadas em 03/08 e quatro nunca solicitadas em 07/08 saíam na linha como
 * "5 glosas + 9 não solicitadas", total 14, para nove sessões de trabalho.
 */

const CUTOFF = '2026-08-26T23:59'

function sessao(p: Partial<AuditoriaAssimItem>): AuditoriaAssimItem {
  return {
    bloco_id: null, paciente_id: null, paciente_nome: 'X', carteirinha: null,
    data_atendimento: '2026-08-03', hora_inicial: '13:00:00', codigo_tuss: null,
    convenio_nome: null, terapias: null, profissionais: null, quantidade_sessoes: null,
    guia: null, status_assim: null, codigo_erro: null, descricao_erro: null,
    data_execucao: null, situacao: null, prioridade: null, dias_atraso: null,
    possui_autorizacao: null, possui_solicitacao: null, observacao: null,
    motivo_glosa: null, teve_token: null, token: null, criado_por: null,
    forma_autorizacao: null, horario_autorizacao: null, guia_origem: null,
    observacao_manual: null, observacao_manual_atualizado_em: null,
    observacao_manual_atualizado_por_nome: null, token_conferido: null,
    token_conferido_em: null, token_conferido_por_nome: null, vinculo: null,
    ...p,
  }
}

describe('sessaoNaoSolicitada', () => {
  it('a sessão glosada está DESCOBERTA mas não é "não solicitada"', () => {
    // O caso exato de 03/08: as duas perguntas divergem, e é essa divergência
    // que impede a linha de contar a mesma recusa duas vezes.
    const s = sessao({ situacao: 'GLOSA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(true)
    expect(sessaoNaoSolicitada(s, CUTOFF)).toBe(false)
  })

  it('a cancelada também sai — `cancelamento` já a conta', () => {
    const s = sessao({ situacao: 'CANCELADA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(true)
    expect(sessaoNaoSolicitada(s, CUTOFF)).toBe(false)
  })

  it('a sessão que ninguém pediu conta nas duas', () => {
    // O caso de 07/08: sem veredito da ASSIM, nenhuma outra espécie a conta.
    const s = sessao({ situacao: 'NAO_SOLICITADA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(true)
    expect(sessaoNaoSolicitada(s, CUTOFF)).toBe(true)
  })

  it('as outras ausências de resposta continuam contando', () => {
    // Vocabulário medido em produção (clínica inteira, 03–26/08). Nenhuma delas
    // é veredito, então nenhuma é contada por outra espécie.
    for (const situacao of ['SOLICITACAO_CANCELADA', 'SINCRONIZANDO']) {
      expect(sessaoNaoSolicitada(sessao({ situacao }), CUTOFF), situacao).toBe(true)
    }
  })

  it('a sessão coberta não entra em nenhuma das duas', () => {
    for (const situacao of ['LIBERADA', 'GLOSA_RESOLVIDA']) {
      expect(sessaoNaoSolicitada(sessao({ situacao }), CUTOFF), situacao).toBe(false)
    }
  })

  it('falta não entra: a sessão não aconteceu', () => {
    for (const situacao of ['FALTA', 'FALTA_TERAPEUTA']) {
      expect(sessaoNaoSolicitada(sessao({ situacao }), CUTOFF), situacao).toBe(false)
    }
  })

  it('a sessão que ainda não decorreu não é pendência', () => {
    // Herda o corte de 30 minutos de `sessaoSemCobertura` — cobrar autorização
    // do que ainda vai acontecer transformaria a agenda inteira em vermelho.
    const s = sessao({ situacao: 'NAO_SOLICITADA', data_atendimento: '2026-08-28' })
    expect(sessaoNaoSolicitada(s, CUTOFF)).toBe(false)
  })

  it('o vínculo cobre a sessão e ela sai das duas', () => {
    // Uma guia externa vinculada à sessão glosada a torna GLOSA_RESOLVIDA, que
    // é cobertura — a linha para de pedir trabalho antes de a RPC concordar.
    const s = sessao({ situacao: 'GLOSA', bloco_id: 'b1' })
    const vinculos = new Map([['b1', { tipo: 'vinculo' as const }]])
    expect(sessaoSemCobertura(s, CUTOFF, vinculos)).toBe(false)
    expect(sessaoNaoSolicitada(s, CUTOFF, vinculos)).toBe(false)
  })
})
