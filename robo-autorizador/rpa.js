/**
 * =========================
 * RPA - AUTORIZAÇÃO ASSIM (FINAL PRODUÇÃO)
 * =========================
 */

require('dotenv').config();
const { chromium } = require('playwright');

// =========================
// Funções Auxiliares
// =========================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function humanType(page, selector, texto) {
  await page.focus(selector);

  await page.waitForTimeout(100 + Math.random() * 100); // antes 200~500

  for (let i = 0; i < texto.length; i++) {
    await page.keyboard.type(texto[i]);

    // ⚡ mais rápido (antes era 50~150)
    await page.waitForTimeout(20 + Math.random() * 40);

    // erro humano mais raro
    if (Math.random() < 0.005 && i > 0) {
      await page.keyboard.press('Backspace');
      await page.keyboard.type(texto[i]);
      console.log("👤 Correção simulada");
    }
  }

  console.log(`⚡ Digitado rápido: ${texto}`);
}

async function aguardarTelaLivre(page) {
  console.log("⏳ AGUARDANDO INTERAÇÃO DO USUÁRIO (SEM TIMEOUT)");

  let tentativas = 0;

  while (true) {
    const modal = await page.locator(`
      .jconfirm-box:visible,
      .modal:visible,
      [role="dialog"]:visible
    `).count();

    const loader = await page.locator(`
      img[src*="Load_Assim"]:visible,
      .loading:visible,
      .spinner:visible,
      .overlay:visible,
      [class*="loader"]:visible
    `).count();

    const qr = await page.locator(`
      button:has-text("QR Code"):visible,
      canvas[aria-label*="QR"]:visible
    `).count();

    console.log(`⏳ Esperando... Modal:${modal} | Loader:${loader} | QR:${qr}`);

    if (modal === 0 && loader === 0 && qr === 0) {
      console.log("✅ TELA LIVRE — USUÁRIO FINALIZOU");
      return;
    }

    tentativas++;

    // 👇 log a cada 10s pra não poluir
    if (tentativas % 10 === 0) {
      console.log("⌛ Ainda aguardando usuário...");
    }

    await page.waitForTimeout(1000);
  }
}

// =========================
// CONFIG (.env)
// =========================
const URL = process.env.ASSIM_URL;
const TIPO_OPERACAO = process.env.ASSIM_TIPO_OPERACAO;
const NATUREZA = process.env.ASSIM_NATUREZA;
const TIPO_SERVICO = process.env.ASSIM_TIPO_SERVICO;
const EXECUTOR = process.env.ASSIM_EXECUTOR || '52345';  // Fallback
const SOLICITANTE_FIXO = process.env.ASSIM_SOLICITANTE || '8888';  // Fallback
const TIPO_CONSULTA = process.env.ASSIM_TIPO_CONSULTA;
const TIPO_SAIDA = process.env.ASSIM_TIPO_SAIDA;

// =========================
// FUNÇÃO PRINCIPAL
// =========================
async function executarRpa(tarefa, verificarCancelamento) {

  if (!verificarCancelamento) {
    console.log("⚠️ verificarCancelamento não enviado — ignorando validação");
    verificarCancelamento = async () => false;
  }
  console.log("🚀 Iniciando RPA...");
  console.log("Paciente:", tarefa.paciente_nome);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ACESSO
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await delay(1000);
    console.log("🌐 Página carregada");

    // 1-3. CABEÇALHO
    await page.selectOption('select[name="operacao"]', { label: TIPO_OPERACAO });
    await page.selectOption('select[name="natureza"]', { label: NATUREZA });
    await page.selectOption('select[name="servico"]', { label: TIPO_SERVICO });
    await delay(500);
    console.log("✅ Cabeçalho preenchido");

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
	// 4-6. ASSOCIADOS (CORRIGIDO)
	if (!tarefa.empresa) throw new Error("Empresa não informada");
	if (!tarefa.matricula) throw new Error("Matrícula não informada");
	if (!tarefa.dep) throw new Error("Dependente não informado");

	console.log("🏢 Empresa:", tarefa.empresa);
	console.log("🧾 Matrícula:", tarefa.matricula);
	console.log("👶 Dep:", tarefa.dep);

	// EMPRESA (associado1)
	await humanType(page, 'input[name="associado1"]', tarefa.empresa);

	// MATRÍCULA (associado2)
	await humanType(page, 'input[name="associado2"]', tarefa.matricula);

	// DEP (associado3)
	await humanType(page, 'input[name="associado3"]', tarefa.dep);


	// TAB (sair do campo)
	await page.press('input[name="associado3"]', 'Tab');

	// aguarda sistema reagir (ESSENCIAL)
	await aguardarTelaLivre(page);

		await delay(1000)

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 7. EXECUTOR (HUMANO + DROPDOWN EXATO)
    await humanType(page, 'input[name="findexec"]', EXECUTOR);
    await aguardarTelaLivre(page, 120);
    await page.click('select[name="exec"]');
    await page.selectOption('select[name="exec"]', { label: '52345 - UNIVERSO ABA CLINICA TERA' });
    await page.keyboard.press('Tab');  // Corrigido: keyboard.press (string literal)
    console.log("✅ EXECUTOR selecionado");

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 8. SOLICITANTE (HUMANO + CLIQUE PROCURA)
    await humanType(page, 'input[name="procura"]', SOLICITANTE_FIXO);
    await aguardarTelaLivre(page, 120);
    await page.click('input[name="butproc"]');
    await delay(1500);
    console.log("✅ SOLICITANTE processado");

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 9. CRM
    if (!tarefa.crm) throw new Error("CRM não informado");
    await page.fill('input[name="crmsolic"]', tarefa.crm);
    await page.press('input[name="crmsolic"]', 'Tab');
	
	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 10. NOME MÉDICO
    if (!tarefa.nome_medico) throw new Error("Nome do médico não informado");
    await page.fill('input[name="findsolic"]', tarefa.nome_medico);

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 11. TUSS1
	if (!tarefa.tuss) throw new Error("TUSS não informado");
	await humanType(page, 'input[name="ttuss1"]', tarefa.tuss);
	console.log("✅ TUSS preenchido");

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 12-13. TIPOS
    await page.selectOption('select[name="tipoDeConsulta"]', { label: TIPO_CONSULTA });
    await page.selectOption('select[name="tipoDeSaida"]', { label: TIPO_SAIDA });
    console.log("✅ Dados finais preenchidos");

    console.log("📤 RPA CONCLUÍDO - Pronto para ENVIO manual");

  } catch (erro) {
    console.error("❌ Erro no RPA:", erro.message);
    const error = new Error(erro.message);
    error.tarefaId = tarefa.id;
    throw error;
  } finally {
		console.log("🧪 DEBUG MODE - navegador aberto");
		// await browser.close();
	}
}

module.exports = executarRpa;