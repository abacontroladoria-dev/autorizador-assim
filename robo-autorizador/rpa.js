/**
 * =========================
 * RPA - AUTORIZAÇÃO ASSIM
 * =========================
 *
 * Mudou em relação à versão anterior:
 *
 * - Não cria mais contexto de navegador nem cliente de banco. Recebe uma página
 *   já autenticada (assim.js) e a API do robô (api.js). Deixou de existir
 *   qualquer credencial de banco aqui.
 * - A configuração do formulário vem do servidor (robo_config), não do .env.
 *   Quando a ASSIM mexer numa opção, é um UPDATE — não um pendrive.
 * - O modal de forma de validação virou obrigatório, indispensável e com prazo.
 *   Ver pedirFormaValidacao().
 * - A REJEIÇÃO da ASSIM deixou de ser tratada como erro. O recibo de recusa traz
 *   guia, data/hora e o motivo ("1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS"):
 *   tudo isso é lido e gravado, e a tarefa termina em 'glosa'.
 *
 * O que NÃO mudou, de propósito: o robô preenche e PARA. Quem clica em "enviar"
 * é a recepcionista. A decisão de autorizar continua humana.
 */

const { delay, humanType } = require('./humano')

// =========================
// Elementos do portal da ASSIM
// =========================
//
// Levantados na própria página em 2026-08-13 (lendo o código das funções, não
// por tentativa e erro):
//
// - `callLoader()` cria um <img> do Load_Assim dentro de `#loadModal` e põe o
//   div em display:block; `closeLoader()` o esconde.
// - `#checkBday` (class="modal") é o modal de confirmação do beneficiário, que
//   pede DATA DE NASCIMENTO + CPF. Quem o abre é `abrirModal()`.
// - `trocaElement(mostrar, esconder)` alterna a célula `#InformeOsDados` com a
//   `#EnviarDados`. Enquanto a ASSIM não considera o beneficiário confirmado,
//   quem está visível é `#InformeOsDados` — e o envio é recusado no servidor.
//   Este é o sinal mais fiel de "pode enviar" que a página oferece.
const SEL_LOADER = '#loadModal'
const SEL_MODAL_BENEFICIARIO = '#checkBday'
const SEL_ALERTA_JQUERY = '.jconfirm-box'
const SEL_ENVIO_BLOQUEADO = '#InformeOsDados'

// A tela de identificação do beneficiário, em qualquer das formas que a ASSIM
// usa. Sempre por `:visible` do Playwright, que exige caixa de verdade — e
// NUNCA por `getComputedStyle().display`, porque `#loadModal` nasce com
// display:block e vazio: pelo display ele parece aberto o tempo todo.
//
// .jconfirm-box = os avisos com botão da ASSIM. É esta a tela que aparece na
//                 recepção: "Solicite identificacao do beneficiario por QRCode
//                 no dispositivo", com CONFIRMAR / CANCELAR IDENTIFICACAO.
// #myModal      = leitor de QR Code por câmera (botão #myBtn)
// #checkToken   = token enviado ao beneficiário
// #checkBday    = nascimento + CPF (usado quando não há dispositivo Intelbras)
const SEL_IDENTIFICACAO = [
  '.jconfirm-box:visible',
  '#myModal:visible',
  '#checkToken:visible',
  '#checkBday:visible',
].join(', ')

// Identificação + o loader: "a ASSIM está no meio de alguma coisa".
const SEL_ASSIM_OCUPADA = '#loadModal:visible, ' + SEL_IDENTIFICACAO

// Onde a ASSIM escreve o nome do beneficiário quando o encontra. É o marco
// positivo de "a consulta terminou" — melhor do que esperar a tela ficar quieta,
// que é indistinguível de "a tela ainda nem começou".
const SEL_NOME_BENEFICIARIO = '#indemp'

// Prova de que a identificação foi concluída: `aplicarCodigoBiofacialFormulario`
// grava o código devolvido pela API em `input[name=autBiofacial]`.
const SEL_CODIGO_IDENTIFICACAO = 'input[name="autBiofacial"]'

async function visivel(page, seletor) {
  return page.locator(seletor).first().isVisible().catch(() => false)
}

/**
 * Espera a tela parar de estar ocupada.
 *
 * Ganhou teto. Antes era `while (true)` sem prazo: um modal que não fechasse
 * deixava a tarefa — e portanto o worker inteiro — parada para sempre.
 */
async function aguardarTelaLivre(page, timeoutMs = 45000) {
  const limite = Date.now() + timeoutMs

  while (Date.now() < limite) {
    const ocupada = await page.locator(`
      ${SEL_LOADER}:visible,
      ${SEL_ALERTA_JQUERY}:visible,
      .modal:visible,
      [role="dialog"]:visible,
      img[src*="Load_Assim"]:visible,
      .loading:visible,
      .spinner:visible,
      [class*="loader"]:visible
    `).count().catch(() => 0)

    if (ocupada === 0) return true

    await delay(500)
  }

  return false
}

