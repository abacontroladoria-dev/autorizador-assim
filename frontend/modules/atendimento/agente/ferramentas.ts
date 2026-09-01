import type { AppointmentService } from '../services/appointment.service'
import type { AppointmentRepository } from '../repositories/appointment.repository'
import {
  SlotAlreadyBookedError,
  SlotInPastError,
  SlotNotInGradeError,
  AppointmentNotFoundError,
} from '../types/errors.types'
import { horaCurta } from './formato'
import { unidadeDaSala, normalizarUnidade, salaOculta, type Unidade } from './unidade'

// ============================================================================
// Ferramentas do agente de atendimento
//
// Esta é a superfície que o modelo de linguagem pode acionar. Duas decisões
// definem o formato:
//
// 1. As ferramentas NÃO falam com o banco. Elas chamam o AppointmentService, o
//    mesmo que a página de Agendamentos usa. Toda regra — vaga tem que existir
//    na grade, não pode estar no passado, não pode estar prometida a outro,
//    cancelar devolve a vaga — vale igual para o humano e para a IA. Se o
//    agente tivesse caminho próprio até o banco, seria só questão de tempo até
//    as duas superfícies discordarem.
//
// 2. Toda ferramenta retorna { ok: true, ... } ou { ok: false, motivo, mensagem }
//    e NUNCA lança. Exceção que sobe até o orquestrador vira turno perdido: o
//    paciente fica sem resposta no WhatsApp. Falha é dado, não exceção — o
//    modelo recebe o motivo e reformula ("esse horário acabou de ser preenchido,
//    posso oferecer 09:20?").
//
// O campo `motivo` é código estável para o orquestrador ramificar; `mensagem` é
// texto em português que o modelo pode aproveitar direto na resposta.
// ============================================================================

export interface ContextoAgente {
  orgId:           string
  // Conversa e contato de onde a solicitação veio. Amarram o agendamento ao
  // histórico do WhatsApp — é o que permite depois responder "seu horário é…".
  contactId?:      string | null
  conversationId?: string | null
  // Paciente do TiTa, quando já identificado na conversa.
  titaPacienteId?: number | null
}

export type ResultadoFerramenta =
  | { ok: true;  [k: string]: unknown }
  | { ok: false; motivo: string; mensagem: string }

// Motivos de recusa. Estáveis porque o orquestrador ramifica neles.
export const MOTIVO = {
  VAGA_TOMADA:      'vaga_tomada',
  VAGA_INEXISTENTE: 'vaga_inexistente',
  VAGA_NO_PASSADO:  'vaga_no_passado',
  NAO_ENCONTRADO:   'nao_encontrado',
  SEM_VAGA:         'sem_vaga',
  ERRO_INTERNO:     'erro_interno',
} as const

// ----------------------------------------------------------------------------
// Definições no formato de function calling
//
// Descrições escritas para o modelo, não para o desenvolvedor: elas são o
// contrato que ele lê para decidir quando chamar cada ferramenta. Por isso
// dizem explicitamente o que NÃO fazer — inventar horário é o erro mais caro
// que um atendente automático comete, e o modelo só evita se for instruído.
//
// STRICT MODE
//
// Todas as funções declaram `strict: true`, e por isso os schemas obedecem às
// três exigências do modo estrito da OpenAI:
//
//   1. `additionalProperties: false` em todo objeto.
//   2. TODA propriedade listada em `required` — não existe chave opcional.
//   3. O que é logicamente opcional vira tipo anulável (`['string','null']`),
//      e o modelo manda `null` explicitamente quando não quer usar.
//
// A exigência (1) é a que mais importa aqui, e não por conformidade: com
// `additionalProperties: false` a própria API recusa argumento que não esteja
// no schema. Como nenhum schema declara orgId, contactId ou conversationId, o
// modelo fica impedido de sequer tentar enviá-los — a defesa passa a ser
// estrutural em vez de depender de o executor lembrar de ignorá-los. O guard em
// `executar()` continua existindo como segunda camada, para o caso de
// `strict` ser desligado ou de outro provedor não honrar a restrição.
//
// A exigência (3) não muda o comportamento do executor: ele já tratava campo
// ausente e `null` do mesmo jeito (`args.x ?? null`, `toInt()` devolvendo
// undefined, `tipoValido()` caindo em 'other').
// ----------------------------------------------------------------------------

