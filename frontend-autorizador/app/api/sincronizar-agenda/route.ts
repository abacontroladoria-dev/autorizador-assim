import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(req: Request) {
  try {
    executarSincronizacao(req)

    return Response.json({
      message: 'Sincronização iniciada'
    })
  } catch (err) {
    return Response.json({ error: 'Erro ao iniciar' }, { status: 500 })
  }
}

// 🔥 BACKOFF EXPONENCIAL
async function fetchComRetry(url: string, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      })

      if (res.ok) {
        return await res.json()
      }
    } catch {}

    if (i < tentativas - 1) {
      const delay = Math.min(100 * Math.pow(2, i), 5000)
      await new Promise(r => setTimeout(r, delay))
    }
  }

  return null
}

async function executarSincronizacao(req: Request) {
  let supabase

  try {
    const cookieStore = cookies()
    supabase = await createClient(cookieStore)

    // 🔥 STATUS: RUNNING
    await supabase
      .from('sync_status')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', 1)

    const hoje = new Date().toLocaleDateString('sv-SE')

    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    if (!force) {
      const { data: ultima } = await supabase
        .from('agenda_orbita')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (ultima?.updated_at) {
        const ultimaAtualizacao = new Date(ultima.updated_at)
        const agora = new Date()

        const diff = agora.getTime() - ultimaAtualizacao.getTime()

        if (diff < 4 * 60 * 60 * 1000) {
          console.log("⏱ Já atualizado nas últimas 4h")
          
          await supabase
            .from('sync_status')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', 1)

          return
        }
      }
    }

    // =========================
    // 1️⃣ buscar pacientes
    // =========================
    const resPacientes = await fetch(
      'https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=pacientes'
    )

    if (!resPacientes.ok) {
      throw new Error('Erro ao buscar pacientes')
    }

    const pacientes = await resPacientes.json()
    console.log(`👥 Total pacientes: ${pacientes.length}`)

    const resultados: any[] = []
    const falhas = new Set<number>()

    // =========================
    // 🔥 LOTE = 20
    // =========================
    async function processarEmLotes(pacientes: any[], tamanhoLote = 20) {
      for (let i = 0; i < pacientes.length; i += tamanhoLote) {
        const lote = pacientes.slice(i, i + tamanhoLote)

        const promessas = lote.map(async (p) => {
          const url = `https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=agenda/detalhe&paciente_id=${p.id}&data=${hoje}`

          try {
            const agendas = await fetchComRetry(url, 2)

            if (!agendas) {
              falhas.add(p.id)
              return null
            }

            if (agendas.length === 0) {
              return null
            }

            return agendas.map((a: any) => ({
              paciente_id: p.id,
              paciente_nome: a.nome,
              empresa: a.empresa,
              matricula: a.matricula?.slice(0, 7),
              dep: a.dep,
              crm: a.crm?.replace(/\D/g, ''),
              nome_medico: a.nome_medico,
              tuss: a.tuss1,
              data_atendimento: a.data,
              horario: a.horario,
              terapia: a.terapia
            }))
          } catch {
            falhas.add(p.id)
            return null
          }
        })

        const resLote = await Promise.allSettled(promessas)

        const loteValido = resLote
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value)
          .flat()
          .filter(Boolean)

        resultados.push(...loteValido)

        console.log(`📦 Lote processado: ${i + lote.length}/${pacientes.length}`)
      }
    }

    await processarEmLotes(pacientes, 20)

    // =========================
    // 🔁 RETRY
    // =========================
    if (falhas.size > 0) {
      console.log(`🔁 Reprocessando falhas: ${falhas.size}`)

      const promessasRetry = Array.from(falhas).map(async (id) => {
        const url = `https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=agenda/detalhe&paciente_id=${id}&data=${hoje}`

        try {
          const agendas = await fetchComRetry(url, 3)

          if (!agendas || agendas.length === 0) return null

          return agendas.map((a: any) => ({
            paciente_id: id,
            paciente_nome: a.nome,
            empresa: a.empresa,
            matricula: a.matricula?.slice(0, 7),
            dep: a.dep,
            crm: a.crm?.replace(/\D/g, ''),
            nome_medico: a.nome_medico,
            tuss: a.tuss1,
            data_atendimento: a.data,
            horario: a.horario,
            terapia: a.terapia
          }))
        } catch {
          return null
        }
      })

      const resRetry = await Promise.allSettled(promessasRetry)

      const retryValido = resRetry
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
        .flat()
        .filter(Boolean)

      resultados.push(...retryValido)
    }

    // =========================
    // 3️⃣ dados finais
    // =========================
    const registros = resultados.flat()

    console.log(`📦 Registros encontrados: ${registros.length}`)

    if (registros.length === 0) {
      console.log('Sem agenda hoje')

      await supabase
        .from('sync_status')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', 1)

      return
    }

    // =========================
    // limpar antigos
    // =========================
    const hojeDate = new Date()
    const inicioSemana = new Date(hojeDate)

    inicioSemana.setDate(hojeDate.getDate() - hojeDate.getDay())

    const dataLimite = inicioSemana.toISOString().split('T')[0]

    await supabase
      .from('agenda_orbita')
      .delete()
      .lt('data_atendimento', dataLimite)

    // =========================
    // dedupe
    // =========================
    const registrosUnicos = Array.from(
      new Map(
        registros.map(r => [
          `${r.matricula}-${r.data_atendimento}-${r.horario}-${r.terapia}`,
          r
        ])
      ).values()
    )

    console.log(`🧹 Após remover duplicados: ${registrosUnicos.length}`)

    // =========================
    // UPSERT EM LOTES
    // =========================
    for (let i = 0; i < registrosUnicos.length; i += 100) {
      const lote = registrosUnicos.slice(i, i + 100)

      const { error } = await supabase
        .from('agenda_orbita')
        .upsert(
          lote.map(r => ({
            ...r,
            updated_at: new Date().toISOString()
          })),
          {
            onConflict: 'matricula,data_atendimento,horario,terapia'
          }
        )

      if (error) {
        console.error(error)
        throw error
      }

      console.log(`📦 Lote inserido: ${i + lote.length}/${registrosUnicos.length}`)
    }

    console.log(`✅ Registros únicos: ${registrosUnicos.length}`)
    console.log(`⚠️ Falhas finais: ${falhas.size}`)
    console.log('✅ Sincronização finalizada:', registrosUnicos.length)

    // 🔥 STATUS: DONE
    await supabase
      .from('sync_status')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', 1)

  } catch (err: any) {
    console.error('❌ Erro na sincronização:', err)

    if (supabase) {
      await supabase
        .from('sync_status')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', 1)
    }
  }
}