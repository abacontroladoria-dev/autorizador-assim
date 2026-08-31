// Verifica a autenticação do webhook. É a ÚNICA barreira entre a internet
// aberta e a fila que faz a atendente responder — merece teste próprio:
//
//   npx tsx --conditions react-server lib/central/webhook-signature.test.mts
//
// O caso que mais importa aqui é o item 4: um corpo re-serializado
// (JSON.parse → JSON.stringify) NÃO reproduz os bytes originais e falha a
// verificação. É a armadilha que faz "a Meta não consegue entregar" sem nenhum
// erro que aponte para a causa.

import { assinaturaMetaConfere, segredoConfere } from './webhook-signature.js'
import { createHmac } from 'node:crypto'

let falhas = 0
function checar(condicao: boolean, descricao: string, extra?: unknown) {
  if (condicao) {
    console.log(`  ok   ${descricao}`)
  } else {
    falhas++
    console.error(`  FALHA ${descricao}`)
    if (extra !== undefined) console.error('        ', extra)
  }
}

const SEGREDO = 'app-secret-de-teste'
const CORPO = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}'

function assinar(corpo: string, segredo = SEGREDO): string {
  return 'sha256=' + createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex')
}

// ----------------------------------------------------------------------------
console.log('\n1. assinatura correta')

checar(assinaturaMetaConfere(CORPO, assinar(CORPO), SEGREDO), 'aceita assinatura válida')

// ----------------------------------------------------------------------------
console.log('\n2. rejeições')

checar(!assinaturaMetaConfere(CORPO, assinar(CORPO, 'outro-segredo'), SEGREDO),
  'rejeita assinatura feita com outro segredo')
checar(!assinaturaMetaConfere(CORPO + ' ', assinar(CORPO), SEGREDO),
  'rejeita corpo alterado (um espaço a mais)')
checar(!assinaturaMetaConfere(CORPO, null, SEGREDO), 'rejeita header ausente')
checar(!assinaturaMetaConfere(CORPO, '', SEGREDO), 'rejeita header vazio')
checar(!assinaturaMetaConfere(CORPO, assinar(CORPO).slice(7), SEGREDO),
  'rejeita hex sem o prefixo sha256=')
checar(!assinaturaMetaConfere(CORPO, 'sha256=abc', SEGREDO),
  'rejeita assinatura de comprimento errado sem lançar (timingSafeEqual exige tamanhos iguais)')
checar(!assinaturaMetaConfere(CORPO, 'sha256=' + 'z'.repeat(64), SEGREDO),
  'rejeita hex do tamanho certo mas inválido')

// ----------------------------------------------------------------------------
console.log('\n3. falha FECHADA: sem segredo configurado, nada passa')

checar(!assinaturaMetaConfere(CORPO, assinar(CORPO), undefined),
  'segredo undefined → false (deploy sem env recusa tudo, não aceita tudo)')
checar(!assinaturaMetaConfere(CORPO, assinar(CORPO), ''),
  'segredo vazio → false')

// ----------------------------------------------------------------------------
console.log('\n4. a armadilha do corpo re-serializado')

// Corpo com espaçamento e ordem que JSON.stringify não reproduz.
const CORPO_REAL = '{"b":1,  "a":"acentuação"}'
const assinaturaReal = assinar(CORPO_REAL)
const reSerializado = JSON.stringify(JSON.parse(CORPO_REAL))

checar(assinaturaMetaConfere(CORPO_REAL, assinaturaReal, SEGREDO),
  'o corpo CRU confere')
checar(!assinaturaMetaConfere(reSerializado, assinaturaReal, SEGREDO),
  'o corpo re-serializado NÃO confere — é por isso que a rota lê req.text() antes de qualquer parse',
  { cru: CORPO_REAL, reSerializado })

// ----------------------------------------------------------------------------
console.log('\n5. unicode não quebra o cálculo')

const COM_EMOJI = '{"texto":"oi 👋 acentuação"}'
checar(assinaturaMetaConfere(COM_EMOJI, assinar(COM_EMOJI), SEGREDO),
  'corpo com emoji e acento confere (utf8 explícito nos dois lados)')

// ----------------------------------------------------------------------------
console.log('\n6. segredo do worker (pg_cron)')

checar(segredoConfere('abc123', 'abc123'), 'aceita segredo igual')
checar(!segredoConfere('abc123', 'abc124'), 'rejeita segredo diferente')
checar(!segredoConfere('abc', 'abc123'), 'rejeita comprimento diferente sem lançar')
checar(!segredoConfere(null, 'abc123'), 'rejeita header ausente')
checar(!segredoConfere('abc123', undefined),
  'sem env configurada → false (falha fechada, igual ao webhook)')
checar(!segredoConfere('', ''), 'vazio dos dois lados não é aceito')

// ----------------------------------------------------------------------------
console.log(
  falhas === 0
    ? '\nTodas as asserções passaram.\n'
    : `\n${falhas} asserção(ões) falharam.\n`,
)
process.exit(falhas === 0 ? 0 : 1)