export const DEFINICOES_FERRAMENTAS = [
  {
    type: 'function' as const,
    function: {
      name: 'consultar_especialidades_disponiveis',
      description:
        'Lista as especialidades (terapias) que têm vaga livre na agenda da clínica, com a quantidade de vagas ' +
        'e em quais unidades cada uma tem vaga. ' +
        'Use quando o responsável perguntar o que a clínica tem disponível, ou quando ele não disser qual terapia quer. ' +
        'Chame esta ferramenta antes de consultar_horarios_disponiveis para descobrir o terapiaId correto.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          dataInicio: { type: ['string', 'null'], description: 'Início da busca, formato YYYY-MM-DD. Use null para começar hoje.' },
          dataFim:    { type: ['string', 'null'], description: 'Fim da busca, formato YYYY-MM-DD. Use null para usar hoje + 30 dias.' },
        },
        required: ['dataInicio', 'dataFim'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'consultar_horarios_disponiveis',
      description:
        'Lista horários realmente livres na agenda, com profissional e sala. NUNCA ofereça um horário que não tenha vindo desta ferramenta: ' +
        'a agenda da clínica só é populada algumas semanas à frente, e horários fora dela não existem. ' +
        'Se o responsável já disse em qual unidade quer ser atendido, passe esse valor em `unidade` — ' +
        'não filtre por conta própria olhando o campo `sala`, e não ofereça horário de outra unidade sem avisar. ' +
        'Ofereça no máximo 3 opções por mensagem para não sobrecarregar o responsável.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          terapiaId:  { type: ['integer', 'null'], description: 'Id da terapia, obtido em consultar_especialidades_disponiveis. null para todas.' },
          unidade: {
            type: ['string', 'null'],
            enum: ['Realengo', 'Fazendinha', 'Padre Miguel', null],
            description: 'Unidade onde o responsável quer ser atendido. null para buscar nas três.',
          },
          dataInicio: { type: ['string', 'null'],  description: 'Início da busca, YYYY-MM-DD. Use quando o responsável indicar preferência de data; null para começar hoje.' },
          dataFim:    { type: ['string', 'null'],  description: 'Fim da busca, YYYY-MM-DD. null para hoje + 30 dias.' },
          limite:     { type: ['integer', 'null'], description: 'Máximo de horários a retornar. null usa o padrão de 20.' },
        },
        required: ['terapiaId', 'unidade', 'dataInicio', 'dataFim', 'limite'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'agendar_sessao',
      description:
        'Reserva uma vaga para o paciente. Os três parâmetros precisam vir EXATAMENTE de um horário devolvido por ' +
        'consultar_horarios_disponiveis — não monte a combinação por conta própria. ' +
        'Confirme com o responsável antes de chamar: esta ferramenta grava a reserva.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          profissionalId: { type: 'integer', description: 'profissionalId do horário escolhido.' },
          data:           { type: 'string',  description: 'data do horário escolhido, YYYY-MM-DD.' },
          hora:           { type: 'string',  description: 'hora do horário escolhido, HH:MM.' },
          tipo: {
            type: ['string', 'null'],
            enum: ['triagem', 'retorno', 'reuniao', 'followup', 'other', null],
            description: 'triagem para primeira avaliação; retorno para paciente já em tratamento. null quando não souber.',
          },
          observacao: { type: ['string', 'null'], description: 'Informação que a recepção precisa saber (ex: preferência, restrição). null se não houver.' },
        },
        required: ['profissionalId', 'data', 'hora', 'tipo', 'observacao'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'consultar_agendamentos_do_contato',
      description:
        'Lista os agendamentos futuros já marcados para este contato. Use antes de reagendar ou cancelar, ' +
        'e quando o responsável perguntar quando é a próxima sessão. ' +
        'Não recebe parâmetro: o contato desta conversa é determinado pelo sistema.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reagendar_sessao',
      description:
        'Move um agendamento existente para outro horário livre. O horário de destino precisa ter vindo de ' +
        'consultar_horarios_disponiveis. Se o destino não estiver mais livre, o agendamento original é preservado.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          agendamentoId:  { type: 'string',  description: 'id do agendamento, obtido em consultar_agendamentos_do_contato.' },
          profissionalId: { type: 'integer', description: 'profissionalId do novo horário.' },
          data:           { type: 'string',  description: 'nova data, YYYY-MM-DD.' },
          hora:           { type: 'string',  description: 'nova hora, HH:MM.' },
          motivo:         { type: ['string', 'null'], description: 'Por que está sendo remarcado. null se o responsável não disser.' },
        },
        required: ['agendamentoId', 'profissionalId', 'data', 'hora', 'motivo'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancelar_sessao',
      description:
        'Cancela um agendamento e devolve a vaga à agenda. Confirme com o responsável antes de chamar.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          agendamentoId: { type: 'string', description: 'id do agendamento, obtido em consultar_agendamentos_do_contato.' },
          motivo:        { type: ['string', 'null'], description: 'Motivo informado pelo responsável. null se não informado.' },
        },
        required: ['agendamentoId', 'motivo'],
        additionalProperties: false,
      },
    },
  },
] as const

