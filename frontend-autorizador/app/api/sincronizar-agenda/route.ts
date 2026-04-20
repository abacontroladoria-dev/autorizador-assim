import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(req: Request) {
  try {
    const cookieStore = cookies()
    const supabase = await createClient(cookieStore)

    const hoje = new Date().toLocaleDateString('sv-SE')

    console.log("📅 Buscando agenda do dia:", hoje)

    // =========================
    // 🔥 CONTROLE DE ATUALIZAÇÃO (4h + FORCE)
    // =========================
    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    if (!force) {
      const { data: ultima } = await supabase
        .from('agenda_orbita')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (ultima?.created_at) {
        const ultimaAtualizacao = new Date(ultima.created_at)
        const agora = new Date()

        const diff = agora.getTime() - ultimaAtualizacao.getTime()

        if (diff < 4 * 60 * 60 * 1000) {
          console.log("⏱ Já atualizado nas últimas 4h")

          return Response.json({
            message: 'Atualização recente, ignorada'
          })
        }
      }
    }

    // =========================
    // 1️⃣ buscar pacientes
    // =========================
    const resPacientes = await fetch(
      'https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=pacientes'
    )

    const pacientes = await resPacientes.json()

    console.log(`👥 Total pacientes: ${pacientes.length}`)

    // =========================
    // 2️⃣ buscar agenda de todos (em paralelo)
    // =========================
    const resultados = await Promise.all(
      pacientes.map(async (p: any) => {
        try {
          const resAgenda = await fetch(
            `https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=agenda/detalhe&paciente_id=${p.id}&data=${hoje}`
          )

          const agendas = await resAgenda.json()

          if (!agendas || agendas.length === 0) return []

          return agendas.map((a: any) => ({
            paciente_id: p.id,
            paciente_nome: a.nome,
            empresa: a.empresa,
            matricula: a.matricula,
            dep: a.dep,
            crm: a.crm,
            nome_medico: a.nome_medico,
            tuss: a.tuss1,
            data_atendimento: a.data,
            horario: a.horario,
            terapia: a.terapia
          }))
        } catch (err) {
          console.log(`❌ erro paciente ${p.id}`)
          return []
        }
      })
    )

    // =========================
    // 3️⃣ achatar array
    // =========================
    const registros = resultados.flat()

    console.log(`📦 Registros encontrados: ${registros.length}`)

    if (registros.length === 0) {
      return Response.json({ message: 'Sem agenda hoje' })
    }

    // =========================
    // 🧹 LIMPAR DADOS ANTIGOS
    // =========================
    const hojeDate = new Date()
    const inicioSemana = new Date(hojeDate)

    inicioSemana.setDate(hojeDate.getDate() - hojeDate.getDay())

    const dataLimite = inicioSemana.toISOString().split('T')[0]

    console.log("🧹 Limpando dados anteriores a:", dataLimite)

    await supabase
      .from('agenda_orbita')
      .delete()
      .lt('data_atendimento', dataLimite)

    // =========================
    // 4️⃣ remover duplicados (🔥 ESSENCIAL)
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
    // 5️⃣ salvar no banco
    // =========================
    const { error } = await supabase
      .from('agenda_orbita')
      .upsert(registrosUnicos, {
        onConflict: 'matricula,data_atendimento,horario,terapia'
      })

    if (error) {
      console.error(error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({
      success: true,
      total: registrosUnicos.length
    })

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}