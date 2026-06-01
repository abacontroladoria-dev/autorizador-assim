import { getSupabaseClient } from '@/lib/supabase/client'
import type { AgendaEvent, AgendaFilterOptions, AgendaFilters, AgendaMode } from '@/types/agenda'

const supabase = getSupabaseClient()

// ─── Mapa de cores das terapias ──────────────────────────────────────────────
// Fonte: docs/terapias-cores.md
// Aplicado apenas na borda esquerda do evento (fundo sempre branco)
const TERAPIA_ACCENT: Record<string, string> = {
  'Aplicador ABA (AE)':                    '#E89D9D',
  'Aplicador ABA (EF)':                    '#57E6D6',
  'Aplicador ABA (PS)':                    '#D4A9F5',
  'Aplicador ABA (SF)':                    '#BDB8BF',
  'Aplicador ABA Casa':                    '#BDB8BF',
  'Aplicador ABA Escola':                  '#A9A2A2',
  'Aplicador Suporte':                     '#C3F5D0',
  'Arteterapia':                           '#E89D9D',
  'Arteterapia (Psicologia ABA)':          '#FFAD98',
  'Coordenador de Caso':                   '#A560E5',
  'Equoterapia':                           '#946D05',
  'Fisioterapia':                          '#54E8E3',
  'Fisioterapia Aquática':                 '#9DD0FD',
  'Fonoaudiologia':                        '#E0B00F',
  'Habilidades Sociais (Psicologia ABA)':  '#8C7A7A',
  'Musicoterapia':                         '#FFAD98',
  'Musicalização':                         '#FFD580',
  'Nutrição':                              '#BCF47C',
  'OFERECER CONSULTA NUTRIÇÃO':            '#54A9FA',
  'Oficina de Aprendizagem':               '#A8D8EA',
  'Psicoeducação':                         '#E996F1',
  'Psicologia':                            '#C81ED5',
  'Psicologia ABA':                        '#B57BEE',
  'Psicomotricidade':                      '#39A8F9',
  'Psicopedagogia':                        '#D4B800',
  'Supervisão ABA':                        '#4B4B4B',
  'Terapia Alimentar':                     '#95EF9C',
  'Terapia Ocupacional':                   '#0B13CA',
  'Triagem':                               '#EE8F00',
  'Trilha Socioemocional':                 '#8BC4A8',
  'Visita Guiada':                         '#EC62E5',
  'Circuito Funcional':                    '#F4A261',
  'Cozinha Funcional':                     '#95C17B',
  'Esporte Adaptado':                      '#6DB6C3',
  'Estágio':                               '#B0BCCC',
  'Avaliação Neuropsicológica':            '#7B8FA8',
  'Facilitador Técnico':                   '#9BB0C1',
}

const FALLBACK_ACCENT  = '#94A3B8' // slate-400 — terapias não mapeadas
const DARK_TEXT        = '#374151' // slate-700

// Acento de status: borda esquerda colorida
const STATUS_ACCENT: Record<string, string> = {
  livre:     '#34D399', // emerald-400
  conflito:  '#F87171', // red-400
  bloqueado: '#D1D5DB', // gray-300
}

// Gera fundo suave (~9% opacidade) a partir do hex da cor de acento
function toSoftBg(hex: string): string {
  return `${hex}0D`
}

function getAccent(terapia: string | null): string {
  if (!terapia) return FALLBACK_ACCENT
  return TERAPIA_ACCENT[terapia] ?? FALLBACK_ACCENT
}

function getEventColor(terapia: string | null, status: string | null) {
  const border =
    status === 'conflito'  ? STATUS_ACCENT.conflito  :
    status === 'bloqueado' ? STATUS_ACCENT.bloqueado :
    status === 'livre'     ? STATUS_ACCENT.livre     :
    getAccent(terapia)

  return { bg: toSoftBg(border), border, text: DARK_TEXT }
}

export const THERAPY_COLORS: Record<string, { bg: string; border: string; text: string }> =
  Object.fromEntries(
    Object.entries(TERAPIA_ACCENT).map(([label, accent]) => [
      label,
      { bg: toSoftBg(accent), border: accent, text: DARK_TEXT },
    ])
  )