export type NomeFerramenta = typeof DEFINICOES_FERRAMENTAS[number]['function']['name']

// ----------------------------------------------------------------------------
// Executor
// ----------------------------------------------------------------------------

export class FerramentasAgente {
  constructor(
    private readonly agendamentos: AppointmentService,
    private readonly repo:         AppointmentRepository,
    private readonly contexto:     ContextoAgente,
  ) {}

  // Ponto único de entrada. Recebe o nome e os argumentos crus vindos do
  // modelo — nada aqui confia no formato, porque o modelo erra.
  //
  // Os argumentos passam por semChavesDeContexto() antes de qualquer uso: o
  // modelo não decide de qual organização, contato ou conversa é a operação.
  async executar(nome: string, argumentos: unknown): Promise<ResultadoFerramenta> {
    const args = semChavesDeContexto((argumentos ?? {}) as Record<string, unknown>)
    try {
      switch (nome) {
        case 'consultar_especialidades_disponiveis': return await this.consultarEspecialidades(args)
        case 'consultar_horarios_disponiveis':       return await this.consultarHorarios(args)
        case 'agendar_sessao':                       return await this.agendar(args)
        case 'consultar_agendamentos_do_contato':    return await this.consultarDoContato()
        case 'reagendar_sessao':                     return await this.reagendar(args)
        case 'cancelar_sessao':                      return await this.cancelar(args)
        default:
          return recusa(MOTIVO.ERRO_INTERNO, `Ferramenta desconhecida: ${nome}`)
      }
    } catch (err) {
      return this.traduzirErro(err)
    }
  }

  private async consultarEspecialidades(args: Record<string, any>): Promise<ResultadoFerramenta> {
    const terapias = await this.agendamentos.listarTerapiasComVaga(args.dataInicio ?? null, args.dataFim ?? null)

    if (terapias.length === 0) {
      return recusa(
        MOTIVO.SEM_VAGA,
        'Não há vaga livre na agenda no período consultado. A agenda costuma ser aberta algumas semanas antes.',
      )
    }

    return {
      ok: true,
      especialidades: terapias.map(t => ({
        terapiaId: t.terapiaId,
        // Nome pode vir como lista ("Aplicador ABA (PS), Psicopedagogia") quando
        // o profissional atende mais de uma especialidade naquele horário.
        nome:      t.terapiaNome,
        vagas:     t.vagas,
        // Unidades onde essa terapia tem vaga. Se o responsável já escolheu uma
        // unidade, use isto para não afirmar que a clínica atende ali antes de
        // conferir.
        unidades:  t.unidades,
      })),
    }
  }