// =========================
// CONFIRMAÇÃO DO BENEFICIÁRIO
// =========================
//
// POR QUE ISTO EXISTE
// A ASSIM passou a exigir validação de presença do beneficiário antes de aceitar
// o envio — a mesma mudança que trouxe a tela de login. Esta etapa é do HUMANO,
// e é o ponto do processo em que o robô tem que sair da frente e esperar.
//
// A CADEIA, lida no código do portal:
//   blur de associado3 → conferirCampos()
//     → dadosformChoiceCard.php  (acha o beneficiário; escreve o nome em #indemp)
//     → verificarIntervaloAtendimento()
//         → "ja identificado hoje no intervalo de 30 minutos" → alerta com botões
//         → "Credenciado nao possui dispositivo Intelbras"    → abrirModal()
//         → senão → validarPresenca()
//             → "aceita cadastrar biometria facial?" → alerta Sim/Não, e recomeça
//             → "confirmado presencialmente"         → alerta verde "Tudo certo!"
//             → dispositivo indisponível / erro 500  → abrirModal()
//   abrirModal() = #checkBday, que pede NASCIMENTO + CPF.
//   A recepção ainda pode escolher QR Code (#myModal) ou token (#checkToken).
//
// Ou seja: são várias rodadas. O botão "Confirmar identificacao" chama
// `validarPresenca()` DE NOVO, e entre uma rodada e outra há requisições de até
// 30 segundos com a tela quieta.
//
// TRÊS ARMADILHAS QUE JÁ CUSTARAM CARO AQUI
// 1. `#loadModal` nasce com display:block e vazio. Quem olhar `display` acha que
//    há um loader aberto o tempo todo; quem olhar só uma vez logo após o Tab
//    acha que a tela está livre e passa reto. Por isso tudo aqui usa `:visible`
//    do Playwright, que exige caixa.
// 2. SILÊNCIO NÃO É CRITÉRIO. A versão anterior desta função concluía a espera
//    quando a tela ficava 2,5s quieta — e em máquina real ela saiu antes de
//    QUALQUER modal aparecer, porque o intervalo entre o loader fechar e o
//    aviso de identificação surgir é maior que isso. O log registrou
//    "validação concluída pela recepção" sem que ninguém tivesse visto nada.
//    Agora a identificação é OBRIGATÓRIA: o robô espera ela APARECER, e só
//    então espera ela ser resolvida.
// 3. A geração anterior do RPA esperava aqui SEM PRAZO NENHUM (commit 966e3ea,
//    "funcionando com parada do modal"). Isso trava o worker inteiro quando a
//    recepção some. Aqui o prazo é largo — 15 min — mas existe.
//
// O robô NÃO preenche nascimento e CPF, nem opera o QR, nem clica em confirmar.
// Esse é o controle de presença da operadora, feito com o beneficiário na frente
// da recepção. O robô dispara a consulta, sai da frente e volta depois.
async function aguardarConfirmacaoBeneficiario(page, cfg, api, filaId, alertas = []) {
  const tetoConsulta = Number(cfg.beneficiario_consulta_ms) || 60000
  const tetoAparecer = Number(cfg.identificacao_aparecer_ms) || 90000
  const tetoHumano = Number(cfg.confirmacao_beneficiario_ms) || 900000
  const SILENCIO_MS = 6000

  const marcaAlerta = alertas.length
  const prazoLegivel = tetoHumano >= 60000
    ? `${Math.round(tetoHumano / 60000)} min`
    : `${Math.round(tetoHumano / 1000)} s`

  const contar = (seletor) => page.locator(seletor).count().catch(() => -1)
  const identificado = () => page.locator(SEL_CODIGO_IDENTIFICACAO)
    .inputValue().then(v => String(v || '').trim().length > 0).catch(() => false)

  // ---- 1. A ASSIM encontrou o beneficiário? ----
  const achou = await page.waitForFunction(() => {
    const el = document.getElementById('indemp')
    return !!el && el.innerHTML.trim().length > 0
  }, { timeout: tetoConsulta }).then(() => true).catch(() => false)

  if (!achou) {
    // Os caminhos de erro da ASSIM aqui usam alert() — que o Playwright dispensa
    // sozinho. Sem repassar o texto, o motivo real (carteirinha errada, campos
    // anteriores em branco) sumiria.
    const recusa = alertas.slice(marcaAlerta)[0]
    throw new Error(
      recusa
        ? `A ASSIM não aceitou a carteirinha: "${recusa}"`
        : 'A ASSIM não retornou os dados do beneficiário no prazo. ' +
          'Confira a carteirinha da solicitação.'
    )
  }

  console.log('👤 Beneficiário localizado na ASSIM')

  // ---- 2. Esperar a identificação APARECER ----
  // Este passo é o coração da correção: enquanto ela não sobe na tela, o robô
  // não tem o direito de continuar preenchendo.
  console.log('⏸️  Aguardando a ASSIM abrir a identificação do beneficiário...')

  const limiteAparecer = Date.now() + tetoAparecer
  // 10s: tempo de sobra para a cadeia de requisições da ASSIM responder, sem
  // deixar a recepção esperando à toa quando o Tab não pegou.
  const INTERVALO_INSISTIR = Number(cfg.insistir_blur_ms) || 10000
  let apareceu = false
  let insistencias = 0
  let proximaInsistencia = Date.now() + INTERVALO_INSISTIR

  while (Date.now() < limiteAparecer) {
    const n = await contar(SEL_IDENTIFICACAO)
    if (n === -1) throw new Error('A janela da ASSIM foi fechada durante a identificação do beneficiário.')
    if (n > 0) { apareceu = true; break }

    // Se a ASSIM já carimbou o código de identificação sem pedir nada (o
    // beneficiário se identificou há pouco no dispositivo), não há o que esperar.
    if (await identificado()) {
      console.log('✅ A ASSIM já tinha a identificação deste beneficiário')
      return 'automatica'
    }

    // Aconteceu em máquina real: a consulta rodou (o nome do beneficiário
    // apareceu) mas a identificação não subiu. Quem resolveu foi a recepção,
    // clicando de volta no campo da matrícula e dando outro Tab. É esse gesto
    // que está aqui — e só quando a ASSIM não está no meio de uma requisição,
    // para não disparar a consulta duas vezes.
    if (Date.now() >= proximaInsistencia && insistencias < 2) {
      proximaInsistencia = Date.now() + INTERVALO_INSISTIR
      if (await contar('#loadModal:visible') === 0) {
        insistencias++
        console.log(`↻ A ASSIM não abriu a identificação — repetindo o Tab da carteirinha (${insistencias}/2)`)
        await page.evaluate(() => {
          const campo = document.forms.autorizador?.associado3
          if (!campo) return
          campo.focus()
          campo.blur()
        }).catch(() => {})
      }
    }

    await delay(500)
  }

  if (!apareceu) {
    throw new Error(
      'A ASSIM não abriu a identificação do beneficiário. Sem ela o envio é ' +
      'recusado ("Beneficiario nao confirmado"). Confira a tela do portal.'
    )
  }

  // ---- 3. Esperar a recepção resolver ----
  console.log('🧍 IDENTIFICAÇÃO DO BENEFICIÁRIO NA TELA DA ASSIM — o robô está PARADO.')
  console.log('   Conclua na tela: QR Code no dispositivo, biometria facial, token ou nascimento + CPF.')
  console.log(`   O preenchimento só continua depois disso. Prazo: ${prazoLegivel}.`)
  await api.registrarLog(filaId, 'Aguardando a recepcao identificar o beneficiario na tela da ASSIM')

  const inicio = Date.now()
  const limite = inicio + tetoHumano
  let silencioDesde = null
  let ultimoLog = Date.now()
  let concluiuIdentificacao = false

  while (Date.now() < limite) {
    const ocupada = await contar(SEL_ASSIM_OCUPADA)
    if (ocupada === -1) {
      throw new Error('A janela da ASSIM foi fechada durante a identificação do beneficiário.')
    }

    if (ocupada > 0) {
      silencioDesde = null
    } else {
      // Atalho: a ASSIM já gravou o código da identificação e não há mais nada
      // aberto. Acabou, sem esperar o silêncio inteiro.
      if (await identificado()) { concluiuIdentificacao = true; break }

      if (silencioDesde === null) silencioDesde = Date.now()
      if (Date.now() - silencioDesde >= SILENCIO_MS) { concluiuIdentificacao = true; break }
    }

    if (Date.now() - ultimoLog >= 15000) {
      ultimoLog = Date.now()
      console.log(`⌛ Ainda aguardando a recepção... (${Math.round((Date.now() - inicio) / 1000)}s)`)
    }

    await delay(700)
  }

  if (!concluiuIdentificacao) {
    throw new Error(
      `A identificação do beneficiário não foi concluída na tela da ASSIM em ${prazoLegivel}.`
    )
  }

  // ---- 4. Sobrou tela utilizável? ----
  // Fechar o modal no "x", ou errar o CPF/nascimento, faz o portal rodar
  // `limpa_carteira()`. Seguir em frente nesse estado produz exatamente a recusa
  // "Beneficiario nao confirmado" no envio.
  const cartao = await page.evaluate(() => {
    const f = document.forms.autorizador
    if (!f) return null
    return [f.associado1.value, f.associado2.value, f.associado3.value]
  }).catch(() => null)

  if (!cartao || cartao.some(v => !String(v || '').trim())) {
    throw new Error(
      'A identificação do beneficiário foi cancelada na tela da ASSIM — o portal ' +
      'limpou a carteirinha. Reabra a solicitação para tentar de novo.'
    )
  }

  console.log(
    (await identificado())
      ? '✅ Identificação concluída pela recepção'
      : '✅ Identificação encerrada pela recepção (sem código biofacial — ' +
        'a ASSIM pode recusar o envio)'
  )

  return 'manual'
}

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    // \p{Diacritic} em vez da faixa ̀-ͯ escrita à mão: o arquivo fica
    // 100% ASCII neste ponto, então não depende de como o editor salva bytes.
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
}

