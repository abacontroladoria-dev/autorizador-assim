import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Busca de paciente para o formulário escolar público (/ficha-escolar), que o
// responsável abre por um link único enviado no WhatsApp — sem conta, sem token
// por paciente.
//
// O DESENHO DESTA ROTA É UMA DECISÃO DE PRIVACIDADE, não de UX. Um <select> com
// todos os pacientes seria mais simples de escrever e publicaria, para qualquer
// um com o link, a lista completa de crianças em tratamento na clínica — dado de
// saúde sob LGPD, num link que circula por aplicativo de mensagem. Daí as três
// travas abaixo, que só fazem sentido juntas:
//
//   1. Piso de 3 caracteres: sem termo não existe resposta. Não há "listar tudo".
//   2. Teto de 5 resultados: quem varre o alfabeto não monta a lista — uma busca
//      por "a" devolveria 5 nomes, não 500.
//   3. Resposta mínima: id e nome, mais NADA. Sem data de nascimento (é ela que
//      o formulário usa como confirmação — devolvê-la aqui entregaria a chave
//      junto com a fechadura), sem convênio, sem telefone, sem endereço.
//
// A confirmação por data de nascimento acontece no envio (../enviar), contra o
// banco. Aqui não se confirma nada: esta rota só ajuda a achar o nome.

// Abaixo disso a busca não roda. Duas letras ainda casam com meio cadastro.
const MINIMO_CARACTERES = 3

/**
 * Minúsculas e sem acento — o mesmo formato de `pacientes.nome_normalizado`,
 * que o banco mantém por trigger.
 *
 * A busca precisa disto porque `ilike` NÃO ignora acento: procurar "maite"
 * contra a coluna `nome` não encontra "Maitê", e "pecanha" não encontra
 * "Peçanha". No teclado do celular o responsável não digita acento, veria
 * "nenhum paciente encontrado" e concluiria que o filho não está cadastrado.
 *
 * `NFD` separa a letra do sinal diacrítico, e o range U+0300–U+036F (os
 * "combining marks") remove os sinais, deixando a letra base.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Teto deliberadamente baixo: é uma busca pelo próprio filho, não um diretório.
// Quem não achou em 5 resultados deve digitar mais, e é isso que a tela pede.
const LIMITE_RESULTADOS = 5

// 30 buscas por minuto por IP. Folgado para uma família digitando um nome
// (cada tecla a partir da 3ª dispara uma busca), apertado para quem raspa.
const RATE_LIMITE = 30
const RATE_JANELA_MS = 60_000

export async function GET(request: NextRequest) {
  try {
    return await buscar(request)
  } catch {
    return NextResponse.json(
      { error: 'Serviço indisponível' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

async function buscar(request: NextRequest) {
  const ip = getClientIp(request)

  if (checkRateLimit(`ficha-escolar:buscar:${ip}`, RATE_LIMITE, RATE_JANELA_MS)) {
    return NextResponse.json(
      { error: 'Muitas buscas. Aguarde um instante.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const termo = (request.nextUrl.searchParams.get('nome') ?? '').trim()

  // Lista vazia, não erro: enquanto o responsável digita as duas primeiras letras
  // a tela não deve piscar mensagem de falha.
  if (termo.length < MINIMO_CARACTERES) {
    return NextResponse.json(
      { pacientes: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // `%` e `_` são curingas do LIKE: sem escapar, um termo "%" casaria com todo o
  // cadastro e derrubaria a trava de 3 caracteres por dentro. A barra invertida
  // precisa ir primeiro, senão reescapa o que os outros dois acabaram de inserir.
  const termoEscapado = normalizar(termo)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

  // Busca em `nome_normalizado` (minúsculo, sem acento, mantida por trigger), e
  // não em `nome`: é o que faz "maite" encontrar "Maitê". O `like` basta porque
  // os dois lados já estão em minúsculas — `ilike` só custaria mais.
  const { data, error } = await supabaseService
    .from('pacientes')
    .select('id_paciente, nome')
    .eq('ativo', true)
    .eq('ficticio', false)
    .like('nome_normalizado', `%${termoEscapado}%`)
    .order('nome')
    .limit(LIMITE_RESULTADOS)

  if (error) {
    return NextResponse.json(
      { error: 'Falha na busca' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // Whitelist campo a campo. Um `...p` aqui publicaria CPF, endereço e convênio
  // numa rota sem login — o mesmo cuidado que /api/tv/chamadas documenta.
  const pacientes = (data ?? []).map((p) => ({
    id: p.id_paciente,
    nome: p.nome,
  }))

  return NextResponse.json(
    { pacientes },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
