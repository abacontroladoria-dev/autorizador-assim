'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { calcularSugestoes } from '@/lib/cronograma/reposicao'
import type { AgendaPacienteSlot, SlotLivre } from '@/lib/cronograma/reposicao'
import type { ResultadoReposicao, SessaoAgendada, SessaoFaltada, SessaoPresente } from '@/types/reposicao'
import { EXIB_NOME } from '@/lib/cronograma/constants'

// ─── Helpers de data ──────────────────────────────────────────────────────────

const DIAS_PT: Record<string, string> = {
  'Segunda-feira': 'Segunda',
  'Terça-feira':   'Terca',
  'Quarta-feira':  'Quarta',
  'Quinta-feira':  'Quinta',
  'Sexta-feira':   'Sexta',
}

function normalizarDia(dia: string | null | undefined): string {
  if (!dia) return ''
  return DIAS_PT[dia] ?? dia
}

function horaStr(t: string | null | undefined): string {
  return String(t ?? '').slice(0, 5)
}

function fimSemana(inicio: string): string {
  const d = new Date(`${inicio}T12:00:00`)
  d.setDate(d.getDate() + 4) // segunda → sexta
  return d.toISOString().slice(0, 10)
}

// Deriva o nome do dia a partir de uma data ISO ("2026-06-30" → "Terca").
// Necessário como fallback quando csv_grades_profissionais não tem linha para o paciente
// (slot liberado após a falta — paciente_nome removido, status → 'Livre').
function diaDaSemana(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  const map: Record<number, string> = { 1: 'Segunda', 2: 'Terca', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' }
  return map[d.getDay()] ?? ''
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useReposicaoFaltas(
  pacienteId:   string | null,
  pacienteNome: string | null,
  semanaInicio: string,           // ISO date "YYYY-MM-DD" (segunda-feira)
) {
  const [resultados,       setResultados]       = useState<ResultadoReposicao[]>([])
  const [sessoesSemana,    setSessoesSemana]    = useState<SessaoPresente[]>([])
  const [agendaPaciente,   setAgendaPaciente]   = useState<AgendaPacienteSlot[]>([])
  const [sessoesAgendadas, setSessoesAgendadas] = useState<SessaoAgendada[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  const semanaFim = useMemo(() => fimSemana(semanaInicio), [semanaInicio])

  useEffect(() => {
    if (!pacienteId || !pacienteNome) {
      setResultados([])
      setSessoesSemana([])
      setAgendaPaciente([])
      setSessoesAgendadas([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function carregar() {
      const sb = getSupabaseClient()

      // ── Q1 e Q2 em paralelo: faltas brutas e agenda do paciente ─────────
      // Nenhuma das tabelas relacionadas (controle_terapeutico, csv_grades_profissionais)
      // tem FK declarada no schema, portanto nenhum join PostgREST é usado.
      // csv_grades_profissionais é cruzado por data+hora no passo de montagem abaixo.
      const [r1, r2] = await Promise.all([
        sb
          .from('fila_autorizacoes')
          .select('id, paciente_id, paciente_nome, data_atendimento, horario, tipo_falta, tita_agendamento_id, terapia_nome, terapia_exibicao_id, justificativa_falta, cancelado_em, falta_revertida_em')
          .eq('status', 'falta')
          .is('cancelado_em', null)
          .is('falta_revertida_em', null)
          .eq('paciente_id', pacienteId)
          .gte('data_atendimento', semanaInicio)
          .lte('data_atendimento', semanaFim),

        sb
          .from('csv_grades_profissionais')
          .select('data, dia_semana, hora_inicial, sala_nome, terapia_nome, terapia_exibicao_nome, profissional_nome')
          .ilike('paciente_nome', pacienteNome ?? '')
          .gte('data', semanaInicio)
          .lte('data', semanaFim),
      ])

      if (r1.error || r2.error || cancelled) {
        if (!cancelled) setError((r1.error ?? r2.error)?.message ?? 'Erro ao carregar dados')
        if (!cancelled) setLoading(false)
        return
      }

      // ── Q_CT: busca controle_terapeutico pelos tita_agendamento_id ────────
      const titaIds = (r1.data ?? [])
        .map((r: any) => r.tita_agendamento_id)
        .filter(Boolean)

      let ctMap: Record<string, any> = {}

      if (titaIds.length > 0) {
        const { data: ctData, error: ctError } = await sb
          .from('controle_terapeutico')
          .select('tita_agendamento_id, status, profissional_id, profissional_nome, terapia_nome')
          .in('tita_agendamento_id', titaIds)
          .eq('status', 'indisponivel')

        if (ctError || cancelled) {
          if (!cancelled) setError(ctError?.message ?? 'Erro ao carregar controle terapêutico')
          if (!cancelled) setLoading(false)
          return
        }

        ctMap = Object.fromEntries(
          (ctData ?? []).map((ct: any) => [String(ct.tita_agendamento_id), ct])
        )
      }

      // ── Q2b: sala_nome dos slots faltados (agora 'Livre', sem paciente_nome) ─
      // Quando o paciente falta, o slot é liberado: paciente_nome é removido e
      // status_agendamento vira 'Livre'. Q2 filtra por paciente_nome e não retorna
      // mais esses registros. Q2b busca pelo profissional + data + hora para obter
      // sala_nome e dia_semana sem depender do campo paciente_nome.
      let slotsProfMap: Record<string, { sala_nome: string; dia_semana: string; terapia_nome: string; terapia_exibicao_nome: string }> = {}

      if (Object.keys(ctMap).length > 0) {
        const profissionaisNomes = [
          ...new Set(Object.values(ctMap).map((ct: any) => ct.profissional_nome).filter(Boolean)),
        ]
        if (profissionaisNomes.length > 0) {
          const { data: slotsProf } = await sb
            .from('csv_grades_profissionais')
            .select('profissional_nome, data, hora_inicial, sala_nome, dia_semana, terapia_nome, terapia_exibicao_nome')
            .in('profissional_nome', profissionaisNomes)
            .gte('data', semanaInicio)
            .lte('data', semanaFim)

          slotsProfMap = Object.fromEntries(
            (slotsProf ?? []).map((r: any) => [
              `${r.profissional_nome}|${r.data}|${horaStr(r.hora_inicial)}`,
              {
                sala_nome:            r.sala_nome            ?? '',
                dia_semana:           r.dia_semana           ?? '',
                terapia_nome:         r.terapia_nome         ?? '',
                terapia_exibicao_nome: r.terapia_exibicao_nome ?? '',
              },
            ]),
          )
        }
      }

      if (cancelled) return

      // ── Monta SessaoFaltada[] ─────────────────────────────────────────────
      // Exclui faltas com tita_agendamento_id cujo CT não é 'indisponivel'.
      // csv_grades_profissionais é cruzado por data + hora (Q2 já trouxe esses dados).
      const csvRows = r2.data ?? []

      const faltas: SessaoFaltada[] = (r1.data ?? [])
        .filter((r: any) => !r.tita_agendamento_id || ctMap[String(r.tita_agendamento_id)])
        .map((r: any) => {
          const ct  = r.tita_agendamento_id ? ctMap[String(r.tita_agendamento_id)] ?? null : null
          const hora = horaStr(r.horario)
          const csv = csvRows.find(
            (c: any) => c.data === r.data_atendimento && horaStr(c.hora_inicial) === hora,
          ) ?? null

          // Q2b: fallback para slots liberados após a falta (paciente_nome removido)
          const profSlotKey = ct?.profissional_nome
            ? `${ct.profissional_nome}|${r.data_atendimento}|${hora}`
            : null
          const profSlot = profSlotKey ? (slotsProfMap[profSlotKey] ?? null) : null

          // Profissional: CT → CSV → Q2b
          const profissional    = ct?.profissional_nome ?? csv?.profissional_nome ?? ''

          // Terapia: csv (sessão não liberada) > Q2b (slot liberado, lookup por profissional) > CT > fila
          // Nota: fila_autorizacoes.terapia_nome pode divergir do csv — csv/profSlot são mais confiáveis.
          const terapia = csv?.terapia_nome || profSlot?.terapia_nome || ct?.terapia_nome || r.terapia_nome || ''

          // Exibição: EXIB_NOME (IDs especiais ABA) > csv > Q2b > CT > fila
          const exibNome        = r.terapia_exibicao_id ? (EXIB_NOME[Number(r.terapia_exibicao_id)] ?? '') : ''
          const terapiaExibicao = exibNome
            || csv?.terapia_exibicao_nome
            || profSlot?.terapia_exibicao_nome
            || profSlot?.terapia_nome
            || ct?.terapia_nome
            || r.terapia_nome
            || ''

          // dia: csv → Q2b → derivado da data_atendimento
          const dia = normalizarDia(csv?.dia_semana)
            || normalizarDia(profSlot?.dia_semana)
            || diaDaSemana(r.data_atendimento)

          // unidade: csv → Q2b (slot pode estar 'Livre' após a falta)
          const unidade = csv?.sala_nome || profSlot?.sala_nome || ''

          // semJoin apenas se nenhuma fonte forneceu a terapia
          const semJoin = !terapia

          return {
            faltaId:         r.id,
            pacienteId:      r.paciente_id,
            paciente:        r.paciente_nome ?? '',
            profissional,
            profissionalId:  ct?.profissional_id ?? null,
            terapia,
            terapiaExibicao,
            dia,
            hora,
            unidade,
            dataOriginal:    r.data_atendimento ?? '',
            justificativa:   r.justificativa_falta ?? null,
            origemFalta:     r.tipo_falta ?? '',
            semJoin,
          } satisfies SessaoFaltada
        })

      // ── Monta AgendaPacienteSlot[] (para algoritmo) ──────────────────────
      const agendaPaciente: AgendaPacienteSlot[] = csvRows.map((r: any) => ({
        data:    r.data ?? '',
        dia:     normalizarDia(r.dia_semana),
        hora:    horaStr(r.hora_inicial),
        unidade: r.sala_nome ?? '',
      }))

      // ── Monta SessaoAgendada[] (para visualização) ────────────────────────
      const sessoesAgendadas: SessaoAgendada[] = csvRows.map((r: any) => ({
        data:            r.data                   ?? '',
        dia:             normalizarDia(r.dia_semana),
        hora:            horaStr(r.hora_inicial),
        unidade:         r.sala_nome              ?? '',
        terapia:         r.terapia_nome           ?? '',
        terapiaExibicao: r.terapia_exibicao_nome  ?? r.terapia_nome ?? '',
        profissional:    r.profissional_nome       ?? '',
      }))

      // ── Query 3: slots livres por terapia (inclui P1 e P2) ───────────────
      // Usa todas as faltas com terapia conhecida (CT ou fallback CSV)
      const faltasComTerapia = faltas.filter(f => !f.semJoin)
      const terapias = [...new Set(faltasComTerapia.map(f => f.terapia))]

      let slotsLivres: SlotLivre[] = []
      // Lookup data|hora → { profissional_nome, sala_nome } dos slots libertos pela falta.
      // Chave sem terapia_nome: o código diverge entre fila_autorizacoes e csv para algumas terapias.
      // Um paciente não tem duas sessões no mesmo horário, então data+hora é unívoco para ele.
      const profLivreMap: Record<string, { prof: string; sala: string }> = {}

      if (terapias.length > 0) {
        // Usa vw_reposicao_faltas: view criada especificamente para este módulo,
        // expõe slots Livre da semana corrente (csv_grades_profissionais filtra semana futura).
        // Filtra por terapia_nome — slots Livre têm terapia_exibicao_nome = "Ainda não selecionado".
        const { data: slotsRaw, error: e3 } = await sb
          .from('vw_reposicao_faltas')
          .select('profissional_nome, terapia_nome, terapia_exibicao_nome, hora_inicial, data, dia_semana, sala_nome')
          .in('terapia_nome', terapias)
          .eq('status_agendamento', 'Livre')
          .gte('data', semanaInicio)
          .lte('data', semanaFim)

        if (e3 || cancelled) {
          if (!cancelled) setError(e3?.message ?? 'Erro ao carregar slots livres')
          if (!cancelled) setLoading(false)
          return
        }

        if (cancelled) return

        // slot.terapia usa terapia_nome para casar com falta.terapia
        // (ambos vêm de fila_autorizacoes.terapia_nome e csv.terapia_nome — mesma convenção).
        // terapiaExibicao usa terapia_exibicao_nome quando disponível, senão cai em terapia_nome
        // (slots Livre têm terapia_exibicao_nome = "Ainda não selecionado").
        slotsLivres = (slotsRaw ?? []).map((r: any): SlotLivre => {
          const exibOk = r.terapia_exibicao_nome && r.terapia_exibicao_nome !== 'Ainda não selecionado'
          return {
            profissional:    r.profissional_nome ?? '',
            terapia:         r.terapia_nome      ?? '',
            terapiaExibicao: exibOk ? r.terapia_exibicao_nome : r.terapia_nome ?? '',
            data:            r.data              ?? '',
            dia:             normalizarDia(r.dia_semana),
            hora:            horaStr(r.hora_inicial),
            unidade:         r.sala_nome         ?? '',
          }
        })

        // Constrói lookup para enriquecer faltas sem profissional e sem unidade.
        // Chave: data|hora (sem terapia_nome — diverge entre tabelas para algumas terapias).
        ;(slotsRaw ?? []).forEach((r: any) => {
          const k = `${r.data ?? ''}|${horaStr(r.hora_inicial)}`
          if (!profLivreMap[k]) {
            profLivreMap[k] = {
              prof: r.profissional_nome ?? '',
              sala: r.sala_nome         ?? '',
            }
          }
        })
      }

      // ── Enriquece faltas sem profissional/unidade usando o slot liberado (Q3) ─
      let faltasEnriquecidas = faltas.map(f => {
        const needProf  = !f.profissional
        const needSala  = !f.unidade
        if (!needProf && !needSala) return f
        const info = profLivreMap[`${f.dataOriginal}|${f.hora}`]
        if (!info) return f
        return {
          ...f,
          profissional: needProf && info.prof ? info.prof : f.profissional,
          unidade:      needSala && info.sala ? info.sala : f.unidade,
        }
      })

      // ── Q_PROF: fallback — busca profissional_nome e sala_nome direto em csv_grades_profissionais
      // para faltas sem profissional ou unidade após todas as queries anteriores.
      // Usa csv_grades_profissionais (não vw_reposicao_faltas) para cobrir slots já re-ocupados:
      // a view só expõe status='Livre', mas profissional_nome e sala_nome permanecem no CSV
      // independente do status atual do slot.
      const faltasSemDados = faltasEnriquecidas.filter(f => (!f.profissional || !f.unidade) && !f.semJoin)
      if (faltasSemDados.length > 0) {
        const datasNeeded = [...new Set(faltasSemDados.map(f => f.dataOriginal))]

        const { data: profRows } = await sb
          .from('csv_grades_profissionais')
          .select('profissional_nome, sala_nome, hora_inicial, data, terapia_nome')
          .in('data', datasNeeded)

        if (!cancelled && profRows && profRows.length > 0) {
          // Mapa primário: data|hora|terapia — evita ambiguidade quando vários profissionais
          // têm terapias diferentes no mesmo horário.
          const profByTerapia: Record<string, { prof: string; sala: string }> = {}
          // Mapa secundário: data|hora — fallback quando terapia_nome diverge entre tabelas.
          const profByHora: Record<string, { prof: string; sala: string }> = {}

          profRows.forEach((r: any) => {
            const k1 = `${r.data ?? ''}|${horaStr(r.hora_inicial)}|${r.terapia_nome ?? ''}`
            if (!profByTerapia[k1]) {
              profByTerapia[k1] = { prof: r.profissional_nome ?? '', sala: r.sala_nome ?? '' }
            }
            const k2 = `${r.data ?? ''}|${horaStr(r.hora_inicial)}`
            if (!profByHora[k2]) {
              profByHora[k2] = { prof: r.profissional_nome ?? '', sala: r.sala_nome ?? '' }
            }
          })

          faltasEnriquecidas = faltasEnriquecidas.map(f => {
            const needProf = !f.profissional
            const needSala = !f.unidade
            if (!needProf && !needSala) return f

            // Chave primária: data|hora|terapia — confiável; terapia garante que é o slot certo.
            const byTerapia = profByTerapia[`${f.dataOriginal}|${f.hora}|${f.terapia}`]
            // Chave secundária: data|hora sem terapia — ambígua (múltiplos pacientes no mesmo horário).
            // Usada APENAS para unidade (sala), nunca para profissional, pois pode pegar o slot
            // de outro paciente e atribuir o profissional errado.
            const byHora = profByHora[`${f.dataOriginal}|${f.hora}`]

            const novoProf = needProf && byTerapia?.prof ? byTerapia.prof : f.profissional
            const novaSala = needSala
              ? (byTerapia?.sala || byHora?.sala || f.unidade)
              : f.unidade

            if (novoProf === f.profissional && novaSala === f.unidade) return f
            return { ...f, profissional: novoProf, unidade: novaSala }
          })
        }
      }

      // ── Q_HIST: histórico do paciente (últimas 4 semanas) para recuperar profissional ─
      // Fallback final para faltas onde tita_agendamento_id é nulo e o slot liberado
      // não preservou profissional_nome. Usa dia_semana+hora como chave (não a data
      // exata) para tolerar variações de data e aproveitar o paciente_nome ainda intacto
      // nos registros históricos. Ordena por data desc → profissional mais recente primeiro.
      const faltasSemProf = faltasEnriquecidas.filter(f => !f.profissional && !f.semJoin)
      if (faltasSemProf.length > 0) {
        const histD = new Date(`${semanaInicio}T12:00:00`)
        histD.setDate(histD.getDate() - 28)
        const historicalStart = histD.toISOString().slice(0, 10)

        const { data: histRows } = await sb
          .from('csv_grades_profissionais')
          .select('profissional_nome, sala_nome, hora_inicial, dia_semana')
          .ilike('paciente_nome', pacienteNome ?? '')
          .gte('data', historicalStart)
          .lt('data', semanaInicio)
          .order('data', { ascending: false })

        if (!cancelled && histRows && histRows.length > 0) {
          const histMap: Record<string, { prof: string; sala: string }> = {}
          histRows.forEach((r: any) => {
            const k = `${normalizarDia(r.dia_semana)}|${horaStr(r.hora_inicial)}`
            if (!histMap[k]) {
              histMap[k] = { prof: r.profissional_nome ?? '', sala: r.sala_nome ?? '' }
            }
          })

          faltasEnriquecidas = faltasEnriquecidas.map(f => {
            if (f.profissional) return f
            const info = histMap[`${f.dia}|${f.hora}`]
            if (!info) return f
            return {
              ...f,
              profissional: info.prof || f.profissional,
              unidade:      !f.unidade && info.sala ? info.sala : f.unidade,
            }
          })
        }
      }

      // ── Sessões presentes (para empty state) ─────────────────────────────
      const presentes: SessaoPresente[] = csvRows.map((r: any) => ({
        data:            r.data            ?? '',
        dia:             normalizarDia(r.dia_semana),
        hora:            horaStr(r.hora_inicial),
        unidade:         r.sala_nome       ?? '',
        terapiaExibicao: r.terapia_exibicao_nome ?? '',
      }))


      // ── Executa algoritmo ─────────────────────────────────────────────────
      const resultado = calcularSugestoes(faltasEnriquecidas, slotsLivres, agendaPaciente)

      if (!cancelled) {
        setResultados(resultado)
        setSessoesSemana(presentes)
        setAgendaPaciente(agendaPaciente)
        setSessoesAgendadas(sessoesAgendadas)
        setLoading(false)
      }
    }

    carregar().catch(err => {
      if (!cancelled) {
        setError(err?.message ?? 'Erro inesperado')
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [pacienteId, pacienteNome, semanaInicio])

  return { resultados, sessoesSemana, agendaPaciente, sessoesAgendadas, semanaFim, loading, error }
}
