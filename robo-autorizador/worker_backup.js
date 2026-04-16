/**

* =========================
* WORKER RPA
* =========================
* Responsável por:
* * Buscar tarefas no Supabase
* * Executar automação (RPA)
* * Atualizar status
    */


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
.eq('status', 'pendente')
.eq('machine_id', MACHINE_ID)
.limit(1)
.maybeSingle();

if (error) {
console.error("Erro ao buscar tarefa:", error.message);
return null;
}

return data;
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

```
try {

  console.log("🔎 Buscando tarefas...");

  const tarefa = await buscarTarefa();

  if (!tarefa) {
    await new Promise(r => setTimeout(r, INTERVALO));
    continue;
  }

  console.log("📌 Tarefa encontrada:", tarefa.id);

  await atualizarStatus(tarefa.id, 'executando');
  await registrarLog(tarefa.id, 'Iniciando execução');

  // =========================
  // EXECUÇÃO DO RPA
  // =========================

  await executarRpa(tarefa);

  // =========================
  // FINALIZAÇÃO
  // =========================

  await atualizarStatus(tarefa.id, 'concluido');
  await registrarLog(tarefa.id, 'Execução concluída com sucesso');

  console.log("✅ Tarefa concluída:", tarefa.id);

} catch (erro) {

  console.error("❌ Erro na execução:", erro.message);

  if (erro?.tarefaId) {
    await atualizarStatus(erro.tarefaId, 'erro');
    await registrarLog(erro.tarefaId, erro.message);
  }

  // evita loop travado em erro
  await new Promise(r => setTimeout(r, INTERVALO));
}
```

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
