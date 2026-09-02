/**
 * A regra dos 30 minutos da ASSIM.
 *
 * A ASSIM mede o intervalo no RELÓGIO, sobre a identificação do beneficiário
 * (`verificarIntervaloAtendimento()` do portal), e NÃO sobre o horário agendado
 * da sessão. Duas sessões que distam 40 min no cronograma colidem se forem
 * autorizadas com 4 minutos de diferença — foi o incidente de 21/08/2026, que
 * gerou guia duplicada.
 *
 * Extraído de `app/(dashboard)/solicitar/page.tsx` quando a página de
 * autorizações avulsas passou a precisar da mesma regra. A avulsa concorre pela
 * mesma janela: ela é uma identificação do mesmo beneficiário no mesmo portal,
 * então uma avulsa pedida logo depois de uma sessão normal é recusada pela ASSIM
 * exatamente como duas sessões seguidas seriam.
 *
 * Duas telas, uma regra. A terceira cópia divergente é o que este arquivo evita.
 */

/**
 * Minutos que a ASSIM exige entre duas identificações do mesmo beneficiário.
 *
 * É o número que os AVISOS citam, porque é a regra do portal. Não é
 * necessariamente o limiar que libera o botão — ver `LIBERACAO_SOLICITAR_MIN`.
 */
export const INTERVALO_ASSIM_MIN = 30

/**
 * Limiar de liberação da /solicitar: 31, um minuto acima do que a ASSIM exige.
 *
 * A folga existe porque os 30 min são medidos pelo relógio DA ASSIM, e o nosso
 * não é o mesmo: o `minutosDesde` compara com o relógio do navegador da recepção,
 * e entre o clique e a identificação de fato acontecer no portal passa um tempo
 * que não é zero. Liberar em 30,0 significa que uma solicitação que aqui parece
 * ter 30,1 min pode chegar lá como 29,9 — recusada, ou pior, duplicada (o
 * incidente de 21/08/2026).
 *
 * NÃO use este número em texto de aviso. Quem lê tem de aprender a regra da ASSIM
 * (30), não a nossa margem; dizer "a ASSIM exige 31 min" é falso.
 *
 * Vale só para a /solicitar. A /autorizacoes-avulsas usa o default de 30 porque
 * lá o intervalo apenas AVISA e o envio segue permitido — margem de segurança não
 * tem o que proteger num caminho que não bloqueia.
 */
export const LIBERACAO_SOLICITAR_MIN = 31

/**
 * Minutos decorridos desde a última autorização, ou `null` se não houve.
 *
 * O `new Date()` aqui é proposital, apesar de `horario_autorizacao` ser
 * `timestamp without time zone`: a coluna guarda hora de parede de São Paulo e o
 * navegador da recepção está no mesmo fuso, então o parse local casa. E o que se
 * quer é o INTERVALO, não o rótulo — é para exibir a hora que fatiar a string
 * importa (ver `horaDoTimestamp`).
 */
export function minutosDesde(ultima: string | null | undefined): number | null {
  if (!ultima) return null

  const ultimaData = new Date(ultima)
  if (Number.isNaN(ultimaData.getTime())) return null

  return (Date.now() - ultimaData.getTime()) / 1000 / 60
}

/**
 * `true` quando a janela de 30 min já passou — ou quando não há autorização
 * anterior para comparar.
 *
 * Sem registro anterior o resultado é liberado, e isso é deliberado: o que a
 * ausência de dado significa é "não sabemos de identificação nenhuma hoje", e
 * bloquear por falta de prova impediria a primeira solicitação do dia.
 */
export function podeSolicitar(
  ultima: string | null | undefined,
  limiteMin: number = INTERVALO_ASSIM_MIN
): boolean {
  const diffMin = minutosDesde(ultima)
  if (diffMin === null) return true

  return diffMin >= limiteMin
}

/**
 * Minutos que ainda faltam para a janela abrir. `0` quando já está liberado.
 *
 * O `limiteMin` tem de ser o MESMO passado ao `podeSolicitar` do mesmo fluxo:
 * contar contra 30 enquanto o botão libera em 31 mostraria "faltam 0 min" com a
 * ação ainda recusada.
 */
export function minutosRestantes(
  ultima: string | null | undefined,
  limiteMin: number = INTERVALO_ASSIM_MIN
): number {
  const diffMin = minutosDesde(ultima)
  if (diffMin === null) return 0

  const faltam = limiteMin - diffMin
  return faltam > 0 ? Math.ceil(faltam) : 0
}

/**
 * A hora de um `timestamp without time zone` como "HH:MM".
 *
 * Fatia a string em vez de `new Date()`, que reintroduziria o erro de fuso na
 * EXIBIÇÃO — o oposto do que `minutosDesde` precisa.
 */
export function horaDoTimestamp(ts: string | null | undefined): string {
  return String(ts || '').slice(11, 16)
}
