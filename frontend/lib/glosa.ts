/**
 * Motivo da glosa por extenso — o texto que a ASSIM devolve ao recusar.
 *
 * O robô lê a recusa no recibo do aceite ("TUSS 1 22070384 - (1013) CADASTRO DO
 * BENEFICIARIO COM PROBLEMAS") e grava em `fila_autorizacoes.status_assim` já no
 * formato do relatório: código, hífen, texto. Duas telas consomem isso de
 * maneiras diferentes — a auditoria recebe o par já decomposto pela RPC
 * (`codigo_erro` / `descricao_erro`), a Central recebe o `status_assim` cru — e
 * este módulo é a única regra de decomposição, para as duas não divergirem no
 * dia em que a ASSIM mudar a forma do texto.
 */

export type MotivoGlosa = {
  /** Código do convênio, quando o texto o carrega. */
  codigo: string | null
  /** O motivo por extenso, sem o código. */
  descricao: string
}

/**
 * Decompõe "1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS".
 *
 * Sem o padrão numérico à frente, o texto inteiro vira descrição e o código
 * fica nulo — é o caso do fallback do robô, quando a ASSIM recusa sem código.
 * Tratar a primeira palavra como código ali inventaria um número que não existe.
 */
export function lerMotivoGlosa(texto: string | null | undefined): MotivoGlosa | null {
  const bruto = texto?.trim()
  if (!bruto) return null

  // `[\s\S]` em vez da flag `s`: o alvo de compilação do projeto é anterior a
  // es2018, onde dotAll não existe.
  const comCodigo = bruto.match(/^(\d{3,5})\s*-\s*([\s\S]+)$/)
  if (comCodigo) {
    const descricao = comCodigo[2].trim()
    if (descricao) return { codigo: comCodigo[1], descricao }
  }

  return { codigo: null, descricao: bruto }
}

/**
 * Completa o motivo com o de-para de códigos, quando ele tiver texto melhor.
 *
 * "Melhor" é literalmente mais longo: a ASSIM corta o texto do relatório em 25
 * caracteres, e o de-para guarda, por código, a versão mais completa já vista.
 * A comparação por comprimento é a mesma regra que o trigger do banco usa para
 * decidir se aprende — assim as duas pontas nunca discordam sobre qual texto
 * vale.
 */
export function completarMotivoGlosa(
  motivo: MotivoGlosa | null,
  codigos: Map<string, string> | null | undefined
): MotivoGlosa | null {
  if (!motivo?.codigo || !codigos) return motivo
  const doDePara = codigos.get(motivo.codigo)
  if (!doDePara || doDePara.length <= motivo.descricao.length) return motivo
  return { codigo: motivo.codigo, descricao: doDePara }
}

/**
 * Motivo de uma sessão da Central, que só conhece `status_assim` cru.
 *
 * O filtro por status é obrigatório: a mesma coluna guarda 'Liberado',
 * 'Liberado *' e os rótulos de falta, e nenhum deles é motivo de recusa.
 */
export function motivoGlosaDaSessao(item: {
  status_operacional?: string | null
  status?: string | null
  status_assim?: string | null
} | null | undefined): MotivoGlosa | null {
  const status = String(item?.status_operacional ?? item?.status ?? '').toLowerCase()
  if (status !== 'glosa') return null
  return lerMotivoGlosa(item?.status_assim)
}
