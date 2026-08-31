/**
 * =========================
 * PUBLICADOR DE ATUALIZAÇÕES
 * =========================
 *
 * Ferramenta do mantenedor. NÃO faz parte do payload instalado nos PCs.
 *
 * Monta o pacote de arquivos .js, assina com Ed25519 e imprime o SQL de
 * inserção em robo_pacotes. O pacote nasce com publicado = false: liberar para
 * a frota é um passo separado e consciente
 * (supabase/snippets/robo_provisionar.sql, bloco 6).
 *
 * A CHAVE PRIVADA NÃO MORA NO REPOSITÓRIO.
 * Por padrão fica em %USERPROFILE%\.robo-autorizador\assinatura-privada.pem.
 * Sobrescreva com ROBO_CHAVE_PRIVADA=<caminho>. Se ela vazar, quem a tiver
 * publica código para todos os PCs da clínica — trate como a chave mais
 * sensível do projeto, mais do que qualquer chave de banco.
 *
 * USO
 *   node publicar.js gerar-chaves           gera o par (uma vez, na sua máquina)
 *   node publicar.js publicar [versao]      monta, assina e imprime o SQL
 *   node publicar.js verificar <arquivo>    confere um pacote já gerado
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const { manifestoCanonico, sha256, validarPacote, PROIBIDOS } = require('./updater')

const RAIZ = __dirname

const CAMINHO_PRIVADA = process.env.ROBO_CHAVE_PRIVADA
  || path.join(os.homedir(), '.robo-autorizador', 'assinatura-privada.pem')

const CAMINHO_PUBLICA_JSON = path.join(RAIZ, 'chave-publica.json')

// Arquivos que compõem o robô. Ferramentas de mantenedor ficam de fora — não
// há motivo para o PC da recepção receber o publicador.
const ARQUIVOS_DO_ROBO = [
  'index.js',
  'worker.js',
  'rpa.js',
  'assim.js',
  'api.js',
  'humano.js',
  'segredo.js',
  'updater.js',
]

// =========================
// CHAVES
// =========================

function gerarChaves() {
  if (fs.existsSync(CAMINHO_PRIVADA)) {
    console.error(`⛔ Já existe chave privada em:\n   ${CAMINHO_PRIVADA}`)
    console.error('   Gerar outra invalida todos os pacotes já assinados e exige')
    console.error('   reinstalar a chave pública em todos os PCs. Apague à mão se for isso mesmo.')
    process.exit(1)
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

  fs.mkdirSync(path.dirname(CAMINHO_PRIVADA), { recursive: true })
  fs.writeFileSync(
    CAMINHO_PRIVADA,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 }
  )

  const publicaB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

  fs.writeFileSync(CAMINHO_PUBLICA_JSON, JSON.stringify({
    chave_publica_b64: publicaB64,
    gerada_em: new Date().toISOString(),
    observacao: 'Chave pública de verificação do auto-update. A privada NÃO pertence ao repositório.',
  }, null, 2) + '\n')

  console.log('✅ Par de chaves Ed25519 gerado.')
  console.log('\n   PRIVADA (fora do repositório, faça backup offline):')
  console.log('   ' + CAMINHO_PRIVADA)
  console.log('\n   PÚBLICA (vai no payload do instalador):')
  console.log('   ' + CAMINHO_PUBLICA_JSON)
  console.log('\n   Base64 da pública, para registrar em robo_config.update_pubkey_b64:')
  console.log('   ' + publicaB64)
  console.log('\n⚠️  Perder a privada significa nunca mais publicar atualização sem')
  console.log('    reinstalar a pública em cada PC. Guarde fora desta máquina também.')
}

function lerPrivada() {
  if (!fs.existsSync(CAMINHO_PRIVADA)) {
    console.error(`⛔ Chave privada não encontrada em:\n   ${CAMINHO_PRIVADA}`)
    console.error('   Rode: node publicar.js gerar-chaves')
    process.exit(1)
  }
  return crypto.createPrivateKey(fs.readFileSync(CAMINHO_PRIVADA, 'utf8'))
}

// =========================
// PACOTE
// =========================

function montarPacote(versao) {
  const arquivos = []

  for (const nome of ARQUIVOS_DO_ROBO) {
    const caminho = path.join(RAIZ, nome)

    if (!fs.existsSync(caminho)) {
      console.error(`⛔ arquivo esperado não existe: ${nome}`)
      process.exit(1)
    }
    if (PROIBIDOS.has(nome)) {
      console.error(`⛔ ${nome} está na lista de protegidos do updater e não pode ser publicado`)
      process.exit(1)
    }

    const conteudo = fs.readFileSync(caminho)
    arquivos.push({
      nome,
      sha256: sha256(conteudo),
      conteudo_b64: conteudo.toString('base64'),
    })
  }

  const privada = lerPrivada()
  const mensagem = Buffer.from(manifestoCanonico(versao, arquivos), 'utf8')
  const assinatura = crypto.sign(null, mensagem, privada).toString('base64')

  return { versao, arquivos, assinatura }
}

function publicar(versaoArg) {
  const versao = versaoArg || require('./package.json').version

  if (!/^\d+\.\d+\.\d+$/.test(versao)) {
    console.error(`⛔ versão inválida: ${versao} (esperado x.y.z)`)
    process.exit(1)
  }

  const pacote = montarPacote(versao)

  // Passa pela MESMA validação que o robô aplica. Falhar aqui é muito melhor
  // que descobrir na frota.
  const problemas = validarPacote(pacote, versao)
  if (problemas.length) {
    console.error('⛔ o pacote gerado não passa na validação do updater:')
    for (const p of problemas) console.error('   - ' + p)
    process.exit(1)
  }

  const bytes = Buffer.byteLength(JSON.stringify(pacote))
  const destino = path.join(RAIZ, `pacote-${versao}.json`)
  fs.writeFileSync(destino, JSON.stringify(pacote, null, 2))

  console.log(`✅ Pacote ${versao} montado e assinado`)
  console.log(`   ${pacote.arquivos.length} arquivos, ${(bytes / 1024).toFixed(1)} KB`)
  console.log(`   ${destino}`)
  console.log('\n--- SQL para colar no SQL Editor -------------------------------')
  console.log(`insert into public.robo_pacotes (versao, arquivos, assinatura, publicado, notas)`)
  console.log(`values (`)
  console.log(`  ${sqlLiteral(versao)},`)
  console.log(`  ${sqlLiteral(JSON.stringify(pacote.arquivos))}::jsonb,`)
  console.log(`  ${sqlLiteral(pacote.assinatura)},`)
  console.log(`  false,`)
  console.log(`  ${sqlLiteral('descreva aqui o que muda')}`)
  console.log(`)`)
  console.log(`on conflict (versao) do update`)
  console.log(`   set arquivos = excluded.arquivos,`)
  console.log(`       assinatura = excluded.assinatura,`)
  console.log(`       publicado = false;`)
  console.log('----------------------------------------------------------------')
  console.log('\nO pacote entra com publicado = false. Para liberar para a frota:')
  console.log(`  update public.robo_pacotes set publicado = true where versao = '${versao}';`)
}

function sqlLiteral(texto) {
  return "'" + String(texto).replace(/'/g, "''") + "'"
}

function verificar(caminho) {
  const pacote = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  const { verificarAssinatura } = require('./updater')

  const problemas = validarPacote(pacote, pacote.versao)
  console.log('estrutura/hashes:', problemas.length ? 'FALHOU' : 'ok')
  for (const p of problemas) console.log('   - ' + p)

  const ass = verificarAssinatura(pacote)
  console.log('assinatura      :', ass.ok ? 'ok' : 'FALHOU — ' + ass.motivo)

  process.exit(problemas.length || !ass.ok ? 1 : 0)
}

// =========================
// CLI
// =========================

const [, , acao, argumento] = process.argv

switch (acao) {
  case 'gerar-chaves': gerarChaves(); break
  case 'publicar':     publicar(argumento); break
  case 'verificar':
    if (!argumento) { console.error('uso: node publicar.js verificar <arquivo.json>'); process.exit(2) }
    verificar(argumento)
    break
  default:
    console.error('uso: node publicar.js gerar-chaves | publicar [versao] | verificar <arquivo>')
    process.exit(2)
}
