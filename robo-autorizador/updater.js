/**
 * =========================
 * AUTO-ATUALIZAÇÃO
 * =========================
 *
 * Até aqui, atualizar o robô era ir de pendrive em cada PC. O sintoma disso já
 * está medido: o payload do instalador em circulação está duas correções atrás
 * do repositório, e não havia como saber sem ir até a máquina.
 *
 * POR QUE ASSINATURA, E NÃO SÓ HASH NO BANCO
 * Um canal de atualização é um canal de execução de código em todos os PCs da
 * clínica. Se a integridade dependesse só de um hash guardado no banco, quem
 * conseguisse escrever no banco executaria o que quisesse em toda a recepção.
 * Este repositório já vazou chave de serviço mais de uma vez — então a
 * verificação é feita com Ed25519 contra uma chave pública EMBUTIDA NO PACOTE
 * INSTALADO, e a chave privada mora fora do repositório, na máquina do
 * mantenedor. Comprometer o banco não basta para publicar código.
 *
 * A chave pública é lida de `chave-publica.json`, gravado na hora de montar o
 * payload do instalador (ver publicar.js). Sem ela, a atualização automática
 * fica desligada — de propósito: preferimos frota desatualizada a frota
 * atualizável por qualquer um.
 *
 * ESCOPO DO QUE PODE SER TROCADO
 * Só arquivos .js do próprio robô. Node, Chromium e node_modules continuam
 * vindo apenas pelo instalador — dependência npm nova exige .exe novo.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const RAIZ = __dirname

// Arquivos que o updater NUNCA sobrescreve, mesmo que venham no pacote.
const PROIBIDOS = new Set([
  'package.json',        // lista de dependências: só muda com instalador novo
  'package-lock.json',
  '.env',                // configuração e token da máquina
  'chave-publica.json',  // trocar a chave pelo canal que ela protege = sem proteção
])

// =========================
// MANIFESTO CANÔNICO
// =========================
// A forma exata do que é assinado. publicar.js importa esta mesma função — se
// as duas pontas divergirem, nenhuma assinatura fecha, e é assim que se evita
// "funcionou na minha máquina".
function manifestoCanonico(versao, arquivos) {
  const enxuto = arquivos
    .map(a => ({ nome: a.nome, sha256: a.sha256 }))
    .sort((x, y) => (x.nome < y.nome ? -1 : x.nome > y.nome ? 1 : 0))

  return JSON.stringify({ versao, arquivos: enxuto })
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// =========================
// VERSÃO CORRENTE
// =========================
// `versao.json` é escrito pelo updater; `package.json` é o piso de fábrica.
// Separados de propósito: assim o updater nunca precisa tocar no package.json,
// que carrega a lista de dependências.
function versaoAtual() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(RAIZ, 'versao.json'), 'utf8')).versao
    if (v) return v
  } catch (e) { /* sem versao.json: primeira execução após instalar */ }

  return require('./package.json').version
}

