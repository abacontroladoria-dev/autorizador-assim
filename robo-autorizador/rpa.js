/**
 * =========================
 * RPA - AUTORIZAÇÃO ASSIM (COM TOKEN + PDF)
 * =========================
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
// NOME DO ARQUIVO
// =========================
function nomeArquivoSeguro(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

function mesAbreviado(mes) {
  const meses = [
    "JAN","FEV","MAR","ABR","MAI","JUN",
    "JUL","AGO","SET","OUT","NOV","DEZ"
  ];
  return meses[mes];
}

function gerarNomeArquivo(dataISO, nomePaciente) {
  const d = new Date(dataISO);

  const dia = String(d.getDate()).padStart(2, '0');
  const mes = mesAbreviado(d.getMonth());
  const ano = d.getFullYear();

  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  const nome = nomeArquivoSeguro(nomePaciente);

  return `${dia}${mes}${ano}_${nome}_${hora}-${min}.pdf`;
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

// =========================
// FUNÇÃO PRINCIPAL
// =========================
async function executarRpa(tarefa, verificarCancelamento) {

  if (!verificarCancelamento) {
    verificarCancelamento = async () => false;
  }

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  let sucessoExecucao = false;

  // 📁 pasta fixa
  const pastaFilipetas = path.join(__dirname, 'filipetas');
  fs.mkdirSync(pastaFilipetas, { recursive: true });

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

      console.log("🔎 Verificando fluxo de token...");

      const fluxoToken = await page.locator('text=Token enviado para').isVisible().catch(() => false);

      if (fluxoToken) {
        console.log("🔐 Token detectado");

        console.log("⌛ Aguardando confirmação do usuário...");
        await page.waitForSelector('text=Token enviado para', { state: 'detached', timeout: 120000 });

        console.log("📄 Aguardando tela final...");
        await page.waitForLoadState('networkidle');
        await delay(2000);

        // 📄 gerar nome do arquivo
        const nomeArquivo = gerarNomeArquivo(
          tarefa.data_sessao || new Date(),
          tarefa.paciente_nome
        );

        console.log("🖨️ Salvando PDF:", nomeArquivo);

        await page.pdf({
          path: path.join(pastaFilipetas, nomeArquivo),
          format: 'A4'
        });

        // 🖨️ abrir janela de impressão
        console.log("🖨️ Abrindo janela de impressão...");
        await page.keyboard.press('Control+P');
      }

      sucessoExecucao = true;
      return 'sucesso';
    }

    if (resultado === 'timeout') {
      throw new Error("Usuário não clicou em enviar");
    }

  } catch (erro) {
    console.error("❌ Erro no RPA:", erro.message);
    throw erro;

  } finally {
    if (sucessoExecucao) {
      console.log("🧹 Fechando navegador");
      await browser.close();
    } else {
      console.log("🧪 Navegador mantido aberto para debug");
    }
  }
}

module.exports = executarRpa;