/*
* =========================
* WORKER RPA
* =========================
*/

require('dotenv').config({ path: __dirname + '/.env' })

const executarRpa = require('./rpa')

const os = require('os')

const { chromium } = require('playwright')

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

const INTERVALO = 3000

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
async function atualizarStatus(id, status) {
  const { error } = await supabase
    .from('fila_autorizacoes') // ✅ CORRIGIDO
    .update({
      status,
      updated_at: new Date().toISOString(),
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
// 🖥️ AUTO-REGISTRO DA MÁQUINA
// =========================
async function registrarMaquina() {
  const agora = new Date().toISOString()

  const { error } = await supabase
    .from('maquinas')
    .upsert({
      id: MACHINE_ID,
      nome: MACHINE_ID,
      hostname: os.hostname(),
      sistema_operacional: `${os.type()} ${os.release()}`,
      ativa: true,
      last_seen: agora,
      updated_at: agora,
    }, { onConflict: 'id', ignoreDuplicates: false })

  if (error) {
    console.error('⚠️ Erro ao registrar máquina:', error.message)
  } else {
    console.log('✅ Máquina registrada/atualizada:', MACHINE_ID)
  }
}

// =========================
// 💓 HEARTBEAT
// =========================
function iniciarHeartbeat(intervaloMs = 30000) {
  setInterval(async () => {
    const agora = new Date().toISOString()
    await supabase
      .from('maquinas')
      .update({ last_seen: agora, updated_at: agora })
      .eq('id', MACHINE_ID)
  }, intervaloMs)
}

// =========================
// 🚀 LOOP PRINCIPAL
// =========================
async function iniciarWorker() {

  console.log("=================================")
  console.log("🤖 WORKER RPA INICIADO")
  console.log("💻 Máquina:", MACHINE_ID)
  console.log("=================================")

  await registrarMaquina()
  iniciarHeartbeat(30000)

  let browser = await chromium.launch({ headless: false })
  console.log("🌐 Browser iniciado")

  browser.on('disconnected', () => {
    console.log("⚠️ Browser fechado pela recepcionista — será relançado na próxima tarefa")
    browser = null
  })

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
		  await new Promise(r => setTimeout(r, 500))
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
        if (!browser || !browser.isConnected()) {
          browser = await chromium.launch({ headless: false })
          console.log("🌐 Browser relançado")
          browser.on('disconnected', () => {
            console.log("⚠️ Browser fechado pela recepcionista — será relançado na próxima tarefa")
            browser = null
          })
        }

        const resultado = await executarRpa(tarefa, verificarCancelamento, browser);

		// O rpa.js gerencia o status internamente ('concluido' ou 'erro').
		// O worker só registra o log com base no retorno.
		if (resultado === 'sucesso') {
		  await registrarLog(tarefa.id, 'Execução concluída');
		  console.log("✅ Concluído:", tarefa.id);
		} else {
		  await registrarLog(tarefa.id, 'Falha na execução');
		  console.log("❌ Falha:", tarefa.id);
		}
        
		await new Promise(r => setTimeout(r, 200))

      } catch (erroExecucao) {

        console.error("❌ Erro:", erroExecucao.message)

        // O rpa.js já atualizou para 'erro' antes de relançar a exceção.
        // O worker só registra o log para não sobrescrever o status.
        await registrarLog(tarefa.id, erroExecucao.message)

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