// =========================
// AGUARDAR ENVIO REAL
// =========================

// Os dois desfechos que a ASSIM imprime no recibo. A tela é a MESMA nos dois
// casos — muda só esta linha e, na rejeição, o motivo ao lado do TUSS.
//
// Os marcadores são ASCII puro de propósito: a página vem sem charset declarado
// e todo acento chega quebrado ("STATUS DA AUTORIZAï¿½ï¿½O"). Casar por texto
// acentuado aqui seria casar por sorte.
const MARCAS_DESFECHO = [
  { marca: 'BENEFICIO PROCESSADO', resultado: 'sucesso'   },
  { marca: 'BENEFICIO REJEITADO',  resultado: 'rejeitado' },
]

/**
 * Espera o desfecho do envio feito pela recepcionista.
 *
 * Passou a olhar os alertas da ASSIM. Antes só esperava o texto de sucesso: um
 * envio recusado pelo servidor ("Beneficiario nao confirmado. Tentar novamente")
 * era indistinguível de recepcionista que saiu para o almoço, e as duas coisas
 * viravam a mesma mensagem errada na fila.
 *
 * Passou também a reconhecer a REJEIÇÃO. Antes só existia "BENEFICIO
 * PROCESSADO": quando a ASSIM recusava, o robô não achava nada, queimava os
 * 120s inteiros e o timeout virava "a recepção não clicou em enviar" — mentira
 * que jogava fora a guia e o horário que estavam na tela.
 *
 * A espera continua até o fim do prazo depois de um ALERTA de recusa, de
 * propósito: aquilo acontece sem sair da tela e a recepcionista pode corrigir e
 * reenviar. Já a rejeição é outra página, com recibo — não há o que reenviar,
 * então retorna na hora.
 *
 * @param {string[]} alertas array alimentado pelo handler de dialog da aba
 * @returns {Promise<{resultado: 'sucesso'|'rejeitado'|'timeout', recusa: string|null}>}
 */
