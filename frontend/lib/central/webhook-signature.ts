import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

// ============================================================================
// Verificação de assinatura de webhook (Meta / WhatsApp Cloud API)
//
// Este arquivo é a única autenticação que a rota de webhook tem. As outras 50
// rotas do repositório autenticam por sessão (`lib/central/auth.ts`), o que aqui
// não serve: quem bate na porta é a Meta, não um navegador com cookie.
//
// TRÊS ARMADILHAS, e as três já custaram incidente em algum lugar:
//
// 1. A ASSINATURA É SOBRE O CORPO CRU, BYTE A BYTE.
//    `await req.json()` seguido de `JSON.stringify` NÃO reproduz o original —
//    ordem de chaves, escape de unicode e espaçamento mudam, e o HMAC deixa de
//    bater. A rota precisa ler `await req.text()` ANTES de qualquer parse, e
//    passar essa string exata para cá. Não há como consertar isso depois: o
//    corpo original não é recuperável a partir do objeto.
//
// 2. COMPARAÇÃO EM TEMPO CONSTANTE.
//    `assinaturaCalculada === assinaturaRecebida` vaza, pelo tempo de resposta,
//    quantos bytes iniciais conferem. Com repetição isso permite construir uma
//    assinatura válida sem conhecer o segredo. `timingSafeEqual` existe para
//    isso — e exige que os dois buffers tenham o MESMO tamanho, senão lança.
//    Por isso o comprimento é checado antes, e o mesmo cuidado vale para o
//    segredo do worker.
//
// 3. FALHA FECHADA.
//    Segredo ausente devolve `false`, nunca `true`. Um deploy sem
//    WHATSAPP_APP_SECRET deve recusar todo webhook — e não aceitar todos.
// ============================================================================

const PREFIXO = 'sha256='

/**
 * Confere o header `X-Hub-Signature-256` contra o corpo cru.
 *
 * @param corpoCru  exatamente o que veio na requisição (`await req.text()`),
 *                  nunca um objeto re-serializado.
 * @param assinaturaRecebida  valor do header, no formato `sha256=<hex>`.
 * @param appSecret  o App Secret do app da Meta.
 */
export function assinaturaMetaConfere(
  corpoCru: string,
  assinaturaRecebida: string | null,
  appSecret: string | undefined,
): boolean {
  // Falha fechada: sem segredo configurado, nada é aceito.
  if (!appSecret) return false
  if (!assinaturaRecebida?.startsWith(PREFIXO)) return false

  const recebidaHex = assinaturaRecebida.slice(PREFIXO.length)

  const esperadaHex = createHmac('sha256', appSecret)
    .update(corpoCru, 'utf8')
    .digest('hex')

  return comparaEmTempoConstante(recebidaHex, esperadaHex)
}

/**
 * Compara dois segredos em tempo constante. Usado pelo header
 * `X-Worker-Secret` da rota de workers, que é chamada pelo pg_cron.
 */
export function segredoConfere(
  recebido: string | null,
  esperado: string | undefined,
): boolean {
  if (!esperado || !recebido) return false
  return comparaEmTempoConstante(recebido, esperado)
}

// `timingSafeEqual` LANÇA se os buffers tiverem tamanhos diferentes — o que já
// é, em si, um vazamento de informação que não temos como evitar (o tamanho da
// assinatura é público e fixo). Comparar o comprimento antes é o que impede a
// exceção; o segredo real nunca chega a ser comparado nesse caso.
function comparaEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
