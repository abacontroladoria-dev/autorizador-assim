import { describe, expect, it } from 'vitest'
import { cartaoPendente, montarGrade } from './grade'
import { sessaoSemCobertura } from './cobertura'
import type { AuditoriaAssimItem, AutorizacaoAssimSemana, PlacarTuss } from '../types'

const DIAS = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']

/** Nada marcado — o cenário dos testes de posicionamento, que não olham marca. */
const SEM_MARCAS = { descoberta: () => false, decorrida: () => true, excedentes: new Set<string>() }

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
      [], () => 'fora-da-semana', DIAS, PLACAR, SEM_MARCAS
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
      [], () => 'fora-da-semana', DIAS, PLACAR, SEM_MARCAS
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
      () => 'sem-vinculo', DIAS, PLACAR, SEM_MARCAS
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
      DIAS, PLACAR, SEM_MARCAS
    )
    const cartoes = todos(linhas)
    expect(cartoes).toHaveLength(1)
    expect(cartoes[0].tipo === 'autorizacao' && cartoes[0].guia).toBe('orfa')
    expect(cartoes[0].terapia).toBe('Terapia Ocupacional')
  })

  it('ignora o que cai fora dos dias úteis da semana', () => {
    const linhas = montarGrade(
      [sessao({ bloco_id: 'sabado', data_atendimento: '2026-08-22', hora_inicial: '09:00:00' })],
      [], () => 'fora-da-semana', DIAS, PLACAR, SEM_MARCAS
    )
    expect(linhas).toEqual([])
  })

  it('carimba as marcas que a listagem promete: sem cobertura e excedente', () => {
    const linhas = montarGrade(
      [
        sessao({ bloco_id: 'descoberta', data_atendimento: DIAS[0], hora_inicial: '09:00:00' }),
        sessao({ bloco_id: 'ok', data_atendimento: DIAS[0], hora_inicial: '10:00:00' }),
      ],
      [
        guia({ guia: 'normal', data_execucao: `${DIAS[1]}T09:00:00` }),
        guia({ guia: 'demais', data_execucao: `${DIAS[1]}T10:00:00` }),
      ],
      () => 'fora-da-semana',
      DIAS,
      PLACAR,
      {
        descoberta: (s) => s.bloco_id === 'descoberta',
        decorrida: () => true,
        excedentes: new Set(['demais']),
      }
    )
    const porChave = new Map(todos(linhas).map((c) => [c.chave, c]))
    expect(porChave.get('descoberta')).toMatchObject({ tipo: 'sessao', semCobertura: true })
    expect(porChave.get('ok')).toMatchObject({ tipo: 'sessao', semCobertura: false })
    expect(porChave.get(`guia-demais-${DIAS[1]}T10:00:00`)).toMatchObject({ excedente: true })
    expect(porChave.get(`guia-normal-${DIAS[1]}T09:00:00`)).toMatchObject({ excedente: false })
  })
})

/**
 * O predicado que decide a silhueta do cartão E o que o navegador do rodapé
 * percorre. São o mesmo, de propósito: divergirem faria o rodapé prometer "3
 * pendências" e a grade destacar duas.
 */