  private async consultarHorarios(args: Record<string, any>): Promise<ResultadoFerramenta> {
    const limite  = clampInt(args.limite, 1, 50, 20)
    const unidade = normalizarUnidade(args.unidade)

    // O filtro por unidade acontece AQUI, não no banco: `unidade_id` é o mesmo
    // valor (280) em todas as vagas, e a unidade real só existe como texto
    // dentro de `sala_nome`. Ver modules/atendimento/agente/unidade.ts.
    //
    // Consequência: `limite` não pode ir para a RPC quando há filtro, senão as
    // primeiras N vagas podem ser todas de outra unidade e a resposta vira um
    // "não tem vaga" falso — exatamente o erro que se quer evitar. Buscamos
    // largo e cortamos depois.
    const vagasBrutas = await this.agendamentos.listarVagas({
      terapiaId:  toInt(args.terapiaId),
      dataInicio: args.dataInicio ?? null,
      dataFim:    args.dataFim ?? null,
      limite:     unidade ? 500 : limite,
    })

    const vagas = vagasBrutas
      // 'Sala Teste' vive na grade de produção e não é lugar de atender ninguém.
      .filter(v => !salaOculta(v.sala_nome))
      .filter(v => (unidade ? unidadeDaSala(v.sala_nome) === unidade : true))
      .slice(0, limite)

    if (vagas.length === 0) {
      // Distinguir os dois casos muda a resposta ao responsável: "não temos
      // essa terapia" é diferente de "temos, mas não nessa unidade". Sem essa
      // distinção o agente descarta a especialidade inteira.
      if (unidade && vagasBrutas.some(v => !salaOculta(v.sala_nome))) {
        const outras = [...new Set(
          vagasBrutas.map(v => unidadeDaSala(v.sala_nome)).filter((u): u is Unidade => u != null),
        )]
        return recusa(
          MOTIVO.SEM_VAGA,
          outras.length > 0
            ? `Não há horário livre para essa especialidade na unidade ${unidade}. ` +
              `Há vaga em: ${outras.join(', ')}. Diga isso ao responsável e pergunte se ele aceita outra unidade ou outra especialidade em ${unidade}.`
            : `Não há horário livre para essa especialidade na unidade ${unidade}.`,
        )
      }
      return recusa(
        MOTIVO.SEM_VAGA,
        'Nenhum horário livre para essa combinação. Ofereça outra especialidade ou outro período.',
      )
    }

    return {
      ok: true,
      horarios: vagas.map(v => ({
        // Estes três campos são a identidade da vaga; agendar_sessao precisa
        // deles de volta sem alteração.
        profissionalId: v.profissional_id,
        data:           v.data,
        hora:           horaCurta(v.hora_inicial),
        // Contexto para o modelo compor a frase
        diaSemana:    v.dia_semana,
        horaFim:      horaCurta(v.hora_final),
        profissional: v.profissional_nome,
        terapia:      v.terapia_nome,
        sala:         v.sala_nome,
        // A unidade real, extraída de sala_nome. `v.unidade_nome` é
        // 'CLÍNICA UNIVERSO ABA' em toda vaga e não distingue endereço nenhum —
        // mandá-lo para o modelo fazia as três unidades parecerem uma só.
        unidade:      unidadeDaSala(v.sala_nome),
      })),
    }
  }

  private async agendar(args: Record<string, any>): Promise<ResultadoFerramenta> {
    const profissionalId = toInt(args.profissionalId)
    if (profissionalId == null || !args.data || !args.hora) {
      return recusa(
        MOTIVO.ERRO_INTERNO,
        'Faltam profissionalId, data ou hora. Consulte os horários disponíveis e use exatamente os valores retornados.',
      )
    }

    const criado = await this.agendamentos.agendarVaga(this.contexto.orgId, {
      profissionalId,
      data:            String(args.data),
      hora:            String(args.hora),
      tipo:            tipoValido(args.tipo),
      descricao:       args.observacao ? String(args.observacao) : null,
      contactId:       this.contexto.contactId ?? null,
      conversationId:  this.contexto.conversationId ?? null,
      titaPacienteId:  this.contexto.titaPacienteId ?? null,
      criadoPorIa:     true,
    }, null)   // actorId null: quem agendou foi o agente, não um operador

    return {
      ok: true,
      agendamentoId: criado.id,
      confirmacao: {
        data:         criado.date,
        hora:         horaCurta(criado.time),
        duracaoMin:   criado.duration,
        profissional: criado.profissional_nome,
        terapia:      criado.terapia_nome,
        sala:         criado.sala_nome,
        unidade:      unidadeDaSala(criado.sala_nome),
      },
      // O agente não deve prometer que já está no sistema oficial da clínica.
      avisoInterno: 'Reserva registrada no atendimento. O lançamento no TiTa é feito pela recepção.',
    }
  }

