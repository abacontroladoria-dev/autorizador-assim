/**
 * =========================
 * RPA - AUTORIZAÇÃO ASSIM
 * =========================
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// =========================
// Funções Auxiliares
// =========================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function humanType(page, selector, texto) {
  await page.focus(selector);

  for (let i = 0; i < texto.length; i++) {
    await page.keyboard.type(texto[i]);

    let delay = 8 + Math.random() * 20;

    if (i % 5 === 0) delay += 40 + Math.random() * 80;
    if (texto[i] === ' ') delay += 60;

    await page.waitForTimeout(delay);

    if (Math.random() < 0.002 && i > 0) {
      await page.keyboard.press('Backspace');
      await page.keyboard.type(texto[i]);
    }
  }
}

async function aguardarTelaLivre(page, timeoutMs = 60000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
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

    if (modal === 0 && loader === 0) return;

    await page.waitForTimeout(1000);
  }
  throw new Error('Timeout: Assim não terminou de carregar (sistema travado)');
}

function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "");
}

// =========================
// CONFIG
// =========================
const URL = process.env.ASSIM_URL;
const TIPO_OPERACAO = process.env.ASSIM_TIPO_OPERACAO;
const NATUREZA = process.env.ASSIM_NATUREZA;
const TIPO_SERVICO = process.env.ASSIM_TIPO_SERVICO;
const EXECUTOR = process.env.ASSIM_EXECUTOR || '52345';
const SOLICITANTE_FIXO = process.env.ASSIM_SOLICITANTE || '8888';
const TIPO_CONSULTA = process.env.ASSIM_TIPO_CONSULTA;
const TIPO_SAIDA = process.env.ASSIM_TIPO_SAIDA;
const SISTEMA_URL = process.env.SISTEMA_URL;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// AGUARDAR ENVIO REAL
// =========================
async function aguardarResultadoEnvio(page, timeoutMs = 120000) {
  console.log("⏳ Aguardando confirmação real...");

  try {
    await page.waitForSelector('text=BENEFICIO PROCESSADO', {
      timeout: timeoutMs,
      state: 'visible'
    });

    console.log("✅ SUCESSO CONFIRMADO");
    return 'sucesso';

  } catch (e) {
    // Verifica resposta do ASSIM visível na página antes de declarar timeout
    try {
      const bodyText = await page.locator('body').innerText();

      if (/Liberado \*/.test(bodyText)) {
        console.log("🚫 CANCELADO pelo ASSIM (Liberado *)");
        return 'cancelado';
      }

      // Código de rejeição: padrão NNNN-TEXTO (ex: "1601-REINCIDENCIA NO ATEN")
      const glosaMatch = bodyText.match(/\b\d{4}-[A-ZÁÉÍÓÚÃÕÂÊÔÇ\s]+/);
      if (glosaMatch) {
        console.log("⛔ GLOSA DETECTADA:", glosaMatch[0].trim());
        return 'glosa';
      }
    } catch (_) {}

    console.log("❌ Não apareceu confirmação");
    return 'timeout';
  }
}

async function selecionarFormaValidacao(page) {
  return await page.evaluate(() => {
    return new Promise(resolve => {

      const opcoes = [
        "Biometria",
        "QR Code",
        "Token",
        "Erro no Reconhecimento Facial",
        "Beneficiário recusou validação facial/QR Code",
        "Beneficiário sem celular"
      ];

      const overlay = document.createElement('div');

      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.zIndex = '2147483647';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.fontFamily = 'Arial';

      const modal = document.createElement('div');

      modal.style.width = '520px';
      modal.style.maxWidth = 'calc(100% - 32px)';
      modal.style.background = '#fff';
      modal.style.borderRadius = '10px';
      modal.style.padding = '24px';
      modal.style.boxShadow = '0 20px 60px rgba(0,0,0,.25)';

      const titulo = document.createElement('h2');

      titulo.innerText = 'Selecione a forma da autorização';
      titulo.style.marginTop = '0';
      titulo.style.marginBottom = '20px';
      titulo.style.fontSize = '20px';

      modal.appendChild(titulo);

      const lista = document.createElement('div');

      lista.style.display = 'flex';
      lista.style.flexDirection = 'column';
      lista.style.gap = '10px';

      opcoes.forEach(opcao => {

        const botao = document.createElement('button');

        botao.innerText = opcao;

        botao.style.padding = '12px';
        botao.style.border = '1px solid #d1d5db';
        botao.style.borderRadius = '8px';
        botao.style.background = '#fff';
        botao.style.cursor = 'pointer';
        botao.style.fontSize = '15px';
        botao.style.textAlign = 'left';

        botao.onmouseenter = () => {
          botao.style.background = '#f3f4f6';
        };

        botao.onmouseleave = () => {
          botao.style.background = '#fff';
        };

        botao.onclick = () => {
          overlay.remove();
          resolve(opcao);
        };

        lista.appendChild(botao);
      });

      modal.appendChild(lista);
      overlay.appendChild(modal);

      document.body.appendChild(overlay);
    });
  });
}


