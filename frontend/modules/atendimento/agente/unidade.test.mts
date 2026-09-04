// Verifica o vocabulário das três unidades e as duas funções que o traduzem.
// Em memória, sem banco e sem LLM — roda sem stack local.
//
//   npx tsx modules/atendimento/agente/unidade.test.mts
//
// POR QUE ESTE ARQUIVO EXISTE
//
// A unidade física não existe como dado na grade do TiTa (unidade_id é 280 e
// unidade_nome é 'CLÍNICA UNIVERSO ABA' em toda linha). Ela é derivada do
// prefixo de sala_nome em DOIS lugares que precisam concordar:
//
//   - central.vw_vagas_livres, em SQL (migration 20260904100000);
//   - unidadeDaSala(), aqui em TypeScript, para quem lê a grade sem a view.
//
// E o literal de cada unidade aparece em TRÊS superfícies que também precisam
// concordar: o enum do schema de function calling, a validação de query da rota
// HTTP, e o p_unidade validado no banco — que LANÇA 22023 em valor
// desconhecido. Uma divergência de grafia entre eles não aparece em type-check
// nem em diff: aparece como erro 500 numa conversa de WhatsApp.
//
// O incidente que motivou tudo isso foi uma oferta de horários em Realengo logo
// depois de o responsável pedir Padre Miguel. Antes desta mudança, o filtro de
// unidade era o mecanismo mais delicado do módulo e não tinha nenhum teste.
//
// Sem framework, como os outros testes do módulo: sai com código 1 na primeira
// asserção falha.

import { UNIDADES, unidadeDaSala, normalizarUnidade } from './unidade.js'

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

// ----------------------------------------------------------------------------
console.log('\n1. o vocabulário é exatamente o que o banco valida')

// Estes três literais são copiados do `case` de central.vw_vagas_livres e do
// `not in` de central.listar_vagas_disponiveis (20260904100000/100100). Se
// alguém editar um dos lados, este teste é o que avisa — e ele avisa aqui, na
// máquina de quem editou, em vez de na conversa de um responsável.
const ESPERADO_NO_BANCO = ['Realengo', 'Fazendinha', 'Padre Miguel']

checar(UNIDADES.length === 3, 'são três unidades', UNIDADES.length)
checar(
  JSON.stringify([...UNIDADES]) === JSON.stringify(ESPERADO_NO_BANCO),
  'os literais batem com o case da view e o not in da RPC',
  { ts: [...UNIDADES], sql: ESPERADO_NO_BANCO },
)

// Sem acento em nenhum: é o que justifica `chave()` não remover diacríticos.
checar(
  UNIDADES.every(u => u === u.normalize('NFD').replace(/[̀-ͯ]/g, '')),
  'nenhum nome de unidade tem acento (premissa de chave())',
  [...UNIDADES],
)

// ----------------------------------------------------------------------------
console.log('\n2. unidadeDaSala — as salas físicas reais')

// Casos tirados dos seeds 20260716160000 e 20260716170000, incluindo as
// sujeiras que a origem tem de verdade.
const FISICAS: [string, string][] = [
  ['Unid. Realengo - Sala 20',                        'Realengo'],
  ['Unid. Realengo - Sala 4',                         'Realengo'],
  // Padding inconsistente na origem: 'Sala 1' e 'Sala 09' coexistem. Como não
  // lemos o número, nenhum dos dois é problema.
  ['Unid. Padre Miguel - Sala 1',                     'Padre Miguel'],
  ['Unid. Padre Miguel - Sala 09',                    'Padre Miguel'],
  // Sufixos parentéticos livres, com caixa inconsistente na origem
  // ('Coordenação de Caso' e 'Coordenação de caso' ambos existem).
  ['Unid. Realengo - Sala 18 (Coordenação de caso)',  'Realengo'],
  ['Unid. Fazendinha - Sala 11 (Coordenação de Caso)', 'Fazendinha'],
  ['Unid. Fazendinha - Sala 5 (Cozinha)',             'Fazendinha'],
  ['Unid. Fazendinha - Sala 10 (Equoterapia)',        'Fazendinha'],
  ['Unid. Fazendinha - Sala 2 (conhecimento)',        'Fazendinha'],
  ['Unid. Padre Miguel - Sala 26 (Coordenação de Unidade)', 'Padre Miguel'],
]

for (const [sala, esperado] of FISICAS) {
  checar(unidadeDaSala(sala) === esperado, `'${sala}' → ${esperado}`, unidadeDaSala(sala))
}

// ----------------------------------------------------------------------------
console.log('\n3. unidadeDaSala — papéis com prefixo de unidade ENTRAM')

// Têm o prefixo 'Unid. ', logo afirmam o endereço, logo a unidade é conhecida.
// Excluí-los exigiria uma allowlist de papéis, e a lista que envelhece faz a
// vaga desaparecer da oferta em silêncio — o modo de falha que a view existe
// para eliminar. A coluna e_sala_numerada os distingue sem os perder.
const PAPEIS: [string, string][] = [
  ['Unid. Fazendinha - Aplicador Suporte',   'Fazendinha'],
  ['Unid. Fazendinha - Facilitador Técnico', 'Fazendinha'],
  ['Unid. Padre Miguel - Visita Guiada',     'Padre Miguel'],
]

for (const [sala, esperado] of PAPEIS) {
  checar(unidadeDaSala(sala) === esperado, `'${sala}' → ${esperado} (papel, mas é endereço)`, unidadeDaSala(sala))
}

// ----------------------------------------------------------------------------
console.log('\n4. unidadeDaSala — o que NÃO é endereço da clínica dá null')