async function aguardarResultadoEnvio(page, timeoutMs, alertas = []) {
  console.log('⏳ Aguardando confirmação real...')

  const limite = Date.now() + timeoutMs
  let lidos = alertas.length
  let recusa = null

  while (Date.now() < limite) {
    for (const { marca, resultado } of MARCAS_DESFECHO) {
      if (await visivel(page, `text=${marca}`)) {
        console.log(resultado === 'sucesso'
          ? '✅ SUCESSO CONFIRMADO'
          : '🚫 A ASSIM REJEITOU o benefício — lendo o motivo do recibo')
        return { resultado, recusa: null }
      }
    }

    while (lidos < alertas.length) {
      recusa = alertas[lidos++]
      console.log('⚠️  A ASSIM recusou o envio:', recusa)
    }

    await delay(1000)
  }

  console.log('❌ Não apareceu confirmação')
  return { resultado: 'timeout', recusa }
}

// =========================
// MODAL DE FORMA DE VALIDAÇÃO
// =========================
//
// Três defeitos da versão anterior, todos corrigidos aqui:
//
// 1. SUMIA. O modal é um <div> pendurado no document.body da página da ASSIM.
//    Qualquer navegação ou recarga o levava junto.
// 2. TRAVAVA O ROBÔ INTEIRO quando sumia. A escolha vivia numa Promise dentro
//    do page.evaluate; se o elemento morresse, o resolve() nunca vinha, não
//    havia timeout, e o laço do worker ficava preso naquela tarefa para sempre —
//    a recepção parava até alguém matar o node.exe no Gerenciador de Tarefas.
// 3. NÃO PEDIA CONFIRMAÇÃO. Um clique único já gravava, sem chance de corrigir.
//
// Agora: a escolha vive no processo Node (via exposeFunction, que sobrevive a
// navegação), um watchdog reinjeta o modal se a página o derrubar, o fechamento
// por clique fora e por Escape está bloqueado, a gravação exige dois passos, e
// há prazo — esgotado, a tarefa termina num estado visível e o robô volta a
// atender.

const OPCOES_VALIDACAO = [
  'Biometria',
  'QR Code',
  'Token',
  'Erro no Reconhecimento Facial',
  'Beneficiário recusou validação facial/QR Code',
  'Beneficiário sem celular',
]

const ID_MODAL = 'robo-modal-forma-validacao'
const FN_CONFIRMAR = '__roboConfirmarFormaValidacao'

