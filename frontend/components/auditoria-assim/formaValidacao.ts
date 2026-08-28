/**
 * Formas de validação da presença do beneficiário na ASSIM. A recepção escolhe
 * no modal do robô (`OPCOES_VALIDACAO` em robo-autorizador/rpa.js) e o texto
 * chega literal em `fila_autorizacoes.forma_autorizacao`.
 *
 * Duas delas deixam papel para conferir depois: o token (filipeta) e o erro de
 * reconhecimento facial. Daí a conferência valer para as duas.
 */

export const LABEL_ERRO_FACIAL = 'Erro no Reconhecimento Facial'

/** Texto de sucesso genérico da auditoria — o único que a forma substitui. */
export const OBS_CONFIRMADA = 'Autorização confirmada pela ASSIM'

/** Tolerante a acento e caixa: não depende de como a opção foi gravada. */
export function erroReconhecimentoFacial(forma: string | null | undefined) {
  return /reconhecimento\s+facial/i.test(forma ?? '')
}
