/**
 * =========================
 * SESSÃO ASSIM
 * =========================
 *
 * Resolve o problema relatado: "toda vez que clico em autorização ele pede
 * usuário e senha, mas indo direto no site eu só logo uma vez".
 *
 * CAUSA
 * rpa.js criava `browser.newContext()` por tarefa. Contexto do Playwright é
 * sessão limpa — cookies zerados. Cada autorização chegava à ASSIM como
 * visitante desconhecido, e quem pagava era a recepcionista, digitando a senha
 * do portal a cada paciente.
 *
 * POR QUE NÃO BASTA "USAR UM CONTEXTO SÓ"
 * Porque o contexto por tarefa não era desperdício: era proteção. O
 * `js/acesso.js` da ASSIM roda `limitarAba()`, que usa
 * `BroadcastChannel("autenticacao")` + `sessionStorage.tabid` para detectar
 * segunda aba do domínio e mandar a intrusa para `bloqueio.php`. Os dois
 * mecanismos são isolados por contexto — um contexto por tarefa nunca dispara o
 * guarda. Juntar tudo num contexto só seria entregar o robô ao bloqueio.
 *
 * Medido em 2026-08-13: na tela de login o guarda não dispara, porque
 * `multAbas` é lido sem nunca ser declarado e o `!multAbas` estoura
 * ReferenceError dentro do handler. Nas telas internas não há como saber sem
 * credencial — e não se projeta sobre palpite.
 *
 * SOLUÇÃO
 * Separar sessão de contexto. Loga UMA vez num contexto temporário, colhe o
 * `PHPSESSID`, joga o contexto fora. Cada tarefa segue no seu próprio contexto,
 * mas nasce com o cookie injetado — já autenticada. Login uma vez, isolamento
 * intacto.
 *
 * De brinde, os contextos passam a ser FECHADOS. Hoje eles vazam: rpa.js deixa
 * página e contexto abertos de propósito (para impressão) e nunca os recolhe,
 * então quarenta autorizações no dia viram quarenta processos de Chrome.
 */

const { delay, humanType } = require('./humano')

const DOMINIO_ASSIM = 'autorizador.assim.com.br'

class SessaoAssim {
  constructor(browser) {
    this.browser = browser
    this.cookies = null
    this.logadoEm = null
    /** @type {{ctx: any, page: any, criadoEm: number, filaId: string|null}[]} */
    this.abas = []
  }

  trocarBrowser(browser) {
    this.browser = browser
    // Browser novo = contextos antigos morreram com ele. A sessão (cookie)
    // continua valendo: ela é do servidor da ASSIM, não do processo local.
    this.abas = []
  }

  // =========================
  // LOGIN
  // =========================