function desenharModal({ opcoes, idModal, fnConfirmar }) {
  if (document.getElementById(idModal)) return

  const overlay = document.createElement('div')
  overlay.id = idModal
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)',
    zIndex: '2147483647', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: 'Arial, sans-serif',
  })

  // Clique fora NÃO fecha. O overlay engole o evento e não faz nada — a
  // recepcionista é obrigada a escolher e confirmar.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      e.stopPropagation()
      e.preventDefault()
      caixa.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
         { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
        { duration: 180 }
      )
    }
  }, true)

  const caixa = document.createElement('div')
  Object.assign(caixa.style, {
    width: '560px', maxWidth: 'calc(100% - 32px)', background: '#fff',
    borderRadius: '12px', padding: '24px',
    boxShadow: '0 24px 64px rgba(0,0,0,.35)',
  })

  const titulo = document.createElement('h2')
  titulo.textContent = 'Como a autorização foi validada?'
  Object.assign(titulo.style, { margin: '0 0 6px', fontSize: '20px', color: '#111' })

  const subtitulo = document.createElement('p')
  subtitulo.textContent = 'Selecione uma opção e confirme. Esta informação é obrigatória.'
  Object.assign(subtitulo.style, { margin: '0 0 18px', fontSize: '14px', color: '#555' })

  const lista = document.createElement('div')
  Object.assign(lista.style, { display: 'flex', flexDirection: 'column', gap: '8px' })

  let selecionada = null
  const botoes = []

  const pintar = () => {
    for (const b of botoes) {
      const ativa = b.dataset.opcao === selecionada
      b.style.background = ativa ? '#eff6ff' : '#fff'
      b.style.borderColor = ativa ? '#2563eb' : '#d1d5db'
      b.style.boxShadow = ativa ? 'inset 0 0 0 1px #2563eb' : 'none'
      b.style.fontWeight = ativa ? '600' : '400'
    }
    confirmar.disabled = !selecionada
    confirmar.style.background = selecionada ? '#2563eb' : '#cbd5e1'
    confirmar.style.cursor = selecionada ? 'pointer' : 'not-allowed'
  }

  for (const opcao of opcoes) {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.dataset.opcao = opcao
    botao.textContent = opcao
    Object.assign(botao.style, {
      padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '8px',
      background: '#fff', cursor: 'pointer', fontSize: '15px', textAlign: 'left',
      color: '#111',
    })
    botao.addEventListener('click', (e) => {
      e.stopPropagation()
      selecionada = opcao
      pintar()
    })
    botoes.push(botao)
    lista.appendChild(botao)
  }

  const rodape = document.createElement('div')
  Object.assign(rodape.style, {
    display: 'flex', justifyContent: 'flex-end', marginTop: '20px',
  })

  const confirmar = document.createElement('button')
  confirmar.type = 'button'
  confirmar.textContent = 'Confirmar'
  confirmar.disabled = true
  Object.assign(confirmar.style, {
    padding: '12px 28px', border: 'none', borderRadius: '8px',
    color: '#fff', fontSize: '15px', fontWeight: '600',
  })
  confirmar.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!selecionada) return
    confirmar.disabled = true
    confirmar.textContent = 'Salvando...'
    // A resposta vai para o processo Node. Se a página morrer depois disto, a
    // escolha já está a salvo fora do navegador.
    window[fnConfirmar](selecionada)
    overlay.remove()
  })

  rodape.appendChild(confirmar)
  caixa.append(titulo, subtitulo, lista, rodape)
  overlay.appendChild(caixa)
  document.body.appendChild(overlay)

  pintar()

  // Escape não fecha.
  const barrarEscape = (e) => {
    if (e.key === 'Escape' && document.getElementById(idModal)) {
      e.stopPropagation()
      e.preventDefault()
    }
  }
  document.addEventListener('keydown', barrarEscape, true)
}

async function pedirFormaValidacao(page, timeoutMs) {
  let resolver
  const escolhido = new Promise(res => { resolver = res })

  // exposeFunction sobrevive a navegações da página — é o que tira a escolha de
  // dentro do DOM da ASSIM e a coloca no processo Node.
  try {
    await page.exposeFunction(FN_CONFIRMAR, (opcao) => resolver(opcao))
  } catch (e) {
    if (!/already registered/i.test(e.message)) throw e
  }

  const injetar = () => page.evaluate(desenharModal, {
    opcoes: OPCOES_VALIDACAO,
    idModal: ID_MODAL,
    fnConfirmar: FN_CONFIRMAR,
  }).catch(() => {})

  await injetar()

  let respondido = false
  const watchdog = setInterval(async () => {
    if (respondido) return
    try {
      const existe = await page.evaluate(
        (id) => !!document.getElementById(id), ID_MODAL
      )
      if (!existe) {
        console.log('🔁 Modal de validação desapareceu (a página navegou) — reinjetando')
        await injetar()
      }
    } catch (e) {
      // Página fechada pela recepcionista: nada a fazer aqui, o timeout resolve.
    }
  }, 1500)

  const prazo = new Promise(res => setTimeout(() => res(null), timeoutMs))

  try {
    const resposta = await Promise.race([escolhido, prazo])
    respondido = true

    if (resposta) {
      console.log('✅ Forma de validação:', resposta)
    } else {
      const prazoLegivel = timeoutMs >= 60000
        ? `${Math.round(timeoutMs / 60000)} min`
        : `${Math.round(timeoutMs / 1000)} s`
      console.warn(
        `⚠️  Ninguém respondeu o modal em ${prazoLegivel}. ` +
        'Encerrando a tarefa sem a forma de validação para não travar a fila.'
      )
    }

    return resposta

  } finally {
    clearInterval(watchdog)
    await page.evaluate((id) => document.getElementById(id)?.remove(), ID_MODAL).catch(() => {})
  }
}

