import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = await createClient(cookieStore)

    const hoje = new Date().toLocaleDateString('sv-SE')

    console.log("📅 Buscando agenda do dia:", hoje)

    // 1️⃣ buscar pacientes
    const resPacientes = await fetch(
      'https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=pacientes'
    )

    const pacientes = await resPacientes.json()

    console.log(`👥 Total pacientes: ${pacientes.length}`)

    // 2️⃣ buscar agenda de todos (em paralelo)
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

    // 3️⃣ achatar array
    const registros = resultados.flat()

    console.log(`📦 Registros encontrados: ${registros.length}`)

    if (registros.length === 0) {
      return Response.json({ message: 'Sem agenda hoje' })
    }

    // 4️⃣ remover duplicados (🔥 ESSENCIAL)
    const registrosUnicos = Array.from(
      new Map(
        registros.map(r => [
          `${r.matricula}-${r.data_atendimento}-${r.horario}-${r.terapia}`,
          r
        ])
      ).values()
    )

    console.log(`🧹 Após remover duplicados: ${registrosUnicos.length}`)

    // 5️⃣ salvar no banco
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