  private async consultarDoContato(): Promise<ResultadoFerramenta> {
    if (!this.contexto.contactId) {
      return recusa(MOTIVO.NAO_ENCONTRADO, 'Não há contato identificado nesta conversa.')
    }

    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const de = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

    const { data } = await this.repo.list({
      orgId:     this.contexto.orgId,
      contactId: this.contexto.contactId,
      from:      de,
      // Só o que ocupa vaga: cancelado e falta não são "agendamento futuro".
      status:    ['scheduled', 'confirmed'],
      limit:     20,
      offset:    0,
    })

    if (data.length === 0) {
      return recusa(MOTIVO.NAO_ENCONTRADO, 'Este contato não tem agendamento futuro.')
    }

    return {
      ok: true,
      agendamentos: data.map(a => ({
        agendamentoId: a.id,
        data:          a.date,
        hora:          horaCurta(a.time),
        profissional:  a.profissional_nome,
        terapia:       a.terapia_nome,
        sala:          a.sala_nome,
        status:        a.status,
      })),
    }
  }

  private async reagendar(args: Record<string, any>): Promise<ResultadoFerramenta> {
    const profissionalId = toInt(args.profissionalId)
    if (!args.agendamentoId || profissionalId == null || !args.data || !args.hora) {
      return recusa(MOTIVO.ERRO_INTERNO, 'Faltam agendamentoId, profissionalId, data ou hora.')
    }

    const novo = await this.agendamentos.reagendar(
      this.contexto.orgId,
      String(args.agendamentoId),
      { profissionalId, data: String(args.data), hora: String(args.hora) },
      null,
      args.motivo ? String(args.motivo) : null,
    )

    return {
      ok: true,
      agendamentoId: novo.id,
      confirmacao: {
        data:         novo.date,
        hora:         horaCurta(novo.time),
        profissional: novo.profissional_nome,
        terapia:      novo.terapia_nome,
        sala:         novo.sala_nome,
      },
    }
  }

  private async cancelar(args: Record<string, any>): Promise<ResultadoFerramenta> {
    if (!args.agendamentoId) {
      return recusa(MOTIVO.ERRO_INTERNO, 'Falta agendamentoId.')
    }

    const cancelado = await this.agendamentos.cancelar(
      this.contexto.orgId,
      String(args.agendamentoId),
      null,
      args.motivo ? String(args.motivo) : null,
    )

    return {
      ok: true,
      agendamentoId: cancelado.id,
      cancelado: { data: cancelado.date, hora: horaCurta(cancelado.time) },
    }
  }