// Estas cinco são as que central.vw_vagas_livres exclui, e ela as exclui
// exatamente por este null: nenhuma tem o prefixo 'Unid. '. É o que faz uma
// sala não-física NOVA sair da oferta sozinha, sem lista para manter.
//
// 'AT Externo Escola' importa em particular: é atendimento na escola do
// paciente. Oferecê-lo como se fosse a clínica é errar o endereço na cara do
// responsável.
const NAO_FISICAS = [
  'Sala Teste',
  'AT Externo Escola',
  'AT Externo Casa',
  'Especialista Técnico de Área',
  'Consulta 4/6 - Nutrição',
]

for (const sala of NAO_FISICAS) {
  checar(unidadeDaSala(sala) === null, `'${sala}' → null (não é endereço da clínica)`, unidadeDaSala(sala))
}

// Vazio, nulo, e prefixo parecido mas diferente.
checar(unidadeDaSala(null) === null,      'null → null')
checar(unidadeDaSala(undefined) === null, 'undefined → null')
checar(unidadeDaSala('') === null,        "'' → null")

// Um prefixo desconhecido tem que dar null (visível, sai da view), NUNCA casar
// por acidente com uma das três. É a razão de o de-para ser por prefixo em vez
// de captura por regex.
checar(unidadeDaSala('Unid. Bangu - Sala 3') === null,
  "'Unid. Bangu - Sala 3' → null (unidade nova aparece, não casa por acaso)",
  unidadeDaSala('Unid. Bangu - Sala 3'))

// Sem o separador ' - ' não é o formato do TiTa.
checar(unidadeDaSala('Unid. Realengo Sala 20') === null,
  "'Unid. Realengo Sala 20' (sem hífen) → null",
  unidadeDaSala('Unid. Realengo Sala 20'))

// Caixa diferente no prefixo é sinal de mudança na origem, e tem que aparecer
// em vez de ser absorvida — mesma razão de a comparação da view ser sensível a
// caixa (um ilike esconderia a mudança).
checar(unidadeDaSala('unid. realengo - sala 20') === null,
  "'unid. realengo - sala 20' → null (mudança de grafia na origem não é absorvida)",
  unidadeDaSala('unid. realengo - sala 20'))

// ----------------------------------------------------------------------------
console.log('\n5. normalizarUnidade — o que o responsável e o modelo escrevem')

const ACEITOS: [string, string][] = [
  ['Realengo',       'Realengo'],
  ['realengo',       'Realengo'],
  ['REALENGO',       'Realengo'],
  ['  Fazendinha  ', 'Fazendinha'],
  ['Padre Miguel',   'Padre Miguel'],
  ['PADRE MIGUEL',   'Padre Miguel'],
  ['padre miguel',   'Padre Miguel'],
  // chave() colapsa espaço repetido.
  ['Padre  Miguel',  'Padre Miguel'],
  ['\tRealengo\n',   'Realengo'],
]

for (const [entrada, esperado] of ACEITOS) {
  checar(normalizarUnidade(entrada) === esperado,
    `normalizarUnidade(${JSON.stringify(entrada)}) → ${esperado}`,
    normalizarUnidade(entrada))
}

// ----------------------------------------------------------------------------
console.log('\n6. normalizarUnidade — o que ela recusa, e por que recusar importa')

// Recusar é o comportamento correto: quem recebe null PERGUNTA em qual unidade
// o responsável quer ser atendido. Adivinhar é o erro que este módulo existe
// para evitar — e, desde 20260904100100, mandar um valor não reconhecido ao
// banco LANÇA 22023, então a recusa aqui é o que transforma isso em pergunta
// em vez de erro de servidor.
const RECUSADOS = [
  'Realango',      // typo — o caso que reintroduziria o bug se fosse ignorado
  'pm',            // abreviação: adivinhar seria decidir pelo responsável
  'PM',
  'fazenda',
  'Padre',
  'Miguel',
  'Realengo 2',
  'Unid. Realengo - Sala 20',   // sala não é unidade
  'CLÍNICA UNIVERSO ABA',       // o unidade_nome da grade, que não distingue nada
  '',
  '   ',
]

for (const entrada of RECUSADOS) {
  checar(normalizarUnidade(entrada) === null,
    `normalizarUnidade(${JSON.stringify(entrada)}) → null`,
    normalizarUnidade(entrada))
}

checar(normalizarUnidade(null) === null,      'normalizarUnidade(null) → null')
checar(normalizarUnidade(undefined) === null, 'normalizarUnidade(undefined) → null')

// ----------------------------------------------------------------------------
console.log('\n7. as duas funções concordam entre si')

// Toda unidade derivada de uma sala física tem que ser reconhecida por
// normalizarUnidade, e vice-versa. Se as duas divergirem, o agente extrai uma
// unidade de uma sala e depois não consegue filtrar por ela.
for (const u of UNIDADES) {
  const salaSintetica = `Unid. ${u} - Sala 1`
  checar(unidadeDaSala(salaSintetica) === u,
    `unidadeDaSala('${salaSintetica}') === '${u}'`)
  checar(normalizarUnidade(u) === u,
    `normalizarUnidade('${u}') === '${u}'`)
  checar(normalizarUnidade(unidadeDaSala(salaSintetica)) === u,
    `ida e volta preserva '${u}'`)
}

// ----------------------------------------------------------------------------
console.log(falhas === 0 ? '\nTodos os checks passaram.\n' : `\n${falhas} check(s) falharam.\n`)
process.exit(falhas === 0 ? 0 : 1)