function toISO(date: string, time: string | null | undefined): string {
  if (!time) return date
  const t = time.length === 5 ? `${time}:00` : time
  const [h, m] = t.split(':').map(Number)
  // Slots de tarde partem de 13:20 no grid (08:00 + n×40min), mas o banco
  // armazena 13:00, 13:40, 14:20… Soma +20min para alinhar ao slot correto.
  if (h >= 13) {
    const total = h * 60 + m + 20
    const nh = Math.floor(total / 60)
    const nm = total % 60
    return `${date}T${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:00`
  }
  return `${date}T${t}`
}

function transformRows(rows: Record<string, unknown>[], mode: AgendaMode): AgendaEvent[] {
  return rows.map((row) => {
    const terapia = (row.terapia_nome as string) ?? ''
    const status  = ''
    const color   = getEventColor(terapia, status)
    const data    = (row.data_atendimento as string) ?? ''
    const sala    = (row.sala_nome as string) ?? ''

    const title =
      mode === 'terapeutas' ? ((row.paciente_nome as string) ?? '—')
      : mode === 'pacientes' ? ((row.profissional_nome as string) ?? '—')
      : sala || '—'

    return {
      id:              String(row.tita_agendamento_id),
      title,
      start:           toISO(data, row.hora_inicial as string),
      end:             toISO(data, row.hora_final as string),
      resourceId:      mode === 'salas' ? sala : undefined,
      backgroundColor: color.bg,
      borderColor:     color.border,
      textColor:       color.text,
      extendedProps: {
        paciente:     (row.paciente_nome as string) ?? '',
        terapeuta:    (row.profissional_nome as string) ?? '',
        terapeuta_id: row.profissional_id as string | number,
        sala,
        terapia,
        status,
        unidade:    (row.clinica_nome as string) ?? '',
        observacao: '',
        tipo:       'regular' as const,
        checkin:    false,
        presenca:   false,
      },
    }
  })
}

export async function buscarAgenda(
  mode: AgendaMode,
  dataInicio: string,
  dataFim: string,
  filters: AgendaFilters,
): Promise<AgendaEvent[]> {
  let query = supabase
    .from('agenda_tita_autorizacao_v2')
    .select(`
      tita_agendamento_id,
      data_atendimento,
      paciente_nome,
      profissional_id,
      profissional_nome,
      terapia_nome,
      hora_inicial,
      hora_final,
      sala_nome,
      clinica_nome
    `)
    .gte('data_atendimento', dataInicio)
    .lte('data_atendimento', dataFim)
    .order('data_atendimento', { ascending: true })
    .order('hora_inicial', { ascending: true })
    .not('hora_inicial', 'is', null)
    .not('clinica_nome', 'ilike', '%INATIVA%')

  if (filters.paciente)  query = query.ilike('paciente_nome', `%${filters.paciente}%`)
  if (filters.unidade)   query = query.eq('clinica_nome', filters.unidade)
  if (filters.terapeuta) query = query.ilike('profissional_nome', `%${filters.terapeuta}%`)
  if (filters.terapia)   query = query.eq('terapia_nome', filters.terapia)
  if (filters.sala)      query = query.ilike('sala_nome', `%${filters.sala}%`)

  const { data, error } = await query
  if (error) {
    console.error('[agenda.service]', error)
    return []
  }

  return transformRows((data ?? []) as Record<string, unknown>[], mode)
}