// =========================
// CAPTURA DA TELA DE CONFIRMAÇÃO
// =========================

/**
 * Lê o recibo que a ASSIM devolve depois do envio.
 *
 * A tela é a mesma no aceite e na recusa — guia, data/hora, associado e
 * matrícula estão lá nos dois casos. O que muda é a linha do desfecho
 * ("BENEFICIO PROCESSADO" / "BENEFICIO REJEITADO") e, na recusa, o motivo
 * colado no TUSS: "TUSS 1 22070384 - (1013) CADASTRO DO BENEFICIARIO COM
 * PROBLEMAS".
 *
 * Guia sem zeros à esquerda, para casar com autorizacoes_assim.guia.
 * Data montada direto dos dígitos, sem passar por `new Date()`, para não sofrer
 * conversão de fuso do processo Node — grava exatamente o horário da ASSIM.
 *
 * Roda dentro de page.evaluate: nada aqui pode referenciar constante de fora.
 */
function lerConfirmacao() {
  const txt = (document.body && document.body.innerText) || ''

  const guiaMatch =
    txt.match(/Documento:\s*[A-Za-z0-9]+\s*\/\s*0*(\d+)/i) ||
    txt.match(/Documento:[^\n]*?\/\s*0*(\d{3,})/i)

  const dataMatch = txt.match(/Data:\s*(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2}):(\d{2}):(\d{2})/)

  let dataConfirmacao = null
  if (dataMatch) {
    const [, dd, mm, yy, hh, mi, ss] = dataMatch
    dataConfirmacao = `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}`
  }

  // Marcadores ASCII: a página vem sem charset e os acentos chegam quebrados.
  const situacao =
    /BENEFICIO\s+REJEITADO/i.test(txt)  ? 'rejeitado'  :
    /BENEFICIO\s+PROCESSADO/i.test(txt) ? 'processado' : null

  // Só na recusa. No aceite a linha do TUSS não carrega motivo nenhum, e um
  // valor aqui só serviria para poluir status_assim.
  let motivoGlosa = null
  if (situacao === 'rejeitado') {
    const linhas = txt.split('\n').map(l => l.trim())

    // Formato observado: "(1013) CADASTRO DO BENEFICIARIO COM PROBLEMAS".
    // Vira "1013-CADASTRO ...", que é o formato que o robô do relatório já usa
    // em status_assim ("1601-REINCIDENCIA NO ATEN") — uma coluna, um
    // vocabulário, venha de onde vier.
    const comCodigo = linhas.find(l => /TUSS/i.test(l) && /\(\s*\d{3,5}\s*\)/.test(l))
    const m = comCodigo && comCodigo.match(/\(\s*(\d{3,5})\s*\)\s*(.+)$/)
    if (m) motivoGlosa = (m[1] + '-' + m[2].trim()).slice(0, 120)

    // Recusa cujo motivo venha sem o código entre parênteses: fica o texto.
    if (!motivoGlosa) {
      const alt = linhas.find(l => /^TUSS\b/i.test(l) && /\s-\s/.test(l))
      const m2 = alt && alt.match(/^TUSS\b.*?\s-\s(.+)$/i)
      if (m2) motivoGlosa = m2[1].trim().slice(0, 120)
    }
  }

  // Perícia para quando a guia não é capturada. A versão anterior gravava 500
  // caracteres crus do innerText em error_message — o que arrasta nome e
  // identificadores do beneficiário para uma coluna lida por muita gente.
  // Aqui só entram as linhas que servem ao diagnóstico.
  const linhasUteis = txt
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && /documento|data:|guia|autoriza|benefici|\d{4,}/i.test(l))
    .slice(0, 6)
    .join(' | ')
    .slice(0, 300)

  return {
    numeroGuia: guiaMatch ? guiaMatch[1] : null,
    dataConfirmacao,
    linhasUteis,
    situacao,
    motivoGlosa,
  }
}

// =========================
// FUNÇÃO PRINCIPAL
// =========================

