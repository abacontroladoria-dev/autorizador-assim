/*
* =========================
* WORKER RPA
* =========================
*/

require('dotenv').config({ path: __dirname + '/.env' })

const executarRpa = require('./rpa')

const { createClient } = require('@supabase/supabase-js')

const express = require('express')

const cors = require('cors')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const MACHINE_ID = process.env.MACHINE_ID

if (!MACHINE_ID) {
  console.error('❌ MACHINE_ID não definido no .env — encerrando.')
  process.exit(1)
}

let tarefaAtual = null

async function encerrarGraciosamente() {
  console.log('\n⛔ Encerrando worker...')
  if (tarefaAtual) {
    console.log('🔄 Resetando tarefa em processamento:', tarefaAtual)
    await supabase
      .from('fila_autorizacoes')
      .update({ status: 'pendente', updated_at: new Date().toISOString() })
      .eq('id', tarefaAtual)
      .eq('status', 'processando')
  }
  process.exit(0)
}

process.on('SIGTERM', encerrarGraciosamente)
process.on('SIGINT', encerrarGraciosamente)

const app = express()

app.use(cors({

  origin(origin, callback) {

    const allowed = [

      'http://localhost:3000',

      'https://orbitaautomacao.com.br'
    ]

    // requests locais sem origin
    if (!origin) {
      return callback(null, true)
    }

    if (allowed.includes(origin)) {
      return callback(null, true)
    }

    return callback(
      new Error('Not allowed by CORS')
    )
  }
}))

const INTERVALO_SEM_TAREFA = 3000

console.log('Worker iniciado na máquina:', MACHINE_ID)


// =========================
// 🔎 BUSCAR TAREFA (PENDENTE)
// =========================
async function buscarTarefa() {
  const { data, error } = await supabase
    .from('fila_autorizacoes')
    .select('*')
    .eq('status', 'pendente')
	.eq('machine_id', MACHINE_ID)
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
async function atualizarStatus(id, status, extras = {}) {
  const { error } = await supabase
    .from('fila_autorizacoes')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extras
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
			.from('fila_autorizacoes')
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

      // Verifica status da máquina (ativa e restart_solicitado)
      const { data: maquinaStatus } = await supabase
        .from('maquinas')
        .select('ativa, restart_solicitado')
        .eq('id', MACHINE_ID)
        .maybeSingle()

      if (maquinaStatus?.restart_solicitado) {
        console.log('🔄 Reinício solicitado — encerrando processo...')
        await supabase.from('maquinas').update({ restart_solicitado: false }).eq('id', MACHINE_ID)
        setTimeout(() => process.exit(0), 500)
        return
      }

      if (maquinaStatus && maquinaStatus.ativa === false) {
        await new Promise(r => setTimeout(r, 5000))
        continue
      }

		console.log("🔎 Buscando tarefas...")

		const tarefa = await buscarTarefa()

		if (!tarefa) {
		  await new Promise(r => setTimeout(r, INTERVALO_SEM_TAREFA))
		  continue
		}

		console.log("📌 Tarefa encontrada:", tarefa.id)

      // =========================
      // 🔒 LOCK (CRÍTICO)
      // =========================
      const inicioExecucao = Date.now()

      const { data: lockData, error: lockError } = await supabase
        .from('fila_autorizacoes')
        .update({
          status: 'processando',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
      tarefaAtual = tarefa.id

      await registrarLog(tarefa.id, 'Iniciando execução')

      try {

        // ⛔ cancelamento
        if (await verificarCancelamento(tarefa.id)) {
          console.log("⛔ Cancelado antes de iniciar")
          continue
        }

        // 🚀 EXECUTANDO
        const resultado = await executarRpa(tarefa, verificarCancelamento);

		const agora = new Date().toISOString()
		const execMs = Date.now() - inicioExecucao

		if (resultado === 'sucesso') {
		  await atualizarStatus(tarefa.id, 'concluido', {
		    completed_at: agora,
		    execution_time_ms: execMs
		  });
		  await registrarLog(tarefa.id, 'Execução concluída');
		  console.log("✅ Concluído:", tarefa.id);
		} else if (resultado === 'glosa') {
		  await atualizarStatus(tarefa.id, 'glosa', {
		    completed_at: agora,
		    execution_time_ms: execMs
		  });
		  await registrarLog(tarefa.id, 'Glosa ASSIM detectada');
		  console.log("⛔ Glosa:", tarefa.id);
		} else if (resultado === 'cancelado') {
		  await atualizarStatus(tarefa.id, 'cancelado', {
		    completed_at: agora,
		    execution_time_ms: execMs
		  });
		  await registrarLog(tarefa.id, 'Cancelado pelo ASSIM (Liberado *)');
		  console.log("🚫 Cancelado:", tarefa.id);
		} else {
		  await atualizarStatus(tarefa.id, 'erro', {
		    completed_at: agora,
		    execution_time_ms: execMs
		  });
		  await registrarLog(tarefa.id, 'Falha na execução');
		  console.log("❌ Falha:", tarefa.id);
		}

		tarefaAtual = null
		await new Promise(r => setTimeout(r, 200))

      } catch (erroExecucao) {

        console.error("❌ Erro:", erroExecucao.message)

        // Não sobrescreve se rpa.js já gravou 'concluido' diretamente
        const { data: statusAtual } = await supabase
          .from('fila_autorizacoes')
          .select('status')
          .eq('id', tarefa.id)
          .single()

        if (statusAtual?.status !== 'concluido') {
          await atualizarStatus(tarefa.id, 'erro', {
            error_message: erroExecucao.message,
            completed_at: new Date().toISOString(),
            execution_time_ms: Date.now() - inicioExecucao
          })
        }

        await registrarLog(tarefa.id, erroExecucao.message)

        tarefaAtual = null
		await new Promise(r => setTimeout(r, 1000))

      }

    } catch (erroGeral) {

      console.error("❌ Erro geral:", erroGeral.message)

      await new Promise(r => setTimeout(r, 1000))
    }
  }
}


app.get('/health', (req, res) => {

  res.json({

  ok: true,

  worker: 'online',

  machine_id: MACHINE_ID,

  uptime: process.uptime(),

  timestamp: new Date().toISOString()
})
})

app.get('/machine-id', (req, res) => {

  res.json({
    machine_id: MACHINE_ID
  })
})

app.post('/restart', (req, res) => {
  res.json({ message: 'Reiniciando worker...' })
  setTimeout(() => process.exit(0), 500)
})

const LOCAL_API_PORT =
  process.env.LOCAL_API_PORT || 3010

app.listen(
  LOCAL_API_PORT,
  '127.0.0.1',
  () => {

    console.log(
      `🌐 API local ativa em http://127.0.0.1:${LOCAL_API_PORT}`
    )
  }
)


// =========================
// ▶ EXECUÇÃO
// =========================
module.exports = iniciarWorker

if (require.main === module) {
  iniciarWorker()
}