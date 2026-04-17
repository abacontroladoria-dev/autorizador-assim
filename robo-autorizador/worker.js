/*
* =========================
* WORKER RPA
* =========================
*/

require('dotenv').config({ path: __dirname + '/.env' })

const executarRpa = require('./rpa')

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const MACHINE_ID = process.env.MACHINE_ID
const INTERVALO = 3000

console.log('Worker iniciado na máquina:', MACHINE_ID)

// =========================
// 🔎 BUSCAR TAREFA (PENDENTE)
// =========================
async function buscarTarefa() {
  const { data, error } = await supabase
    .from('fila_autorizacoes')
    .select('*')
    .eq('status', 'pendente') // ✅ CORRETO
    .order('id', { ascending: true }) // ✅ seguro
    .limit(1)

  if (error) {
    console.error("Erro ao buscar tarefa:", error.message)
    return null
  }

  return data.length > 0 ? data[0] : null
}

// =========================
// 🔄 ATUALIZAR STATUS
// =========================
async function atualizarStatus(id, status) {
  const { error } = await supabase
    .from('fila_autorizacoes') // ✅ CORRIGIDO
    .update({
      status,
      updated_at: new Date().toISOString(),
      machine_id: MACHINE_ID
    })
    .eq('id', id)

  if (error) {
    console.error("Erro ao atualizar status:", error.message)
  }
}

		// =========================
		// ⛔ CANCELAMENTO
		// =========================
		async function verificarCancelamento(id) {
		  const { data, error } = await supabase
			.from('fila_autorizacoes') // ✅ tabela correta
			.select('status')
			.eq('id', id)
			.single()

		  if (error) {
			console.error("Erro ao verificar cancelamento:", error.message)
			return false
		  }

		  // só continua se ainda estiver ativa
		  return !['processando', 'executando'].includes(data?.status)
		}

// =========================
// 📝 LOG
// =========================
async function registrarLog(fila_id, mensagem) {
  const { error } = await supabase
    .from('logs')
    .insert([
      {
        fila_id,
        mensagem
      }
    ])

  if (error) {
    console.error("Erro ao registrar log:", error.message)
  }
}

// =========================
// 🚀 LOOP PRINCIPAL
// =========================
async function iniciarWorker() {

  console.log("=================================")
  console.log("🤖 WORKER RPA INICIADO")
  console.log("💻 Máquina:", MACHINE_ID)
  console.log("=================================")

  while (true) {
    try {

      console.log("🔎 Buscando tarefas...")

      const tarefa = await buscarTarefa()

      if (!tarefa) {
        await new Promise(r => setTimeout(r, INTERVALO))
        continue
      }

      console.log("📌 Tarefa encontrada:", tarefa.id)

      // =========================
      // 🔒 LOCK (CRÍTICO)
      // =========================
      const { data: lockData, error: lockError } = await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'processando',
          updated_at: new Date().toISOString(),
          machine_id: MACHINE_ID
        })
        .match({
          id: tarefa.id,
          status: 'pendente'
        })
        .select()

      if (lockError) {
        console.error("❌ Erro ao travar tarefa:", lockError.message)
        continue
      }

      if (!lockData || lockData.length === 0) {
        console.log("⚠️ Já foi pego por outro worker")
        continue
      }

      console.log("🔐 LOCK OK:", tarefa.id)

      await registrarLog(tarefa.id, 'Iniciando execução')

      try {

        // ⛔ cancelamento
        if (await verificarCancelamento(tarefa.id)) {
          console.log("⛔ Cancelado antes de iniciar")
          continue
        }

        // 🚀 EXECUTANDO
        await atualizarStatus(tarefa.id, 'executando')

		await executarRpa(tarefa, verificarCancelamento);
        
		await atualizarStatus(tarefa.id, 'concluido')

        await registrarLog(tarefa.id, 'Execução concluída')

        console.log("✅ Concluído:", tarefa.id)

      } catch (erroExecucao) {

        console.error("❌ Erro:", erroExecucao.message)

        await atualizarStatus(tarefa.id, 'erro')

        await registrarLog(tarefa.id, erroExecucao.message)
      }

    } catch (erroGeral) {

      console.error("❌ Erro geral:", erroGeral.message)

      await new Promise(r => setTimeout(r, INTERVALO))
    }
  }
}

// =========================
// ▶ EXECUÇÃO
// =========================
module.exports = iniciarWorker

if (require.main === module) {
  iniciarWorker()
}