  // Traduz erro de domínio em recusa com motivo estável.
  // Cada motivo pede uma reação diferente do agente, e é por isso que os três
  // tipos de falha de vaga não são fundidos num "não deu".
  private traduzirErro(err: unknown): ResultadoFerramenta {
    if (err instanceof SlotAlreadyBookedError) {
      return recusa(MOTIVO.VAGA_TOMADA, 'Esse horário acabou de ser preenchido. Ofereça outro horário da lista.')
    }
    if (err instanceof SlotNotInGradeError) {
      return recusa(MOTIVO.VAGA_INEXISTENTE, 'Esse horário não existe na agenda da clínica. Consulte os horários disponíveis novamente e use exatamente um deles.')
    }
    if (err instanceof SlotInPastError) {
      return recusa(MOTIVO.VAGA_NO_PASSADO, 'Esse horário já passou. Ofereça uma data futura.')
    }
    if (err instanceof AppointmentNotFoundError) {
      return recusa(MOTIVO.NAO_ENCONTRADO, 'Agendamento não encontrado. Liste os agendamentos do contato antes de remarcar ou cancelar.')
    }

    // Erro inesperado: o agente não deve improvisar sobre a agenda. Logar e
    // devolver recusa genérica para que o orquestrador escale ao humano.
    console.error('[FerramentasAgente] erro inesperado', err)
    return recusa(MOTIVO.ERRO_INTERNO, 'Não consegui consultar a agenda agora. Encaminhe para a recepção.')
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function recusa(motivo: string, mensagem: string): ResultadoFerramenta {
  return { ok: false, motivo, mensagem }
}

// ----------------------------------------------------------------------------
// Contexto confiável: derivado do runtime, nunca do modelo
//
// Estes identificadores decidem DE QUEM é a operação. Vêm de `ContextoAgente`,
// montado pelo orquestrador a partir da conversa e do canal — nunca dos
// argumentos que o modelo produz.
//
// Por que a defesa é dupla:
//
//   1. Os schemas declaram `additionalProperties: false` com `strict: true`, e
//      nenhum deles lista estas chaves. A API recusa antes de chegar aqui.
//   2. Este filtro, que roda de qualquer forma.
//
// A segunda camada não é paranoia decorativa. O caminho do agente usa
// `createAppointmentSystemService()`, que é service role — a RLS de
// central.appointments NÃO se aplica, e o isolamento por organização passa a ser
// inteiramente responsabilidade do caller. Nesse regime, um `orgId` vindo do
// texto de um responsável no WhatsApp seria leitura e escrita em outra
// organização. O custo do filtro é um Object.entries por chamada; o custo de
// não tê-lo, no dia em que `strict` for desligado para depurar, é um vazamento
// entre organizações.
//
// Formas em snake_case e camelCase porque o modelo copia o vocabulário que vê:
// se um resultado de ferramenta mencionar `organization_id`, é essa a grafia
// que ele tentará repetir.
// ----------------------------------------------------------------------------
const CHAVES_DE_CONTEXTO: readonly string[] = [
  'orgId',          'organizationId',  'organization_id',
  'contactId',      'contact_id',
  'conversationId', 'conversation_id',
  'titaPacienteId', 'tita_paciente_id',
  // Quem executou e se foi a IA são fatos que o runtime registra; deixar o
  // modelo declará-los corromperia a auditoria de `created_by_ai`.
  'actorId',        'actor_id',
  'criadoPorIa',    'created_by_ai',
] as const

function semChavesDeContexto(args: Record<string, unknown>): Record<string, unknown> {
  const limpo: Record<string, unknown> = {}
  const rejeitadas: string[] = []

  for (const [chave, valor] of Object.entries(args)) {
    if (CHAVES_DE_CONTEXTO.includes(chave)) {
      rejeitadas.push(chave)
      continue
    }
    limpo[chave] = valor
  }

  // Descartar em silêncio esconderia tanto um bug de prompt quanto uma tentativa
  // de injeção. O valor NÃO é logado: pode conter dado de paciente.
  if (rejeitadas.length > 0) {
    console.warn(
      '[FerramentasAgente] argumentos de contexto vindos do modelo foram descartados:',
      rejeitadas.join(', '),
    )
  }

  return limpo
}

// O modelo às vezes manda número como string ("2270"). Aceitar os dois evita
// um turno inteiro perdido por causa de tipo.
function toInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    if (!isNaN(n)) return n
  }
  return undefined
}

function clampInt(v: unknown, min: number, max: number, padrao: number): number {
  const n = toInt(v)
  if (n == null) return padrao
  return Math.min(max, Math.max(min, n))
}

const TIPOS_ACEITOS = ['triagem', 'retorno', 'reuniao', 'followup', 'other'] as const

function tipoValido(v: unknown): 'triagem' | 'retorno' | 'reuniao' | 'followup' | 'other' {
  return (TIPOS_ACEITOS as readonly string[]).includes(String(v))
    ? (v as any)
    : 'other'
}
