/**
 * =========================
 * SEGREDO LOCAL (DPAPI)
 * =========================
 *
 * O robô precisa guardar UM segredo em disco: o token daquela máquina. É o
 * credencial de bootstrap — sem ele não há como se apresentar ao servidor.
 *
 * Aqui ele fica protegido pelo DPAPI do Windows, escopo LocalMachine. O que
 * isso resolve e o que NÃO resolve:
 *
 *   RESOLVE  copiar o .env para outro computador (pendrive, e-mail, backup):
 *            o blob não descriptografa fora da máquina que o cifrou.
 *   RESOLVE  ler o token abrindo o .env no Bloco de Notas.
 *   NÃO RESOLVE  código executando NAQUELE PC: quem consegue rodar processo lá
 *            consegue chamar Unprotect igual ao robô. DPAPI é contra cópia de
 *            arquivo, não contra execução local.
 *
 * Escopo LocalMachine e não CurrentUser porque o auto-start do robô é um atalho
 * em {commonstartup}: ele roda para qualquer usuário que faça logon naquele PC,
 * e um blob CurrentUser cifrado pelo administrador durante a instalação não
 * abriria na conta da recepcionista.
 *
 * Implementado via PowerShell + .NET de propósito: nada de módulo nativo, que
 * exigiria toolchain de compilação no pacote offline.
 */

const { execFileSync } = require('child_process')
const path = require('path')

// Entropia adicional do DPAPI. Não é segredo (está aqui, no fonte) — serve para
// que um blob deste app não seja intercambiável com blob de outro app na mesma
// máquina.
const ENTROPIA = 'RoboAutorizadorAssim/token/v1'

// Caminho absoluto do Windows PowerShell. O instalador já teve problema de PATH
// antes (o postinstall de uma dependência chamava `node` e não achava), então
// aqui não se depende de PATH.
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe'

const ehWindows = process.platform === 'win32'

/**
 * Roda um trecho de PowerShell passando os dados por VARIÁVEL DE AMBIENTE.
 *
 * Nunca por linha de comando: argv de processo é legível por outros processos
 * da máquina (Gerenciador de Tarefas com colunas, WMI, Process Explorer), o que
 * anularia o ponto de proteger o token.
 */
function rodarPs(script, variaveis) {
  return execFileSync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      env: { ...process.env, ...variaveis, ROBO_ENTROPIA: ENTROPIA },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ).trim()
}

const PREAMBULO = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security | Out-Null
$entropia = [Text.Encoding]::UTF8.GetBytes($env:ROBO_ENTROPIA)
`

/**
 * Texto claro -> blob base64, atado a esta máquina.
 * Usado pelo instalador no momento em que o token é digitado.
 */
function proteger(textoClaro) {
  if (!ehWindows) {
    throw new Error('proteger() só funciona no Windows (DPAPI).')
  }
  if (!textoClaro) {
    throw new Error('proteger() recebeu valor vazio.')
  }

  return rodarPs(
    `${PREAMBULO}
     $claro = [Text.Encoding]::UTF8.GetBytes($env:ROBO_CLARO)
     [Convert]::ToBase64String(
       [Security.Cryptography.ProtectedData]::Protect($claro, $entropia, 'LocalMachine')
     )`,
    { ROBO_CLARO: textoClaro }
  )
}

/**
 * Blob base64 -> texto claro. Falha em qualquer outra máquina.
 */
function desproteger(blobBase64) {
  if (!ehWindows) {
    throw new Error('desproteger() só funciona no Windows (DPAPI).')
  }
  if (!blobBase64) {
    throw new Error('desproteger() recebeu valor vazio.')
  }

  try {
    return rodarPs(
      `${PREAMBULO}
       $blob = [Convert]::FromBase64String($env:ROBO_ENC)
       [Text.Encoding]::UTF8.GetString(
         [Security.Cryptography.ProtectedData]::Unprotect($blob, $entropia, 'LocalMachine')
       )`,
      { ROBO_ENC: blobBase64 }
    )
  } catch (erro) {
    // A causa quase sempre é uma só: este .env veio de outra máquina.
    throw new Error(
      'Não foi possível decifrar MACHINE_TOKEN_ENC nesta máquina. ' +
      'Um .env copiado de outro computador não funciona por desenho — ' +
      'gere um token novo para esta máquina (supabase/snippets/robo_provisionar.sql, bloco 2) ' +
      'e reinstale. Detalhe: ' + (erro.stderr || erro.message || '').toString().trim().slice(0, 300)
    )
  }
}

/**
 * Resolve o token do processo, na ordem: blob DPAPI, depois texto puro.
 *
 * O fallback em texto existe só para desenvolvimento fora do Windows. Em
 * máquina de recepção ele nunca deveria ser o caminho usado — por isso avisa
 * alto quando for.
 */
function obterToken(env = process.env) {
  if (env.MACHINE_TOKEN_ENC) {
    return desproteger(env.MACHINE_TOKEN_ENC)
  }

  if (env.MACHINE_TOKEN) {
    console.warn(
      '⚠️  MACHINE_TOKEN em texto puro. Aceitável em desenvolvimento; ' +
      'em máquina de recepção use MACHINE_TOKEN_ENC (protegido por DPAPI).'
    )
    return env.MACHINE_TOKEN
  }

  throw new Error(
    'Nem MACHINE_TOKEN_ENC nem MACHINE_TOKEN definidos no .env. ' +
    'O robô não tem como se identificar ao servidor.'
  )
}

module.exports = { proteger, desproteger, obterToken, ENTROPIA }

// =========================
// CLI — usado pelo instalador
// =========================
// O token entra por STDIN, não por argumento, pelo mesmo motivo de não usar
// argv acima.
//
//   echo <token> | node segredo.js proteger    -> imprime o blob base64
//   echo <blob>  | node segredo.js desproteger -> imprime o token (diagnóstico)
if (require.main === module) {
  const acao = process.argv[2]

  if (acao !== 'proteger' && acao !== 'desproteger') {
    console.error('uso: node segredo.js proteger|desproteger   (valor por stdin)')
    process.exit(2)
  }

  let entrada = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (pedaco) => { entrada += pedaco })
  process.stdin.on('end', () => {
    try {
      const valor = entrada.trim()
      process.stdout.write((acao === 'proteger' ? proteger(valor) : desproteger(valor)) + '\n')
    } catch (erro) {
      console.error('ERRO: ' + erro.message)
      process.exit(1)
    }
  })
}