function chavePublica() {
  try {
    const { chave_publica_b64 } = JSON.parse(
      fs.readFileSync(path.join(RAIZ, 'chave-publica.json'), 'utf8')
    )
    if (!chave_publica_b64) return null

    return crypto.createPublicKey({
      key: Buffer.from(chave_publica_b64, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch (e) {
    return null
  }
}

// =========================
// VALIDAÇÃO DO PACOTE
// =========================

function validarPacote(pacote, versaoEsperada) {
  const problemas = []

  if (!pacote) return ['pacote não encontrado no servidor']
  if (pacote.versao !== versaoEsperada) {
    problemas.push(`versão do pacote (${pacote.versao}) difere da anunciada (${versaoEsperada})`)
  }
  if (!Array.isArray(pacote.arquivos) || pacote.arquivos.length === 0) {
    problemas.push('pacote sem arquivos')
    return problemas
  }
  if (!pacote.assinatura) problemas.push('pacote sem assinatura')

  for (const arq of pacote.arquivos) {
    const nome = String(arq?.nome || '')

    // Nome tem que ser um basename simples. Sem isso, um pacote poderia gravar
    // em ..\..\Windows\System32 ou dentro de node_modules.
    if (!nome || nome !== path.basename(nome) || nome.includes('/') || nome.includes('\\')) {
      problemas.push(`nome de arquivo inválido: ${JSON.stringify(nome)}`)
      continue
    }
    if (!/\.js$/i.test(nome)) {
      problemas.push(`só arquivos .js podem ser atualizados: ${nome}`)
      continue
    }
    if (PROIBIDOS.has(nome)) {
      problemas.push(`arquivo protegido, não pode vir no pacote: ${nome}`)
      continue
    }
    if (typeof arq.conteudo_b64 !== 'string' || !arq.sha256) {
      problemas.push(`arquivo incompleto no pacote: ${nome}`)
      continue
    }

    const conteudo = Buffer.from(arq.conteudo_b64, 'base64')
    const calculado = sha256(conteudo)
    if (calculado !== String(arq.sha256).toLowerCase()) {
      problemas.push(`sha256 não bate para ${nome}`)
    }
  }

  return problemas
}

function verificarAssinatura(pacote) {
  const chave = chavePublica()
  if (!chave) {
    return { ok: false, motivo: 'chave-publica.json ausente ou ilegível — auto-update desligado' }
  }

  const mensagem = Buffer.from(manifestoCanonico(pacote.versao, pacote.arquivos), 'utf8')

  let ok = false
  try {
    ok = crypto.verify(null, mensagem, chave, Buffer.from(pacote.assinatura, 'base64'))
  } catch (e) {
    return { ok: false, motivo: 'assinatura malformada: ' + e.message }
  }

  return ok ? { ok: true } : { ok: false, motivo: 'assinatura não confere com a chave embutida' }
}

// =========================
// GRAVAÇÃO
// =========================

/**
 * Valida TUDO antes de escrever QUALQUER coisa. Um pacote com um arquivo ruim
 * no meio não pode deixar a instalação pela metade.
 */
function aplicar(pacote) {
  const escritos = []

  for (const arq of pacote.arquivos) {
    const destino = path.join(RAIZ, arq.nome)
    const conteudo = Buffer.from(arq.conteudo_b64, 'base64')
    const temporario = destino + '.novo'

    // Guarda a versão anterior: se a nova quebrar, existe para onde voltar
    // manualmente sem precisar do pendrive.
    if (fs.existsSync(destino)) {
      fs.copyFileSync(destino, destino + '.bak')
    }

    fs.writeFileSync(temporario, conteudo)
    fs.renameSync(temporario, destino)
    escritos.push(arq.nome)
  }

  fs.writeFileSync(
    path.join(RAIZ, 'versao.json'),
    JSON.stringify({ versao: pacote.versao, aplicado_em: new Date().toISOString() }, null, 2)
  )

  return escritos
}

// =========================
// ENTRADA
// =========================

/**
 * @returns {Promise<boolean>} true se atualizou (quem chama deve encerrar o
 *                             processo para o supervisor relançar).
 */
async function verificarEAplicar(api, versaoCorrente, versaoDisponivel) {
  if (!versaoDisponivel || versaoDisponivel === versaoCorrente) return false

  console.log(`⬇️  Versão disponível: ${versaoDisponivel} (atual: ${versaoCorrente})`)

  let pacote
  try {
    pacote = await api.obterPacote(versaoDisponivel)
  } catch (e) {
    console.error('⚠️  não foi possível baixar o pacote:', e.message)
    return false
  }

  const problemas = validarPacote(pacote, versaoDisponivel)
  if (problemas.length) {
    console.error('⛔ Pacote RECUSADO:')
    for (const p of problemas) console.error('   - ' + p)
    return false
  }

  const assinatura = verificarAssinatura(pacote)
  if (!assinatura.ok) {
    console.error('⛔ Pacote RECUSADO — ' + assinatura.motivo)
    console.error('   Continuando na versão ' + versaoCorrente + '. Nada foi gravado.')
    return false
  }

  console.log('🔐 Assinatura conferida')

  try {
    const escritos = aplicar(pacote)
    console.log(`✅ Atualizado para ${pacote.versao}: ${escritos.join(', ')}`)
    return true
  } catch (e) {
    console.error('⛔ Falha ao gravar a atualização:', e.message)
    console.error('   Arquivos .bak preservados ao lado dos originais.')
    return false
  }
}

module.exports = {
  verificarEAplicar,
  versaoAtual,
  manifestoCanonico,
  validarPacote,
  verificarAssinatura,
  sha256,
  PROIBIDOS,
}
