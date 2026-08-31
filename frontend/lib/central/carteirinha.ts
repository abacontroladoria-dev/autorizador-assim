/**
 * A carteirinha ASSIM fatiada nos três campos que o portal pede.
 *
 * O formulário da ASSIM não aceita a carteirinha inteira: ele tem três inputs
 * separados — `associado1`, `associado2` e `associado3` —, e é isso que o robô
 * preenche (`robo-autorizador/rpa.js`, a partir de `tarefa.empresa`,
 * `tarefa.matricula` e `tarefa.dep`).
 *
 * O corte vem do banco, onde já existe repetido em três migrations
 * (20260813120000:140-142, 20260805124824:165-167 e get_auditoria_assim):
 *
 *   substring(numero_carteirinha, 1, 6)                          AS empresa
 *   substring(numero_carteirinha, 7, 7)                          AS matricula
 *   right(regexp_replace(numero_carteirinha, '\D', '', 'g'), 2)   AS dep
 *
 * Reproduzido aqui porque a página de avulsas lê a carteirinha do CADASTRO
 * (`pacientes.numero_carteirinha`), não da view que já traz os campos cortados.
 *
 * Duas sutilezas do original que não são detalhe:
 *
 *   - `empresa` e `matricula` cortam a string CRUA, e `dep` corta só os dígitos.
 *     Uma carteirinha com pontuação ("123456.1234567.01") daria empresa/matrícula
 *     erradas se fôssemos fiéis a isso, então normalizamos os dígitos ANTES dos
 *     três cortes. Para o formato limpo de 15 dígitos — o que o TiTa manda — o
 *     resultado é idêntico ao do SQL; para o pontuado, é o que o SQL gostaria de
 *     ter feito.
 *   - `substring(x, 7, 7)` do Postgres é 1-indexado com COMPRIMENTO 7, ou seja
 *     `slice(6, 13)` em JavaScript. Não `slice(6, 7)`.
 */
export type CarteirinhaFatiada = {
  empresa: string
  matricula: string
  dep: string
}

/** Quantos dígitos uma carteirinha ASSIM completa tem: 6 + 7 + 2. */
export const DIGITOS_CARTEIRINHA = 15

/**
 * Devolve `null` quando não há dígitos suficientes para os três campos.
 *
 * Não devolve um corte parcial de propósito: uma matrícula truncada não é uma
 * matrícula mais fraca — é a carteirinha de outra pessoa, ou de ninguém, e o
 * robô a digitaria no portal sem hesitar. O sintoma seria uma glosa
 * "1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS" que ninguém liga à digitação.
 */
export function fatiarCarteirinha(bruta: string | null | undefined): CarteirinhaFatiada | null {
  const digitos = String(bruta ?? '').replace(/\D/g, '')

  if (digitos.length < DIGITOS_CARTEIRINHA) return null

  return {
    empresa: digitos.slice(0, 6),
    matricula: digitos.slice(6, 13),
    dep: digitos.slice(-2),
  }
}

/** `123456.1234567.01` — a forma legível, para o operador conferir na tela. */
export function formatarCarteirinha(bruta: string | null | undefined): string | null {
  const partes = fatiarCarteirinha(bruta)
  if (!partes) return null

  return `${partes.empresa}.${partes.matricula}.${partes.dep}`
}
