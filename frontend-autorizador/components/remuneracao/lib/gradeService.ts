import { getSupabaseClient } from '@/lib/supabase/client'
import type { CsvRow } from './types'

export async function buscarGradeParaAnalise(anoMes: string): Promise<CsvRow[]> {
  const supabase = getSupabaseClient()
  const [yr, mo] = anoMes.split('-').map(Number)
  const inicio = `${yr}-${String(mo).padStart(2, '0')}-01`
  const fimDate = new Date(yr, mo, 1)
  const fim = `${fimDate.getFullYear()}-${String(fimDate.getMonth() + 1).padStart(2, '0')}-01`

  // ── 1. Grade do mês inteiro (para localizar a primeira semana com dados) ───
  const { data: gradeMes } = await supabase
    .from('grade_profissionais_tita')
    .select('nome_profissional, terapia_exibicao, data, hora_inicial, hora_final, profissional_id')
    .gte('data', inicio)
    .lt('data', fim)
    .order('data')
    .limit(10000)

  if (!gradeMes?.length) return []

  // ── 2. Encontra a primeira semana Seg-Sex que tem dados na grade ───────────
  const datasComDados = [...new Set(gradeMes.map(g => g.data as string))].sort()
  let semanIni = ''
  let semanFim = ''

  for (const dataStr of datasComDados) {
    const dt = new Date(dataStr + 'T12:00:00')
    const dow = dt.getDay()
    if (dow >= 1 && dow <= 5) {
      const seg = new Date(dt)
      seg.setDate(dt.getDate() - (dow - 1))
      const sab = new Date(seg)
      sab.setDate(seg.getDate() + 5)
      semanIni = seg.toISOString().slice(0, 10)
      semanFim = sab.toISOString().slice(0, 10)
      break
    }
  }

  if (!semanIni) return []

  // ── 3. Filtra a grade para apenas essa semana ─────────────────────────────
  const gradeWeek = gradeMes.filter(g => {
    const d = g.data as string
    return d >= semanIni && d < semanFim
  })

  if (!gradeWeek.length) return []

  // ── 4. Agendamentos BRUTOS da mesma semana (agenda_tita_autorizacao_v2) ───
  // Fonte com todos os atendimentos do TITA, sem filtros adicionais
  const { data: agenda } = await supabase
    .from('agenda_tita_autorizacao_v2')
    .select('profissional_id, profissional_nome, terapia_nome, data_atendimento, hora_inicial, hora_final, paciente_nome')
    .gte('data_atendimento', semanIni)
    .lt('data_atendimento', semanFim)
    .not('hora_inicial', 'is', null)
    .limit(10000)

  type AgendaRow = NonNullable<typeof agenda>[number]

  // Agrupa pacientes por chave de slot (profissional_id|data|hora_inicial)
  const agendaPorSlot = new Map<string, AgendaRow[]>()
  ;(agenda ?? []).forEach(a => {
    const hIni = String(a.hora_inicial ?? '').substring(0, 5)
    const key = `${a.profissional_id}|${a.data_atendimento}|${hIni}`
    if (!agendaPorSlot.has(key)) agendaPorSlot.set(key, [])
    agendaPorSlot.get(key)!.push(a)
  })

  // ── 5. Cruzamento grade × agenda ──────────────────────────────────────────
  const rows: CsvRow[] = []
  gradeWeek.forEach(g => {
    const hIni = String(g.hora_inicial ?? '').substring(0, 5)
    const hFim = String(g.hora_final ?? '').substring(0, 5)
    const key = `${g.profissional_id}|${g.data}|${hIni}`
    const pacientes = agendaPorSlot.get(key) ?? []
    if (pacientes.length > 0) {
      pacientes.forEach(a => {
        rows.push({
          Profissional: g.nome_profissional ?? '',
          Terapia: (a.terapia_nome || g.terapia_exibicao || '').trim(),
          Data: g.data ?? '',
          'Hora Inicial': hIni,
          'Hora Final': hFim,
          'Status do Agendamento': 'Agendado',
          'Nome Favorecido': a.paciente_nome ?? '',
        })
      })
    } else {
      rows.push({
        Profissional: g.nome_profissional ?? '',
        Terapia: g.terapia_exibicao ?? '',
        Data: g.data ?? '',
        'Hora Inicial': hIni,
        'Hora Final': hFim,
        'Status do Agendamento': 'Livre',
        'Nome Favorecido': '',
      })
    }
  })

  return rows
}