export async function buscarGradeSlots(
  terapeuta: string,
  dataInicio: string,
  dataFim: string,
): Promise<AgendaEvent[]> {
  if (!terapeuta.trim()) return []

  const { data, error } = await supabase
    .from('grade_profissionais_tita')
    .select('id, data, hora_inicial, hora_final, nome_profissional, nome_terapia, terapia_exibicao, sala, nome_unidade')
    .ilike('nome_profissional', `%${terapeuta}%`)
    .gte('data', dataInicio)
    .lte('data', dataFim)
    .ilike('status_agendamento', 'livre')
    .order('data', { ascending: true })
    .order('hora_inicial', { ascending: true })

  console.log('[buscarGradeSlots]', { terapeuta, dataInicio, dataFim, total: data?.length ?? 0, error })

  if (error) {
    console.error('[agenda.service] buscarGradeSlots', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id:              `grade-${row.id}`,
    title:           'Horário Livre',
    start:           toISO(row.data as string, row.hora_inicial as string),
    end:             toISO(row.data as string, row.hora_final as string),
    backgroundColor: '#ecfdf5',
    borderColor:     '#34d399',
    textColor:       '#065f46',
    extendedProps: {
      paciente:  '',
      terapeuta: (row.nome_profissional as string) ?? '',
      terapia:   (row.nome_terapia as string) ?? (row.terapia_exibicao as string) ?? '',
      sala:      (row.sala as string) ?? '',
      unidade:   (row.nome_unidade as string) ?? '',
      status:    'livre',
      tipo:      'livre' as const,
    },
  }))
}

export async function buscarSugestoesPacientes(query: string): Promise<string[]> {
  if (query.length < 2) return []
  const { data } = await supabase
    .from('agenda_tita_autorizacao_v2')
    .select('paciente_nome')
    .ilike('paciente_nome', `%${query}%`)
    .not('paciente_nome', 'is', null)
    .order('paciente_nome')
    .limit(200)
  if (!data) return []
  const unique = [...new Set(data.map((r) => r.paciente_nome as string).filter(Boolean))]
  return unique.slice(0, 10)
}

export async function buscarSugestoesTerapeutas(query: string): Promise<string[]> {
  if (query.length < 2) return []
  const { data } = await supabase
    .from('agenda_tita_autorizacao_v2')
    .select('profissional_nome')
    .ilike('profissional_nome', `%${query}%`)
    .not('profissional_nome', 'is', null)
    .not('profissional_nome', 'ilike', '%Sala%')
    .not('profissional_nome', 'ilike', '%Unid.%')
    .order('profissional_nome')
    .limit(200)
  if (!data) return []
  const unique = [...new Set(data.map((r) => r.profissional_nome as string).filter(Boolean))]
  return unique.slice(0, 10)
}

export async function buscarSugestoesSalas(query: string): Promise<string[]> {
  if (query.length < 2) return []
  const { data } = await supabase
    .from('agenda_tita_autorizacao_v2')
    .select('sala_nome')
    .ilike('sala_nome', `%${query}%`)
    .not('sala_nome', 'is', null)
    .order('sala_nome')
    .limit(200)
  if (!data) return []
  const unique = [...new Set(data.map((r) => r.sala_nome as string).filter(Boolean))]
  return unique.slice(0, 10)
}

export async function buscarOpcoesFiltro(): Promise<AgendaFilterOptions> {
  const [pacientesRes, terapeutasRes, terapiasRes, salasRes, unidadesRes] = await Promise.all([
    supabase.from('agenda_tita_autorizacao_v2').select('paciente_nome').not('paciente_nome', 'is', null).limit(5000),
    supabase.from('grade_profissionais_tita').select('nome_profissional').not('nome_profissional', 'is', null).limit(3000),
    supabase.from('agenda_tita_autorizacao_v2').select('terapia_nome').not('terapia_nome', 'is', null).limit(200),
    supabase.from('agenda_tita_autorizacao_v2').select('sala_nome').not('sala_nome', 'is', null).limit(200),
    supabase.from('agenda_tita_autorizacao_v2').select('clinica_nome').not('clinica_nome', 'is', null).limit(50),
  ])

  const unique = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter(Boolean))] as T[]

  return {
    pacientes:  unique((pacientesRes.data  ?? []).map((r) => r.paciente_nome)),
    terapeutas: unique((terapeutasRes.data ?? []).map((r) => r.nome_profissional)),
    terapias:   unique((terapiasRes.data   ?? []).map((r) => r.terapia_nome)),
    salas:      unique((salasRes.data      ?? []).map((r) => r.sala_nome)),
    unidades:   unique((unidadesRes.data   ?? []).map((r) => r.clinica_nome)),
  }
}