// =========================
// FUNÇÃO PRINCIPAL
// =========================
async function executarRpa(tarefa, verificarCancelamento) {

  if (!verificarCancelamento) {
    verificarCancelamento = async () => false;
  }

const browser = await chromium.connectOverCDP(
  'http://127.0.0.1:9222'
);

const context = browser.contexts()[0];

const page = await context.newPage();

  let sucessoExecucao = false;
  let formaValidacaoFinal = null;

  try {
    console.log("🚀 Iniciando RPA...");
    console.log("Paciente:", tarefa.paciente_nome);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.selectOption('select[name="operacao"]', { label: TIPO_OPERACAO });
    await page.selectOption('select[name="natureza"]', { label: NATUREZA });
    await page.selectOption('select[name="servico"]', { label: TIPO_SERVICO });

    if (await verificarCancelamento(tarefa.id)) {
      throw new Error("Execução cancelada");
    }

    if (!tarefa.empresa || !tarefa.matricula || !tarefa.dep) {
      throw new Error("Dados do associado incompletos");
    }

    await humanType(page, 'input[name="associado1"]', tarefa.empresa);
    await humanType(page, 'input[name="associado2"]', tarefa.matricula);
    await humanType(page, 'input[name="associado3"]', tarefa.dep);

    await page.press('input[name="associado3"]', 'Tab');
    await aguardarTelaLivre(page);

    await humanType(page, 'input[name="findexec"]', EXECUTOR);
    await aguardarTelaLivre(page);

    await page.selectOption('select[name="exec"]', {
      label: '52345 - UNIVERSO ABA CLINICA TERA'
    });

    await humanType(page, 'input[name="procura"]', SOLICITANTE_FIXO);
    await aguardarTelaLivre(page);

    await page.click('input[name="butproc"]');

    if (!tarefa.crm) throw new Error("CRM não informado");
    await page.fill('input[name="crmsolic"]', tarefa.crm);

    if (!tarefa.nome_medico) throw new Error("Nome do médico não informado");
    await page.fill('input[name="findsolic"]', normalizarTexto(tarefa.nome_medico));

    if (!tarefa.tuss) throw new Error("TUSS não informado");
    await humanType(page, 'input[name="ttuss1"]', tarefa.tuss);

    await page.selectOption('select[name="tipoDeConsulta"]', { label: TIPO_CONSULTA });
    await page.selectOption('select[name="tipoDeSaida"]', { label: TIPO_SAIDA });

    console.log("📤 Aguardando envio manual...");

    const resultado = await aguardarResultadoEnvio(page);

    if (resultado === 'sucesso') {

		console.log("📄 Aguardando tela final...");

		await delay(1000);

		// Tenta capturar número de autorização gerado pelo ASSIM
		let numeroAutorizacao = null;
		try {
		  const textoConfirmacao = await page.locator('body').innerText();
		  const match =
		    textoConfirmacao.match(/n[uú]mero.*?[:\s]+(\d{6,15})/i) ||
		    textoConfirmacao.match(/autoriza[cç][aã]o.*?[:\s]+(\d{6,15})/i) ||
		    textoConfirmacao.match(/senha.*?[:\s]+(\d{6,15})/i);
		  if (match) {
		    numeroAutorizacao = match[1];
		    console.log("🔢 Número de autorização:", numeroAutorizacao);
		  }
		} catch (_) {}

		const formaValidacao =
		  await selecionarFormaValidacao(page);

		formaValidacaoFinal = formaValidacao;

		console.log(
		  "✅ Forma de validação:",
		  formaValidacao
		);

		const updatePayload = {
		  status: 'concluido',
		  forma_autorizacao: formaValidacao,
		  validacao_finalizada_em: new Date().toISOString()
		};
		if (numeroAutorizacao) {
		  updatePayload.numero_autorizacao = numeroAutorizacao;
		}

		const { error } = await supabase
		  .from('fila_autorizacoes')
		  .update(updatePayload)
		  .eq('id', tarefa.id);

		if (error) {
		  throw error;
		}

		console.log("💾 Forma de autorização salva");

		sucessoExecucao = true;

		await delay(1000);

		console.log("✅ RPA finalizado");

		return 'sucesso';
    }

    if (resultado === 'timeout') {
      throw new Error("Usuário não clicou em enviar");
    }

	  } catch (erro) {

		console.error("❌ Erro completo:", erro);
		const { data: atual } = await supabase
		  .from('fila_autorizacoes')
		  .select(`
			status,
			forma_autorizacao,
			validacao_finalizada_em
		  `)
		  .eq('id', tarefa.id)
		  .single();

		const jaConcluido =
		  atual?.status === 'concluido' ||
		  atual?.forma_autorizacao ||
		  atual?.validacao_finalizada_em;

		if (!jaConcluido) {

		  await supabase
			.from('fila_autorizacoes')
			.update({
			  status: 'erro',
			  erro_rpa: erro.message
			})
			.eq('id', tarefa.id);

		}
		throw erro;

	  } finally {

		if (sucessoExecucao) {

		  if (formaValidacaoFinal === 'Token') {
		    console.log("🖨️ Token selecionado — aba mantida aberta para impressão");
		  } else {
		    console.log("✅ Execução finalizada");
		    try { await page.close(); } catch (_) {}
		  }

		} else {

		  console.log("🧪 Aba mantida aberta para debug");

		}

	  }
}
module.exports = executarRpa;
