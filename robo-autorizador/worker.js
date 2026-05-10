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
	// 🔄 SINCRONIZAÇÃO DE AGENDA
	// =========================
	async function verificarSync() {
	  try {

		const { data, error } = await supabase
		  .from('sync_controle')
		  .select('*')
		  .eq('id', 1)
		  .single()

		if (error || !data) return

		// 🔥 AQUI (logo após buscar os dados)
		const tempoMaximo = 15 * 60 * 1000 // 15 min

		if (data.status === 'running') {
		  const ultima = new Date(data.updated_at).getTime()

		  if (Date.now() - ultima > tempoMaximo) {
			console.log(`⚠️ RESET SYNC - máquina anterior: ${data.machine_id}`)

			await supabase
			  .from('sync_controle')
			  .update({ status: 'idle' })
			  .match({ id: 1, status: 'running' })

			return
		  }
		}

		const agora = Date.now()
		const ultimaExecucao = data.last_run
		  ? new Date(data.last_run).getTime()
		  : 0

		const passou4h = agora - ultimaExecucao > 4 * 60 * 60 * 1000

		// ✅ VALIDAÇÃO ANTES DO LOCK
		if (data.status !== 'pendente') return
		if (!passou4h && !data.force) return

		// 🔐 LOCK ATÔMICO
		const { data: lockData, error: lockError } = await supabase
		  .from('sync_controle')
		  .update({
			status: 'running',
			machine_id: MACHINE_ID,
			updated_at: new Date().toISOString()
		  })
		  .match({
		    id: 1,
		    status: 'pendente',
		    machine_id: 'admin'
		  })
		  .select()

		if (lockError) {
		  console.error("Erro ao travar sync:", lockError.message)
		  return
		}

		if (!lockData || lockData.length === 0) {
		  console.log("⚠️ Outro worker já iniciou a sync")
		  return
		}

		console.log("🔐 LOCK DE SYNC OK")
		console.log("🔄 INICIANDO SINCRONIZAÇÃO...")

		// 🚀 EXECUTA
		await executarSincronizacao(supabase)

		await supabase
		  .from('sync_controle')
		  .update({
			status: 'idle',
			force: false,
			last_run: new Date().toISOString(),
			updated_at: new Date().toISOString()
		  })
		    .match({
			id: 1,
			status: 'running'
		  })

		console.log("✅ SINCRONIZAÇÃO FINALIZADA")

	  } catch (err) {
		console.error("❌ ERRO NA SYNC:", err.message)

		await supabase
		  .from('sync_controle')
		  .update({
			status: 'idle',
			force: false,
			updated_at: new Date().toISOString()
		  })
		  .match({
		  id: 1,
		  status: 'running'
		})
	  }
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

		const { data: sync } = await supabase
		  .from('sync_controle')
		  .select('status')
		  .eq('id', 1)
		  .single()

		if (sync?.status === 'running') {
		  console.log("⏳ Sincronização em andamento...")
		  await new Promise(r => setTimeout(r, INTERVALO))
		  continue
		}

		// 🔥 aqui permanece
		await verificarSync()

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
        const resultado = await executarRpa(tarefa, verificarCancelamento);

		if (resultado === 'sucesso') {
		  await atualizarStatus(tarefa.id, 'concluido');
		  await registrarLog(tarefa.id, 'Execução concluída');
		  console.log("✅ Concluído:", tarefa.id);
		} else {
		  await atualizarStatus(tarefa.id, 'erro');
		  await registrarLog(tarefa.id, 'Falha na execução');
		  console.log("❌ Falha:", tarefa.id);
		}
        
		await new Promise(r => setTimeout(r, 200))

      } catch (erroExecucao) {

        console.error("❌ Erro:", erroExecucao.message)

        await atualizarStatus(tarefa.id, 'erro')

        await registrarLog(tarefa.id, erroExecucao.message)
		
		await new Promise(r => setTimeout(r, 1000))
		
      }

    } catch (erroGeral) {

      console.error("❌ Erro geral:", erroGeral.message)

      await new Promise(r => setTimeout(r, 1000))
    }
  }
}


// =====================================
// EXECUTAR A SINCRONIZAÇÃO COM O ORBITA
// =====================================
const executarSincronizacao = require('./sync')




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