describe('cartaoPendente', () => {
  const base = { chave: 'k', hora: '09:00', codigo_tuss: null, terapia: null } as const
  const linha = sessao({})

  it('promove a sessão descoberta e a que está em glosa, mas não a liberada', () => {
    const sessaoBase = { ...base, tipo: 'sessao', guia: null, legenda: null, motivoBruto: null, teve_token: null, token: null, decorrida: true, origem: linha } as const
    expect(cartaoPendente({ ...sessaoBase, situacao: 'LIBERADA', semCobertura: false })).toBe(false)
    expect(cartaoPendente({ ...sessaoBase, situacao: 'GLOSA_RESOLVIDA', semCobertura: false })).toBe(false)
    expect(cartaoPendente({ ...sessaoBase, situacao: 'GLOSA', semCobertura: false })).toBe(true)
    // Vencida é pendência mesmo quando a situação, sozinha, não seria.
    expect(cartaoPendente({ ...sessaoBase, situacao: 'SINCRONIZANDO', semCobertura: false })).toBe(false)
    expect(cartaoPendente({ ...sessaoBase, situacao: 'SINCRONIZANDO', semCobertura: true })).toBe(true)
  })

  it('promove a guia órfã e a excedente, e deixa a de outra semana quieta', () => {
    const guiaBase = { ...base, tipo: 'autorizacao', guia: 'g', status: 'Liberado', descricao_erro: null, teve_token: null, token: null, origem: guia({ guia: 'g' }) } as const
    expect(cartaoPendente({ ...guiaBase, estado: 'fora-da-semana', excedente: false })).toBe(false)
    expect(cartaoPendente({ ...guiaBase, estado: 'sem-vinculo', excedente: false })).toBe(true)
    expect(cartaoPendente({ ...guiaBase, estado: 'fora-da-semana', excedente: true })).toBe(true)
  })
})

/**
 * A regra que substituiu `decorridas − liberadas`. O caso que importa é o
 * último: a subtração fechava zero e escondia a sessão descoberta.
 */
describe('sessaoSemCobertura', () => {
  const CUTOFF = '2026-08-19T12:00'

  it('não cobra do que ainda não venceu', () => {
    const s = sessao({ data_atendimento: DIAS[4], hora_inicial: '09:00:00', situacao: 'NAO_SOLICITADA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(false)
  })

  it('não cobra de falta — a sessão não aconteceu', () => {
    const s = sessao({ data_atendimento: DIAS[0], hora_inicial: '09:00:00', situacao: 'FALTA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(false)
  })

  it('não cobra do que já saiu liberado, nem da glosa que o vínculo cobriu', () => {
    for (const situacao of ['LIBERADA', 'GLOSA_RESOLVIDA']) {
      const s = sessao({ data_atendimento: DIAS[0], hora_inicial: '09:00:00', situacao })
      expect(sessaoSemCobertura(s, CUTOFF)).toBe(false)
    }
  })

  it('aponta a sessão decorrida que ninguém liberou', () => {
    const s = sessao({ data_atendimento: DIAS[0], hora_inicial: '09:00:00', situacao: 'GLOSA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(true)
  })

  it('continua cobrando da CANCELADA — a liberação foi desfeita', () => {
    // `CANCELADA` é `status = 'Liberado *'`: a ASSIM desfez a liberação, então
    // nada cobre a sessão e ela segue passível de vínculo com uma guia solta.
    // Só a MANCHETE do cartão muda (ver SITUACOES_COM_VEREDITO) — a pendência
    // não, e é o que este caso pina.
    const s = sessao({ data_atendimento: DIAS[0], hora_inicial: '09:00:00', situacao: 'CANCELADA' })
    expect(sessaoSemCobertura(s, CUTOFF)).toBe(true)
    expect(
      cartaoPendente({
        tipo: 'sessao', chave: 'k', hora: '09:00', codigo_tuss: null, terapia: null,
        guia: null, legenda: null, motivoBruto: null, teve_token: null, token: null,
        decorrida: true, origem: s, situacao: 'CANCELADA', semCobertura: true,
      })
    ).toBe(true)
  })

  it('sem horário, só conta a partir do dia seguinte', () => {
    const hoje = sessao({ data_atendimento: CUTOFF.slice(0, 10), hora_inicial: null, situacao: 'GLOSA' })
    const ontem = sessao({ data_atendimento: DIAS[0], hora_inicial: null, situacao: 'GLOSA' })
    expect(sessaoSemCobertura(hoje, CUTOFF)).toBe(false)
    expect(sessaoSemCobertura(ontem, CUTOFF)).toBe(true)
  })
})
