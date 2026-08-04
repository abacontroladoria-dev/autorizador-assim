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

async function aguardarTelaLivre(page) {
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

    if (modal === 0 && loader === 0) return;

    await page.waitForTimeout(1000);
  }
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
async function executarRpa(tarefa, verificarCancelamento, browser) {

  if (!verificarCancelamento) {
    verificarCancelamento = async () => false;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  let sucessoExecucao = false;

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

    // UF do CRM solicitante. O portal fica em RJ por padrão; se o médico é de
    // outro estado (ex.: SP) a guia é rejeitada. Localiza o <select> de UF pelas
    // próprias opções (contém RJ e SP), sem depender do name exato do campo.
    const ufMedico = (tarefa.crm_uf || 'RJ').toUpperCase();
    const ufSelecionada = await page.evaluate((uf) => {
      const setUf = (sel) => {
        const opt = Array.from(sel.options).find(o =>
          (o.value || '').trim().toUpperCase() === uf ||
          (o.textContent || '').trim().toUpperCase() === uf);
        if (!opt) return null;
        sel.value = opt.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return sel.name || '(sem name)';
      };
      // 1) campo conhecido do portal ASSIM
      const ufcrm = document.querySelector('select[name="ufcrm"]');
      if (ufcrm) { const r = setUf(ufcrm); if (r) return r; }
      // 2) fallback: qualquer <select> cujas opções contenham RJ e SP
      for (const sel of Array.from(document.querySelectorAll('select'))) {
        const up = Array.from(sel.options).map(o => (o.value || o.textContent || '').trim().toUpperCase());
        if (up.includes('RJ') && up.includes('SP')) { const r = setUf(sel); if (r) return r; }
      }
      return null;
    }, ufMedico);
    if (ufSelecionada) console.log(`✅ UF do CRM = ${ufMedico} (campo: ${ufSelecionada})`);
    else console.warn(`⚠️ Campo de UF não localizado; mantido o default (UF alvo: ${ufMedico})`);

    if (!tarefa.tuss) throw new Error("TUSS não informado");
    await humanType(page, 'input[name="ttuss1"]', tarefa.tuss);

    await page.selectOption('select[name="tipoDeConsulta"]', { label: TIPO_CONSULTA });
    await page.selectOption('select[name="tipoDeSaida"]', { label: TIPO_SAIDA });

    console.log("📤 Aguardando envio manual...");

    const resultado = await aguardarResultadoEnvio(page);

    if (resultado === 'sucesso') {

		console.log("📄 Aguardando tela final...");

		await page.waitForLoadState('networkidle');
		await delay(2000);

		// Captura o nº da guia e a data/hora da tela de confirmação
		// ("Documento: AD... / 000437530", "Data: 28/07/26 - 08:44:47").
		// Guia: grava SEM zeros à esquerda para casar com autorizacoes_assim.guia
		// (ex.: 437530) — é a âncora da vinculação por guia (item 5): a autorização
		// fica presa a ESTA fila, evitando que uma guia retroativa case com o
		// atendimento de hoje.
		// Data: monta a string direto dos dígitos capturados (sem passar por
		// `new Date()`) para não sofrer conversão de fuso do processo Node — grava
		// exatamente o horário que a própria ASSIM registrou para a autorização.
		const { numeroGuia, dataConfirmacao } = await page.evaluate(() => {
		  const txt = (document.body && document.body.innerText) || '';
		  const guiaMatch = txt.match(/Documento:\s*[A-Za-z0-9]+\s*\/\s*0*(\d+)/i);
		  const dataMatch = txt.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2}):(\d{2}):(\d{2})/);
		  let dataConfirmacao = null;
		  if (dataMatch) {
			const [, dd, mm, yy, hh, mi, ss] = dataMatch;
			dataConfirmacao = `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
		  }
		  return { numeroGuia: guiaMatch ? guiaMatch[1] : null, dataConfirmacao };
		});
		if (numeroGuia) console.log("🧾 Guia capturada:", numeroGuia);
		else console.warn("⚠️ Não foi possível capturar o número da guia da tela");
		if (dataConfirmacao) console.log("🕒 Data/hora da confirmação capturada:", dataConfirmacao);
		else console.warn("⚠️ Não foi possível capturar a data/hora da tela de confirmação");

		const formaValidacao =
		  await selecionarFormaValidacao(page);

		console.log(
		  "✅ Forma de validação:",
		  formaValidacao
		);

		const updatePayload = {
		  status: 'concluido',
		  forma_autorizacao: formaValidacao,
		  validacao_finalizada_em: new Date().toISOString()
		};
		if (numeroGuia)      updatePayload.numero_autorizacao = numeroGuia;
		if (dataConfirmacao) updatePayload.horario_autorizacao = dataConfirmacao;

		const { error } = await supabase
		  .from('fila_autorizacoes')
		  .update(updatePayload)
		  .eq('id', tarefa.id);

		if (error) {
		  throw error;
		}

		console.log("💾 Forma de autorização salva");

		sucessoExecucao = true;

		console.log("✅ RPA finalizado");
		console.log("🧪 Navegador mantido aberto");

		return 'sucesso';
    }

    if (resultado === 'timeout') {
      throw new Error("Usuário não clicou em enviar");
    }

	  } catch (erro) {

		console.error("❌ Erro no RPA:", erro.message);

		// Só atualiza para 'erro' se o RPA ainda não concluiu com sucesso
		if (!sucessoExecucao) {
		  await supabase
			.from('fila_autorizacoes')
			.update({
			  status: 'erro'
			})
			.eq('id', tarefa.id);
		}

		throw erro;

	  } finally {

		if (sucessoExecucao) {
		  console.log("✅ Aba mantida aberta para impressão/conferência");
		} else {
		  console.log("🧪 Aba mantida aberta para debug");
		}

	  }
}
module.exports = executarRpa;
