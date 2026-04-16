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
  await page.waitForTimeout(200 + Math.random() * 300);
  
  for (let i = 0; i < texto.length; i++) {
    await page.keyboard.type(texto[i]);
    await page.waitForTimeout(50 + Math.random() * 100);
    
    if (Math.random() < 0.01 && i > 0) {
      await page.keyboard.press('Backspace');
      await page.keyboard.type(texto[i]);
      console.log("👤 Erro humano simulado + correção");
    }
  }
  
  await page.keyboard.press('Tab');
  console.log(`✅ Digitado humano: ${texto}`);
}

async function aguardarTelaLivre(page, maxTentativas = 900) {  // ~15min
  console.log("⏳ RPA PAUSADO: Aguardando modais/QR/loader GIF ASSIM...");
  let tentativas = 0;
  
  while (tentativas < maxTentativas) {
    const modalPrincipal = await page.locator('.jconfirm-box:visible, .jconfirm-type-green:visible, .jconfirm-box-container:visible, [role="dialog"]:visible, .modal:visible').count();
    const loaderAssim = await page.locator('img[src="./images/Load_Assim_150.gif"]:visible, img[src*="Load_Assim"]:visible, img[src*="assim"]:visible, .loading:visible, .spinner:visible, .jconfirm-holder:visible, div[style*="animation"]:visible, div[class*="logo"]:visible, div[class*="assim"]:visible, .overlay:visible, [class*="loader"]:visible').count();
    const modalSecundario = await page.locator('text=Confirme os dados abaixo, text=Identificação:visible').count();
    const qrCode = await page.locator('button:has-text("QR Code"):visible, canvas[aria-label*="QR"]:visible, .qr-scanner:visible').count();
    
    console.log(`PAUSA ${tentativas}: Modal=${modalPrincipal} | Loader GIF=${loaderAssim} | Sec=${modalSecundario} | QR=${qrCode}`);
    
    if (modalPrincipal === 0 && loaderAssim === 0 && modalSecundario === 0 && qrCode === 0) {
      console.log("✅ TELA 100% LIVRE - RPA LIBERADO");
      return;
    }
    
    tentativas++;
    await page.waitForTimeout(1000);
  }
  
  throw new Error(`⏰ TIMEOUT 15min: Loader GIF ASSIM/modal persistiu. Resolva manual (CONFIRMO/QR).`);
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
async function executarRpa(tarefa) {
  console.log("🚀 Iniciando RPA...");
  console.log("Paciente:", tarefa.paciente_nome);
  console.log("Terapia (controle):", tarefa.terapia);

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

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}

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
	
    // 4-6. ASSOCIADOS (PAUSA DEP)
	console.log('VALOR DO CAMPO:', tarefa.paciente_nome)
	console.log('TIPO:', typeof tarefa.paciente_nome)
    await page.fill('input[name="associado1"]', tarefa.matricula);
    await page.press('input[name="associado1"]', 'Tab');
    await page.fill('input[name="associado2"]', tarefa.matricula);
    await page.press('input[name="associado2"]', 'Tab');
    await page.fill('input[name="associado3"]', tarefa.dep);
    await page.locator('input[name="associado3"]').blur();
    await aguardarTelaLivre(page);

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
    await page.press('input[name="findsolic"]', 'Tab');

	// VERIFICA CANCELAMENTO
	if (await verificarCancelamento(tarefa.id)) {
	console.log('⛔ Execução cancelada após carregar página');
	return;
	}
	
    // 11. TUSS1
    if (!tarefa.tuss1) throw new Error("TUSS não informado");
    await page.fill('input[name="ttuss1"]', tarefa.tuss1);
    await page.press('input[name="ttuss1"]', 'Tab');
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
    await browser.close();
    console.log("🧹 Navegador fechado");
  }
}

module.exports = executarRpa;