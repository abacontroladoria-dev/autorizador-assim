import { describe, expect, it } from 'vitest'
import { montarGrade } from './grade'
import type { AuditoriaAssimItem, AutorizacaoAssimSemana, PlacarTuss } from '../types'

const DIAS = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']

function sessao(p: Partial<AuditoriaAssimItem>): AuditoriaAssimItem {
  return {
    bloco_id: null, paciente_id: null, paciente_nome: 'X', carteirinha: null,
    data_atendimento: null, hora_inicial: null, codigo_tuss: null, convenio_nome: null,
    terapias: null, profissionais: null, quantidade_sessoes: null, guia: null,
    status_assim: null, codigo_erro: null, descricao_erro: null, data_execucao: null,
    situacao: null, prioridade: null, dias_atraso: null, possui_autorizacao: null,
    possui_solicitacao: null, observacao: null, motivo_glosa: null, teve_token: null,
    token: null, criado_por: null, forma_autorizacao: null, horario_autorizacao: null,
    observacao_manual: null, observacao_manual_atualizado_em: null,
    observacao_manual_atualizado_por_nome: null, token_conferido: null,
    token_conferido_em: null, token_conferido_por_nome: null,
    ...p,
  }
}

function guia(p: Partial<AutorizacaoAssimSemana> & { guia: string }): AutorizacaoAssimSemana {
  return {
    matricula: null, paciente_nome: null, data_execucao: null, status: 'Liberado',
    codigo_tuss: null, codigo_erro: null, descricao_erro: null, teve_token: null, token: null,
    ...p,
  }
}

const PLACAR: PlacarTuss[] = [
  { codigo_tuss: '22070400', terapias: 'Terapia Ocupacional', agendadas: 0, decorridas: 0, autorizadas: 0, liberadas: 0, canceladas: 0, excedente: 0, faltante: 0 },
]

const todos = (linhas: ReturnType<typeof montarGrade>) =>
  linhas.flatMap((l) => DIAS.flatMap((d) => l.celulas[d]))

describe('montarGrade por horário', () => {
  it('agrupa por hora cheia e mantém a escala contínua', () => {
    const linhas = montarGrade(
      [
        sessao({ bloco_id: 'a', data_atendimento: DIAS[0], hora_inicial: '08:00:00', codigo_tuss: '22070400' }),
        sessao({ bloco_id: 'b', data_atendimento: DIAS[3], hora_inicial: '17:20:00', codigo_tuss: '22070400' }),
      ],
      [], () => 'fora-da-semana', DIAS, PLACAR
    )
    expect(linhas.map((l) => l.hora)).toEqual([
      '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    ])
    expect(linhas[0].celulas[DIAS[0]]).toHaveLength(1)
    expect(linhas[9].celulas[DIAS[3]][0].hora).toBe('17:20')
  })

  it('põe dois atendimentos da mesma faixa na mesma célula, em ordem', () => {
    const linhas = montarGrade(
      [
        sessao({ bloco_id: 'tarde', data_atendimento: DIAS[1], hora_inicial: '14:40:00' }),
        sessao({ bloco_id: 'cedo', data_atendimento: DIAS[1], hora_inicial: '14:00:00' }),
      ],
      [], () => 'fora-da-semana', DIAS, PLACAR
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0].celulas[DIAS[1]].map((c) => c.chave)).toEqual(['cedo', 'tarde'])
  })

  it('não perde atendimento nenhum e joga o sem-horário para o fim', () => {
    const linhas = montarGrade(
      [
        sessao({ bloco_id: 'a', data_atendimento: DIAS[0], hora_inicial: '09:20:00' }),
        sessao({ bloco_id: 'sem', data_atendimento: DIAS[0], hora_inicial: null }),
      ],
      [guia({ guia: '111', data_execucao: `${DIAS[2]}T14:34:00`, codigo_tuss: '22070400' })],
      () => 'sem-vinculo', DIAS, PLACAR
    )
    expect(todos(linhas)).toHaveLength(3)
    expect(linhas[linhas.length - 1].hora).toBe('—')
    expect(linhas[linhas.length - 1].celulas[DIAS[0]][0].chave).toBe('sem')
  })

  it('guia pareada não vira cartão próprio, e a órfã herda o nome da terapia', () => {
    const linhas = montarGrade(
      [],
      [
        guia({ guia: 'pareada', data_execucao: `${DIAS[0]}T10:00:00`, codigo_tuss: '22070400' }),
        guia({ guia: 'orfa', data_execucao: `${DIAS[0]}T10:05:00`, codigo_tuss: '22070400' }),
      ],
      (g) => (g === 'pareada' ? 'pareada' : 'sem-vinculo'),
      DIAS, PLACAR
    )
    const cartoes = todos(linhas)
    expect(cartoes).toHaveLength(1)
    expect(cartoes[0].tipo === 'autorizacao' && cartoes[0].guia).toBe('orfa')
    expect(cartoes[0].terapia).toBe('Terapia Ocupacional')
  })

  it('ignora o que cai fora dos dias úteis da semana', () => {
    const linhas = montarGrade(
      [sessao({ bloco_id: 'sabado', data_atendimento: '2026-08-22', hora_inicial: '09:00:00' })],
      [], () => 'fora-da-semana', DIAS, PLACAR
    )
    expect(linhas).toEqual([])
  })
})
