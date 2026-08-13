/**
 * =========================
 * API DO ROBÔ
 * =========================
 *
 * Único ponto de contato com o servidor. Sete RPCs, nada de acesso direto a
 * tabela.
 *
 * POR QUE `fetch` E NÃO @supabase/supabase-js
 * O robô fazia 7 operações de tabela; agora faz 7 POSTs em /rest/v1/rpc/. A
 * biblioteca não acrescenta nada nesse recorte e cobrava caro no pacote offline:
 * ela instancia o cliente de realtime no construtor, que exige WebSocket nativo
 * (Node 22+). O pacote roda em Node 20, e a solução até aqui era um
 * `ws-polyfill.js` pré-carregado via `node -r` — um dos três bugs que
 * atrasaram a instalação. Com `fetch` (nativo desde o Node 18) o polyfill, a
 * dependência `ws` e a própria @supabase/supabase-js saem do pacote.
 *
 * O QUE VIAJA
 * A anon key vai no header `apikey` — é pública por desenho, já está no bundle
 * do frontend. Quem autoriza de fato é o token da máquina, que vai no CORPO do
 * POST. Nunca em querystring: corpo de POST não entra em log de acesso.
 */

const TENTATIVAS_MAX = 4

function erroFatal(mensagem) {
  const e = new Error(mensagem)
  e.fatal = true
  return e
}

class Api {
  /**
   * @param {string} url   ex.: https://xxxx.supabase.co
   * @param {string} anon  anon key (pública)
   * @param {string} token token daquela máquina (segredo)
   */
  constructor(url, anon, token) {
    if (!url)   throw erroFatal('SUPABASE_URL não definida no .env')
    if (!anon)  throw erroFatal('SUPABASE_ANON_KEY não definida no .env')
    if (!token) throw erroFatal('Token da máquina ausente')

    this.base = url.replace(/\/+$/, '') + '/rest/v1/rpc/'
    this.anon = anon
    this.token = token
  }

  /**
   * Chama uma RPC. Repete só o que vale repetir.
   *
   * Erro de rede e 5xx são transitórios (internet da clínica cai, Supabase
   * reinicia) — vale insistir com espera crescente. 4xx não: token inválido ou
   * revogado não melhora com tentativa, e insistir só gera ruído.
   */
  async chamar(funcao, argumentos = {}, { tentativas = TENTATIVAS_MAX } = {}) {
    let ultimoErro

    for (let i = 1; i <= tentativas; i++) {
      let resposta
      try {
        resposta = await fetch(this.base + funcao, {
          method: 'POST',
          headers: {
            'apikey': this.anon,
            'Authorization': 'Bearer ' + this.anon,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_token: this.token, ...argumentos }),
          signal: AbortSignal.timeout(20000),
        })
      } catch (erroRede) {
        ultimoErro = new Error(`${funcao}: falha de rede — ${erroRede.message}`)
        await this.esperar(i)
        continue
      }

      if (resposta.ok) {
        const texto = await resposta.text()
        return texto ? JSON.parse(texto) : null
      }

      const corpo = await resposta.text().catch(() => '')

      // 401/403 com o nosso errcode significa credencial: nunca é transitório.
      if (resposta.status < 500) {
        const detalhe = corpo.slice(0, 300)
        if (/token invalido/i.test(detalhe)) {
          throw erroFatal(
            `Token desta máquina foi recusado pelo servidor (${funcao}). ` +
            'Ele pode ter sido revogado ou trocado. Gere um token novo com ' +
            'supabase/snippets/robo_provisionar.sql (bloco 2) e reinstale.'
          )
        }
        throw new Error(`${funcao}: HTTP ${resposta.status} — ${detalhe}`)
      }

      ultimoErro = new Error(`${funcao}: HTTP ${resposta.status} — ${corpo.slice(0, 200)}`)
      await this.esperar(i)
    }

    throw ultimoErro
  }

  esperar(tentativa) {
    // 1s, 2s, 4s — teto baixo de propósito: o robô tem que voltar a atender
    // rápido quando a rede volta.
    return new Promise(r => setTimeout(r, Math.min(1000 * 2 ** (tentativa - 1), 8000)))
  }

  // =========================
  // As 7 operações
  // =========================

  /** Identidade, estado, ritmo de poll e aviso de versão nova. */
  heartbeat({ hostname, so, versao }) {
    return this.chamar('robo_heartbeat', {
      p_hostname: hostname ?? null,
      p_so: so ?? null,
      p_versao: versao ?? null,
    })
  }

  /** Próxima tarefa desta máquina, já travada. `null` quando não há. */
  buscarTarefa() {
    return this.chamar('robo_buscar_tarefa')
  }

  /** Status atual da tarefa — usado para detectar cancelamento em andamento. */
  statusTarefa(filaId) {
    return this.chamar('robo_status_tarefa', { p_fila_id: filaId })
  }

  /** Log de execução. Best-effort: falha aqui não deve derrubar a tarefa. */
  async registrarLog(filaId, mensagem) {
    try {
      await this.chamar('robo_registrar_log',
        { p_fila_id: filaId, p_mensagem: mensagem },
        { tentativas: 1 })
    } catch (e) {
      console.error('⚠️  não foi possível registrar log:', e.message)
    }
  }

  /** Desfecho. Só 'concluido', 'concluido_sem_guia' ou 'erro' são aceitos. */
  concluirTarefa(filaId, status, extras = {}) {
    return this.chamar('robo_concluir_tarefa', {
      p_fila_id: filaId,
      p_status: status,
      p_numero_autorizacao: extras.numeroAutorizacao ?? null,
      p_forma_autorizacao: extras.formaAutorizacao ?? null,
      p_horario_autorizacao: extras.horarioAutorizacao ?? null,
      p_error_message: extras.erro ?? null,
    })
  }

  /** Config do formulário da ASSIM + senha (do Vault). Só em memória. */
  obterConfigAssim() {
    return this.chamar('robo_obter_config_assim')
  }

  /** Pacote de atualização assinado. */
  obterPacote(versao) {
    return this.chamar('robo_obter_pacote', { p_versao: versao })
  }
}

module.exports = { Api }
