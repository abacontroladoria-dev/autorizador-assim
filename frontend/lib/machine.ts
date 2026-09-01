// ============================================================================
// Sonda do robô de autorização, servido em 127.0.0.1:3010 NA MÁQUINA DA ATENDENTE
//
// POR QUE ISTO DEVOLVE UM MOTIVO, E NÃO SÓ `null`
//
// Antes, qualquer falha virava `null`: CSP bloqueando, robô parado, porta tomada
// e id vazio produziam a MESMA tela ("Sistema Offline"). Em 01/09/2026 isso custou
// uma tarde — o `connect-src` não listava a porta fora de dev, o browser cortava a
// chamada antes da rede, e a recepção via "offline" com os robôs vivos e
// autorizando (last_seen de 16–19s). A investigação começou pelo worker da Central
// e passou pelo robô antes de alguém abrir o console e ler o erro de CSP.
//
// Distinguir aqui é o que permite a tela dizer o que fazer em vez de só dizer que
// algo deu errado.
//
// COMO CADA MOTIVO SE APRESENTA
//
// O fetch bloqueado por CSP rejeita com TypeError, exatamente como o robô parado:
// o browser NÃO expõe "foi a CSP" ao JS (é reportado só no console, de propósito —
// contar isso à página vazaria informação sobre a política). Então não dá para
// separar os dois olhando só a exceção; quem separa é o `last_seen` do banco, e
// esse cruzamento é feito na página, não aqui.
// ============================================================================

export type MotivoIndisponivel =
  | 'inalcancavel'   // fetch rejeitou: CSP, robô parado, porta tomada
  | 'timeout'        // respondeu devagar demais (2s)
  | 'erro_http'      // respondeu, mas não com 2xx
  | 'sem_id'         // respondeu 2xx sem machine_id utilizável

export type SondaRobo =
  | { ok: true;  machineId: string }
  | { ok: false; motivo: MotivoIndisponivel }

// Timeout curto: a página re-sonda a cada 5s, então esperar mais só atrasaria o
// diagnóstico sem mudar o resultado.
const TIMEOUT_MS = 2000

export async function sondarRobo(): Promise<SondaRobo> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('http://127.0.0.1:3010/machine-id', {
      signal: controller.signal,
    })

    if (!res.ok) return { ok: false, motivo: 'erro_http' }

    const data = await res.json()
    const machineId = typeof data?.machine_id === 'string' ? data.machine_id.trim() : ''

    // Sem id não dá para solicitar: a linha da fila nasceria sem dono e o robô
    // nunca a reivindicaria. Melhor tratar como indisponível.
    if (!machineId) return { ok: false, motivo: 'sem_id' }

    return { ok: true, machineId }

  } catch (err) {
    // AbortError é o nosso próprio timeout; o resto é o fetch não completando.
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    return { ok: false, motivo: timedOut ? 'timeout' : 'inalcancavel' }

  } finally {
    clearTimeout(timeout)
  }
}

// Mantida para quem só precisa do id: /autorizacoes-avulsas usa exatamente assim.
export async function getMachineId(): Promise<string | null> {
  const sonda = await sondarRobo()
  return sonda.ok ? sonda.machineId : null
}
