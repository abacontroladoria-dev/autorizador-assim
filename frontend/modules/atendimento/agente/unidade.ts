// Unidade física da clínica — o vocabulário canônico das três unidades.
//
// A clínica tem três endereços (Realengo, Fazendinha, Padre Miguel), e eles não
// existem como dado estruturado na agenda do TiTa: `unidade_id` é 280 e
// `unidade_nome` é 'CLÍNICA UNIVERSO ABA' em TODAS as vagas — medido em
// 01/09/2026 sobre as 500 vagas livres. O que distingue é o PREFIXO de
// `sala_nome`: 'Unid. Realengo - Sala 20'.
//
// ONDE A DERIVAÇÃO ACONTECE (mudou em 04/09/2026)
//
// A derivação agora é do BANCO: `central.vw_vagas_livres` expõe a coluna
// `unidade` já resolvida, e `central.listar_vagas_disponiveis` aceita
// `p_unidade` como filtro (migrations 20260904100000/20260904100100).
//
// Antes disso o filtro era feito aqui, em memória, sobre a lista já devolvida —
// e isso obrigava a pedir 500 vagas sempre que houvesse unidade, porque as N
// primeiras podiam ser todas de outra unidade. Como 500 é o teto da própria
// RPC, o filtro em memória tinha um limite que não se podia aumentar: bastava a
// grade crescer para que nenhuma vaga de Padre Miguel caísse nas 500 primeiras
// linhas e a resposta virasse "não temos vaga em Padre Miguel" — falso negativo
// silencioso.
//
// Não reintroduza filtro de unidade em memória. Passe `unidade` à RPC.
//
// POR QUE ESTE ARQUIVO CONTINUA EXISTINDO
//
// `UNIDADES` é o vocabulário canônico, compartilhado por três superfícies que
// precisam concordar: o enum do schema de function calling (ferramentas.ts), a
// validação de query da rota HTTP (appointment.dto.ts) e o `p_unidade`
// validado no banco. Divergência de grafia entre eles vira erro 22023 em
// produção — unidade.test.mts trava isso.
//
// `normalizarUnidade` é a fronteira: traduz o que o modelo (ou a query string)
// escreveu para um dos três literais exatos ANTES de chegar ao banco. Sem ela,
// um 'realengo' minúsculo viraria exceção de SQL em vez de recusa amigável.
//
// `UNIDADES` em si vive em types/central.types.ts, com o resto do vocabulário
// do domínio: a camada de tipos não pode importar da camada do agente, e
// VagaDisponivel precisa do tipo. Aqui ele é reexportado para que quem lida com
// unidade tenha um só lugar a importar.

export { UNIDADES, type Unidade } from '../types/central.types'

import { UNIDADES as TRES_UNIDADES, type Unidade } from '../types/central.types'

// 'Unid. Padre Miguel - Sala 11' → 'Padre Miguel'
//
// A derivação de referência é a de `central.vw_vagas_livres` (de-para por
// prefixo, mesmo conjunto de três). Esta função é para quem lê a grade SEM
// passar pela view — `public.vw_grade_base` cru, um CSV, uma inspeção pontual.
//
// Devolve null para o que não tem o prefixo: 'AT Externo Escola' é atendimento
// na escola do paciente, não um endereço da clínica, e não pode ser oferecido
// como se fosse. A view exclui essas linhas por este mesmo NULL, em vez de por
// lista negra — assim uma sala não-física nova sai da oferta sozinha.
export function unidadeDaSala(salaNome: string | null | undefined): Unidade | null {
  if (!salaNome) return null

  // De-para por prefixo, não captura por regex, pelo mesmo motivo da view: um
  // prefixo desconhecido precisa virar null (visível) em vez de casar por
  // acidente com uma das três unidades. E como não lemos o número da sala, o
  // padding inconsistente da origem ('Sala 1' e 'Sala 09' coexistem) e os
  // sufixos parentéticos de caixa variável ('(Coordenação de Caso)' e
  // '(Coordenação de caso)') deixam de importar.
  return TRES_UNIDADES.find(u => salaNome.startsWith(`Unid. ${u} - `)) ?? null
}

// O responsável escreve 'padre miguel', 'PADRE MIGUEL', às vezes com espaço
// duplo. Devolve null quando não reconhece — o chamador decide o que fazer com
// isso, em vez de cair silenciosamente numa unidade errada (ou, agora, em vez de
// mandar lixo ao banco e receber 22023).
//
// Abreviações ('pm', 'fazenda') NÃO são reconhecidas, de propósito: adivinhar
// qual unidade o responsável quis dizer é o erro que este módulo existe para
// evitar. Quem recebe null pergunta.
export function normalizarUnidade(texto: string | null | undefined): Unidade | null {
  if (!texto) return null
  const t = chave(texto)
  return TRES_UNIDADES.find(u => chave(u) === t) ?? null
}

// Nenhum dos tres nomes de unidade tem acento, entao a comparacao so precisa
// ignorar caixa e espaco em volta. Uma remocao generica de diacriticos exigiria
// caracteres combinantes literais no fonte — invisiveis no diff, e uma armadilha
// para quem editar este arquivo depois.
function chave(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
