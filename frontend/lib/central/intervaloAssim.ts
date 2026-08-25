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

/** Minutos que a ASSIM exige entre duas identificações do mesmo beneficiário. */
export const INTERVALO_ASSIM_MIN = 30

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
export function podeSolicitar(ultima: string | null | undefined): boolean {
  const diffMin = minutosDesde(ultima)
  if (diffMin === null) return true

  return diffMin >= INTERVALO_ASSIM_MIN
}

/** Minutos que ainda faltam para a janela abrir. `0` quando já está liberado. */
export function minutosRestantes(ultima: string | null | undefined): number {
  const diffMin = minutosDesde(ultima)
  if (diffMin === null) return 0

  const faltam = INTERVALO_ASSIM_MIN - diffMin
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
