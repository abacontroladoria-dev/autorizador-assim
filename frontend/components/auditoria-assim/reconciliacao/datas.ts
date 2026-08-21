const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "2026-08-17" → "17/08". Fatia de string: nada de `new Date`, nada de fuso. */
export function formatarDia(iso: string | null): string {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** "Seg 17/08" — o rótulo de grupo das duas colunas. */
export function formatarDiaComNome(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, (mes ?? 1) - 1, dia ?? 1)
  return `${DIA_CURTO[d.getDay()]} ${formatarDia(iso)}`
}

/**
 * A hora de um `timestamp without time zone` que guarda hora de São Paulo.
 *
 * Cortada da string de propósito. `new Date(...)` sobre o valor sem sufixo de
 * fuso é justamente o caminho que fez "Autorizado em" e "Executado em"
 * discordarem em 3h antes da migration 20260820130000.
 */
export function horaDoTimestamp(valor: string | null): string {
  if (!valor || valor.length < 16) return '—'
  return valor.slice(11, 16)
}

export function diaDoTimestamp(valor: string | null): string | null {
  if (!valor || valor.length < 10) return null
  return valor.slice(0, 10)
}

/** "2026-08-17T08:12:00" → "17/08 08:12". Também por fatia, pelo mesmo motivo. */
export function dataHoraCurta(valor: string | null): string {
  if (!valor) return '—'
  return `${formatarDia(valor.slice(0, 10))} ${horaDoTimestamp(valor)}`
}

/**
 * "Hoje 09:42" ou "20/07 09:42" — a coluna "última atualização" da listagem.
 *
 * A comparação com hoje é textual e no fuso do navegador, que é o mesmo fuso em
 * que `data_execucao` guarda a hora (São Paulo, sem sufixo). Converter por
 * `new Date()` é o caminho que já fez "Autorizado em" e "Executado em"
 * discordarem em 3h.
 */
export function dataHoraRelativa(valor: string | null): string {
  if (!valor) return '—'
  const dia = valor.slice(0, 10)
  const hora = horaDoTimestamp(valor)
  return dia === hojeLocal() ? `Hoje ${hora}` : `${formatarDia(dia)} ${hora}`
}

/** Sem acento e sem caixa: "joao" acha "João". */
export function normalizar(valor: string): string {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Só para o primeiro render, quando não há alvo vindo de fora. */
export function hojeLocal(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
