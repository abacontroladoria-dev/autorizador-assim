// Unidade física da clínica — extraída de sala_nome, não de unidade_id.
//
// A clínica tem três endereços (Realengo, Fazendinha, Padre Miguel), mas eles
// não existem como dado estruturado na agenda: `unidade_id` é 280 e
// `unidade_nome` é 'CLÍNICA UNIVERSO ABA' em TODAS as vagas — medido em
// 01/09/2026 sobre as 500 vagas livres. Passar `p_unidade_id` para a RPC
// `listar_vagas_disponiveis` não filtra nada.
//
// O que distingue é o texto de `sala_nome`: 'Unid. Realengo - Sala 20'. Por
// isso o filtro por unidade é feito aqui, em TypeScript, sobre a lista já
// devolvida pela RPC — e não como parâmetro de banco.
//
// Isso importa para o agente porque sem filtro ele recebe as três unidades
// misturadas num campo que parece uniforme e tenta separá-las de cabeça. Foi o
// que produziu, num diálogo real, uma oferta de horários em Realengo logo
// depois de o responsável pedir Padre Miguel.

export const UNIDADES = ['Realengo', 'Fazendinha', 'Padre Miguel'] as const
export type Unidade = typeof UNIDADES[number]

// Salas que nunca devem ser oferecidas a um responsável.
// 'Sala Teste' é dado de teste que vive na grade de produção.
const SALAS_OCULTAS = ['sala teste']

// 'Unid. Padre Miguel - Sala 11' → 'Padre Miguel'
//
// Devolve null para salas que não pertencem a uma unidade física —
// 'AT Externo Escola' é atendimento na escola do paciente, não um endereço da
// clínica, e não pode ser oferecido como se fosse.
export function unidadeDaSala(salaNome: string | null | undefined): Unidade | null {
  if (!salaNome) return null
  const capturado = salaNome.match(/^Unid\.\s*(.+?)\s*-/)?.[1]?.trim()
  if (!capturado) return null

  const normalizado = chave(capturado)
  return UNIDADES.find(u => chave(u) === normalizado) ?? null
}

// O responsável escreve 'padre miguel', 'PADRE MIGUEL', às vezes 'pm'.
// Devolve null quando não reconhece — o chamador decide o que fazer com isso,
// em vez de cair silenciosamente numa unidade errada.
export function normalizarUnidade(texto: string | null | undefined): Unidade | null {
  if (!texto) return null
  const t = chave(texto)
  return UNIDADES.find(u => chave(u) === t) ?? null
}

export function salaOculta(salaNome: string | null | undefined): boolean {
  if (!salaNome) return false
  return SALAS_OCULTAS.includes(salaNome.trim().toLowerCase())
}

// Nenhum dos tres nomes de unidade tem acento, entao a comparacao so precisa
// ignorar caixa e espaco em volta. Uma remocao generica de diacriticos exigiria
// caracteres combinantes literais no fonte — invisiveis no diff, e uma armadilha
// para quem editar este arquivo depois.
function chave(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