/**
 * @param {object}   opcoes
 * @param {object}   opcoes.page      página já autenticada na ASSIM
 * @param {object}   opcoes.tarefa    linha da fila devolvida por robo_buscar_tarefa
 * @param {object}   opcoes.cfg       robo_obter_config_assim
 * @param {object}   opcoes.api       instância de Api
 * @param {Function} opcoes.cancelado () => Promise<boolean>
 * @param {string[]} opcoes.alertas   alertas que a ASSIM emitiu nesta aba
 * @returns {Promise<'sucesso'|'sem_guia'|'glosa'>}
 */
async function executarRpa({ page, tarefa, cfg, api, cancelado, alertas = [] }) {
  if (!cancelado) cancelado = async () => false

  let concluiu = false

  try {
    console.log('🚀 Iniciando RPA...')
    console.log('Paciente:', tarefa.paciente_nome)

    // A página já chegou no formulário e o assim.js já esperou os scripts do
    // portal existirem. Esta pausa é o cinto: a ASSIM ainda faz coisas depois
    // que as funções aparecem, e digitar em cima disso foi o que deixou o
    // primeiro Tab sem efeito em máquina real. Ajustável pelo servidor.
    const esperaInicial = Number(cfg.espera_pagina_ms) || 2000
    if (esperaInicial > 0) {
      console.log(`⏱️  Deixando o portal assentar (${esperaInicial}ms)`)
      await delay(esperaInicial)
    }

    await page.selectOption('select[name="operacao"]', { label: cfg.tipo_operacao })
    await page.selectOption('select[name="natureza"]',  { label: cfg.natureza })
    await page.selectOption('select[name="servico"]',   { label: cfg.tipo_servico })

    if (await cancelado()) throw new Error('Execução cancelada')

    if (!tarefa.empresa || !tarefa.matricula || !tarefa.dep) {
      throw new Error('Dados do associado incompletos')
    }

    await humanType(page, 'input[name="associado1"]', tarefa.empresa)
    await humanType(page, 'input[name="associado2"]', tarefa.matricula)
    await humanType(page, 'input[name="associado3"]', tarefa.dep)

    // O blur do último campo da carteirinha dispara a busca do beneficiário e,
    // desde a mudança do portal, a confirmação de presença. Nada pode ser
    // digitado por cima disso.
    await page.press('input[name="associado3"]', 'Tab')
    await aguardarConfirmacaoBeneficiario(page, cfg, api, tarefa.id, alertas)
    await aguardarTelaLivre(page)

    await humanType(page, 'input[name="findexec"]', String(cfg.executor))
    await aguardarTelaLivre(page)

    await page.selectOption('select[name="exec"]', { label: cfg.executor_label })

    await humanType(page, 'input[name="procura"]', String(cfg.solicitante))
    await aguardarTelaLivre(page)

    await page.click('input[name="butproc"]')

    if (!tarefa.crm) throw new Error('CRM não informado')
    await page.fill('input[name="crmsolic"]', tarefa.crm)

    if (!tarefa.nome_medico) throw new Error('Nome do médico não informado')
    await page.fill('input[name="findsolic"]', normalizarTexto(tarefa.nome_medico))

    // UF do CRM solicitante. O portal fica em RJ por padrão; se o médico é de
    // outro estado (ex.: SP) a guia é rejeitada. Localiza o <select> de UF pelas
    // próprias opções (contém RJ e SP), sem depender do name exato do campo.
    const ufMedico = (tarefa.crm_uf || 'RJ').toUpperCase()
    const ufSelecionada = await page.evaluate((uf) => {
      const setUf = (sel) => {
        const opt = Array.from(sel.options).find(o =>
          (o.value || '').trim().toUpperCase() === uf ||
          (o.textContent || '').trim().toUpperCase() === uf)
        if (!opt) return null
        sel.value = opt.value
        sel.dispatchEvent(new Event('input',  { bubbles: true }))
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        return sel.name || '(sem name)'
      }
      const ufcrm = document.querySelector('select[name="ufcrm"]')
      if (ufcrm) { const r = setUf(ufcrm); if (r) return r }
      for (const sel of Array.from(document.querySelectorAll('select'))) {
        const up = Array.from(sel.options).map(o => (o.value || o.textContent || '').trim().toUpperCase())
        if (up.includes('RJ') && up.includes('SP')) { const r = setUf(sel); if (r) return r }
      }
      return null
    }, ufMedico)

    if (ufSelecionada) console.log(`✅ UF do CRM = ${ufMedico} (campo: ${ufSelecionada})`)
    else console.warn(`⚠️ Campo de UF não localizado; mantido o default (UF alvo: ${ufMedico})`)

    if (!tarefa.tuss) throw new Error('TUSS não informado')
    await humanType(page, 'input[name="ttuss1"]', tarefa.tuss)

    await page.selectOption('select[name="tipoDeConsulta"]', { label: cfg.tipo_consulta })
    await page.selectOption('select[name="tipoDeSaida"]',    { label: cfg.tipo_saida })

    // Último aviso antes de devolver a tela para a recepção: se a ASSIM ainda
    // mostra "Informe os Dados", ela não considera o beneficiário confirmado e
    // vai recusar o envio. Melhor deixar isso no log agora do que descobrir
    // depois pelo timeout.
    if (await visivel(page, SEL_ENVIO_BLOQUEADO)) {
      console.warn('⚠️  A ASSIM ainda não liberou o envio (beneficiário não confirmado)')
      await api.registrarLog(tarefa.id, 'ASSIM nao liberou o envio: beneficiario nao confirmado')
    }

    // ===== Aqui o robô para. Quem envia é a recepcionista. =====
    console.log('📤 Aguardando envio manual...')

    const { resultado, recusa } = await aguardarResultadoEnvio(
      page,
      Number(cfg.envio_timeout_ms) || 120000,
      alertas
    )

    if (resultado === 'timeout') {
      throw new Error(
        recusa
          ? `A ASSIM recusou o envio: "${recusa}"`
          : 'A recepção não clicou em enviar dentro do prazo'
      )
    }

    console.log('📄 Aguardando tela final...')
    await page.waitForLoadState('networkidle').catch(() => {})
    await delay(2000)

    const {
      numeroGuia, dataConfirmacao, linhasUteis, situacao, motivoGlosa,
    } = await page.evaluate(lerConfirmacao)

    // A rejeição é um DESFECHO, não uma falha: a solicitação foi processada e o
    // convênio recusou. Tratá-la como erro (o que acontecia até aqui) jogava
    // fora a guia e o horário que estão na tela, não abria o modal de forma de
    // validação e deixava o paciente marcado como 'erro' na /solicitar.
    const rejeitado = resultado === 'rejeitado' || situacao === 'rejeitado'

    if (numeroGuia) console.log('🧾 Guia capturada:', numeroGuia)
    else if (!rejeitado) console.warn("⚠️ Guia não capturada da tela — registrando como 'concluido_sem_guia'")
    else console.warn('⚠️ Guia não capturada do recibo de rejeição')

    if (dataConfirmacao) console.log('🕒 Data/hora da confirmação:', dataConfirmacao)
    else console.warn('⚠️ Data/hora da confirmação não capturada')

    if (rejeitado) {
      console.log('🚫 Motivo da glosa:', motivoGlosa || '(não identificado no recibo)')
      await api.registrarLog(
        tarefa.id,
        'ASSIM rejeitou: ' + (motivoGlosa || 'motivo nao identificado no recibo')
      )
    }

    const forma = await pedirFormaValidacao(page, Number(cfg.modal_timeout_ms) || 600000)

    // Sem guia capturada a autorização até aconteceu na ASSIM, mas o vínculo não
    // existe. 'concluido' pintaria o card de verde e esconderia a lacuna;
    // 'concluido_sem_guia' a deixa visível e reprocessável no mesmo dia.
    const status = rejeitado
      ? 'glosa'
      : (numeroGuia ? 'concluido' : 'concluido_sem_guia')

    const problemas = []
    if (!numeroGuia) {
      problemas.push(
        (rejeitado ? 'Guia da rejeição não capturada.' : 'Guia não capturada.') +
        ` Trecho lido: ${linhasUteis || '(vazio)'}`
      )
    }
    if (!forma) problemas.push('Forma de validação não informada (modal expirou sem resposta).')

    await api.concluirTarefa(tarefa.id, status, {
      numeroAutorizacao: numeroGuia,
      formaAutorizacao: forma,
      horarioAutorizacao: dataConfirmacao,
      // O motivo vai para status_assim, a mesma coluna que o robô do relatório
      // preenche mais tarde — e no mesmo formato. Aqui ele chega horas antes.
      statusAssim: rejeitado ? motivoGlosa : null,
      erro: problemas.length ? problemas.join(' ') : null,
    })

    concluiu = true

    // Nada é lançado aqui: erro faria o worker fechar a aba (sessao.descartar),
    // e é dessa tela que a recepção tira o print para abrir a contestação.
    console.log(rejeitado ? '🚫 RPA finalizado — glosa registrada' : '✅ RPA finalizado')
    return rejeitado ? 'glosa' : (numeroGuia ? 'sucesso' : 'sem_guia')

  } catch (erro) {
    console.error('❌ Erro no RPA:', erro.message)

    if (!concluiu) {
      await api.concluirTarefa(tarefa.id, 'erro', { erro: erro.message.slice(0, 500) })
        .catch(e => console.error('⚠️  não foi possível marcar erro:', e.message))
    }

    throw erro
  }
}

module.exports = executarRpa
module.exports.OPCOES_VALIDACAO = OPCOES_VALIDACAO
module.exports.pedirFormaValidacao = pedirFormaValidacao
module.exports.lerConfirmacao = lerConfirmacao
module.exports.aguardarTelaLivre = aguardarTelaLivre
module.exports.aguardarConfirmacaoBeneficiario = aguardarConfirmacaoBeneficiario
module.exports.aguardarResultadoEnvio = aguardarResultadoEnvio