  /**
   * Garante que temos um PHPSESSID autenticado em memória.
   * Faz login só quando não há cookie ou quando `forcar` é pedido (sessão caiu).
   */
  async garantirSessao(cfg, { forcar = false } = {}) {
    if (this.cookies && !forcar) return this.cookies

    console.log(forcar ? '🔑 Sessão da ASSIM caiu — refazendo login...' : '🔑 Fazendo login na ASSIM...')

    const ctx = await this.browser.newContext()
    const page = await ctx.newPage()
    const alertas = []

    // valida() usa alert() quando falta campo. Playwright dispensa dialog
    // automaticamente e em silêncio — sem este handler, um login recusado
    // viraria espera por uma navegação que nunca acontece.
    page.on('dialog', async (d) => {
      alertas.push(d.message())
      await d.dismiss().catch(() => {})
    })

    try {
      await page.goto(cfg.login_url, { waitUntil: 'domcontentloaded', timeout: 45000 })

      if (await page.locator('input[name="senha"]').count() === 0) {
        throw new Error(
          'Tela de login da ASSIM não encontrada (input[name="senha"] ausente). ' +
          'O portal pode ter mudado outra vez — confira robo_config.assim_login_url.'
        )
      }

      if (!cfg.senha) {
        throw new Error(
          'Senha da ASSIM não veio do servidor. Cadastre-a no Vault: ' +
          'supabase/snippets/robo_provisionar.sql, bloco 1.'
        )
      }

      // O campo "Código" não tem `name` e não é enviado — ele só espelha para o
      // <select> via onkeyup. Preenchemos os dois: o select é o que valida()
      // exige, e o código deixa a tela coerente para quem estiver olhando.
      const campoCodigo = page.locator('form[name="entrar"] input[type="text"]').first()
      if (await campoCodigo.count()) {
        await campoCodigo.fill('')
        await humanType(page, 'form[name="entrar"] input[type="text"]', String(cfg.id_hospital))
      }

      await page.selectOption('select[name="id_hospital"]', String(cfg.id_hospital))
      await humanType(page, 'input[name="senha"]', cfg.senha)

      // O botão é type=button com onclick="valida()", não submit. valida()
      // confere id_hospital e senha e só então chama form.submit().
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => {}),
        page.locator('form[name="entrar"] input[type="button"]').first().click(),
      ])

      await delay(1500)

      if (alertas.length) {
        throw new Error('ASSIM recusou o login (alert): ' + alertas.join(' | '))
      }

      if (page.url().includes('bloqueio.php')) {
        throw new Error(
          'ASSIM respondeu bloqueio.php no login — o portal considerou que já há ' +
          'outra sessão/aba ativa. Feche as janelas abertas do autorizador e tente de novo.'
        )
      }

      // Prova definitiva: a deep link do formulário só abre autenticado.
      await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 45000 })

      if (await page.locator('select[name="operacao"]').count() === 0) {
        const aindaNoLogin = await page.locator('input[name="senha"]').count() > 0
        throw new Error(
          aindaNoLogin
            ? 'Login não foi aceito: o portal voltou para a tela de senha. Confira a senha no Vault.'
            : `Após o login, a tela do formulário não apareceu (URL: ${page.url()}).`
        )
      }

      const todos = await ctx.cookies()
      this.cookies = todos.filter(c => (c.domain || '').includes(DOMINIO_ASSIM))

      if (!this.cookies.some(c => c.name === 'PHPSESSID')) {
        throw new Error('Login aparentemente OK, mas nenhum PHPSESSID foi emitido.')
      }

      this.logadoEm = Date.now()
      console.log('✅ Login na ASSIM concluído — sessão guardada em memória')

      return this.cookies

    } finally {
      // O contexto de login é descartável: ele existe só para colher o cookie.
      await ctx.close().catch(() => {})
    }
  }

  // =========================
  // PÁGINA POR TAREFA
  // =========================

  /**
   * Abre uma página já autenticada, no formulário da ASSIM, em contexto próprio.
   * Relogar e repetir é tratado aqui — quem chama recebe uma página pronta.
   */
  async abrirFormulario(cfg) {
    await this.garantirSessao(cfg)

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const ctx = await this.browser.newContext()
      await ctx.addCookies(this.cookies)

      const page = await ctx.newPage()
      page.on('dialog', async (d) => {
        console.log('💬 ASSIM alertou:', d.message())
        await d.dismiss().catch(() => {})
      })

      try {
        await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 45000 })

        if (page.url().includes('bloqueio.php')) {
          throw Object.assign(new Error('ASSIM respondeu bloqueio.php'), { sessaoRuim: false })
        }

        if (await page.locator('select[name="operacao"]').count() > 0) {
          const registro = { ctx, page, criadoEm: Date.now(), filaId: null }
          this.abas.push(registro)
          return registro
        }

        // Caiu no login: cookie expirou.
        throw Object.assign(
          new Error('Sessão da ASSIM expirou'),
          { sessaoRuim: true }
        )

      } catch (erro) {
        await ctx.close().catch(() => {})

        if (tentativa === 2 || !erro.sessaoRuim) throw erro

        await this.garantirSessao(cfg, { forcar: true })
      }
    }
  }

  // =========================
  // POOL DE ABAS
  // =========================

  /**
   * Fecha contextos excedentes e vencidos.
   *
   * As abas são deixadas abertas de propósito, para a recepcionista imprimir a
   * guia. O que não pode é acumular sem limite: cada aba é um processo do
   * Chrome (50–200 MB), e hoje elas nunca são recolhidas.
   *
   * Fecha o CONTEXTO, não só a página — é o contexto que vaza hoje.
   */
  async podar(cfg) {
    const teto = Math.max(1, Number(cfg.max_abas_abertas) || 3)
    const ttlMs = Math.max(1, Number(cfg.aba_ttl_minutos) || 30) * 60000
    const agora = Date.now()

    const vencidas = this.abas.filter(a => agora - a.criadoEm > ttlMs)
    const excedentes = this.abas
      .filter(a => !vencidas.includes(a))
      .slice(0, Math.max(0, this.abas.length - vencidas.length - teto))

    for (const aba of [...vencidas, ...excedentes]) {
      await aba.ctx.close().catch(() => {})
      this.abas = this.abas.filter(a => a !== aba)
    }

    if (vencidas.length || excedentes.length) {
      console.log(
        `🧹 ${vencidas.length + excedentes.length} aba(s) fechada(s) ` +
        `(${vencidas.length} por tempo, ${excedentes.length} por teto de ${teto}) — ` +
        `restam ${this.abas.length}`
      )
    }
  }

  /** Descarta uma aba imediatamente (execução que deu errado, nada a imprimir). */
  async descartar(registro) {
    if (!registro) return
    await registro.ctx.close().catch(() => {})
    this.abas = this.abas.filter(a => a !== registro)
  }

  async fecharTudo() {
    for (const aba of this.abas) {
      await aba.ctx.close().catch(() => {})
    }
    this.abas = []
  }
}

module.exports = { SessaoAssim }
