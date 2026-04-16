/*
* =========================
* WORKER RPA
* =========================
* Responsável por:
* * Buscar tarefas no Supabase
* * Executar automação (RPA)
* * Atualizar status
*/

// =========================
// CARREGAR ENV
// =========================
require('dotenv').config({ path: __dirname + '/.env' })


// =========================
// CHAMAR O RPA
// =========================
const executarRpa = require('./rpa')


// =========================
// SUPABASE
// =========================
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// =========================
// CONFIGURAÇÃO
// =========================
const os = require('os')

const MACHINE_ID = process.env.MACHINE_ID
const INTERVALO = 5000 // (não vamos usar polling depois)

console.log('Worker iniciado na máquina:', MACHINE_ID)

// =========================
// BUSCAR TAREFA
// =========================

async function buscarTarefa() {
  const { data, error } = await supabase
    .from('autorizacoes')
    .select('*')
    .eq('status', 'executando')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    console.error("Erro:", error.message);
    return null;
  }

  return data.length > 0 ? data[0] : null;
}

// =========================
// ATUALIZAR STATUS
// =========================

async function atualizarStatus(id, status) {
const { error } = await supabase
.from('autorizacoes')
.update({
status,
updated_at: new Date().toISOString()
})
.eq('id', id);

if (error) {
console.error("Erro ao atualizar status:", error.message);
}
}

// =========================
// ABORTAR A EXECUÇÃO
// =========================
async function verificarCancelamento(id) {
  const { data } = await supabase
    .from('autorizacoes')
    .select('status')
    .eq('id', id)
    .single()

  return !['executando', 'executando'].includes(data?.status)
}


// =========================
// LOG (OPCIONAL)
// =========================

async function registrarLog(autorizacao_id, mensagem) {
const { error } = await supabase
.from('logs')
.insert([
{
autorizacao_id,
mensagem
}
]);

if (error) {
console.error("Erro ao registrar log:", error.message);
}
}

// =========================
// LOOP PRINCIPAL
// =========================

async function iniciarWorker() {

  console.log("=================================");
  console.log("🤖 WORKER RPA INICIADO");
  console.log("💻 Máquina:", MACHINE_ID);
  console.log("=================================");

  while (true) {

    try {

      console.log("🔎 Buscando tarefas...");

      const tarefa = await buscarTarefa();

      if (!tarefa) {
        await new Promise(r => setTimeout(r, INTERVALO));
        continue;
      }

      console.log("📌 Tarefa encontrada:", tarefa.id);

      // 🔒 LOCK da tarefa
      console.log("📌 TAREFA:", tarefa)
		console.log("🆔 ID:", tarefa?.id)
		const { data: lockData, error: lockError } = await supabase
			  .from('autorizacoes')
			  .update({ status: 'executando' }) // 🔥 novo status intermediário
			  .match({
				id: tarefa.id,
				status: 'executando'
			  })
			  .select();

      if (lockError) {
        console.error("Erro ao travar tarefa:", lockError.message);
        continue;
      }

      if (!lockData || lockData.length === 0) {
        console.log("⚠️ Tarefa já foi processada");
        await new Promise(r => setTimeout(r, 2000))
		continue;
      }

      // =========================
      // EXECUÇÃO DO RPA
      // =========================

      await registrarLog(tarefa.id, 'Iniciando execução');

      try {

		// antes de começar
		if (await verificarCancelamento(tarefa.id)) {
		console.log('⛔ Cancelado antes de iniciar')
		continue
		}

		await executarRpa(tarefa);
		
        await atualizarStatus(tarefa.id, 'concluido');
        await registrarLog(tarefa.id, 'Execução concluída com sucesso');

        console.log("✅ Tarefa concluída:", tarefa.id);

        await new Promise(r => setTimeout(r, 1500));

      } catch (erroExecucao) {

        console.error("❌ Erro na execução:", erroExecucao.message);

        await atualizarStatus(tarefa.id, 'erro');
        await registrarLog(tarefa.id, erroExecucao.message);

        await new Promise(r => setTimeout(r, INTERVALO));
      }

    } catch (erroGeral) {

      console.error("❌ Erro geral do worker:", erroGeral.message);

      await new Promise(r => setTimeout(r, INTERVALO));
    }
  }
}


// =========================
// EXPORT / EXECUÇÃO
// =========================

module.exports = iniciarWorker;

// permite rodar direto com node worker.js
if (require.main === module) {
iniciarWorker();
}
