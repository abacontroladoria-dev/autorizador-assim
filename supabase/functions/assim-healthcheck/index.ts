// =============================================================================
// Sonda de disponibilidade do portal da ASSIM -> ClickUp + sino do Pulsar
// =============================================================================
// Restaura o aviso que o robô da geração anterior dava no Slack
// (projeto_automacao/robo-assim/robo-v3.3.js, linhas 723-754) e que se perdeu
// quando o Slack saiu de uso. Agora o destino é o canal de Chat do ClickUp
// #suporte-recepção-autorização, e o incidente também fica registrado na Central
// de Alertas do Pulsar.
//
// Chamada pelo cron `healthcheck-assim` a cada 5 min em horário comercial, via
// public.fn_assim_healthcheck_disparar. Invocável à mão para teste — responde
// sempre 200 com um resumo em JSON, porque um curl que devolve "ok" não testa nada.
//
// O QUE ESTA FUNÇÃO NÃO DECIDE
// Se houve queda ou volta. Isso é fn_assim_healthcheck_registrar, sob FOR UPDATE,
// porque duas execuções concorrentes anunciariam a mesma queda duas vezes se cada
// uma comparasse o estado por conta própria. Aqui só se mede o portal, se monta a
// frase e se entrega.
//
// POR QUE O TEXTO É MONTADO AQUI E NÃO NO SQL
// A RPC devolve o fato (transicao, duração, motivo); a frase é deste arquivo. Uma
// pendência de envio que sobreviveu a uma falha do ClickUp é reenviada pela
// execução seguinte — se a frase estivesse gravada no banco, ela chegaria escrita
// pela versão antiga do código.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLICKUP_TOKEN = Deno.env.get("CLICKUP_TOKEN");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TITULO = "**MONITORAMENTO · SISTEMA PULSAR**";

type Sonda = {
  ok: boolean;
  httpStatus: number | null;
  latenciaMs: number;
  erro: string | null;
};

/**
 * Uma tentativa. Distingue três formas de estar fora do ar, porque "não
 * respondeu" e "respondeu sem a tela de login" pedem investigações diferentes —
 * a segunda costuma ser página de manutenção ou mudança no portal, não queda.
 */
async function tentar(url: string, timeoutMs: number, marcador: string): Promise<Sonda> {
  const inicio = Date.now();
  const controller = new AbortController();
  const alarme = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Pulsar-Healthcheck/1.0" },
    });
    const corpo = await res.text();
    const latenciaMs = Date.now() - inicio;

    if (res.status >= 500) {
      return { ok: false, httpStatus: res.status, latenciaMs, erro: `portal respondeu HTTP ${res.status}` };
    }
    if (!corpo.toLowerCase().includes(marcador.toLowerCase())) {
      return {
        ok: false,
        httpStatus: res.status,
        latenciaMs,
        erro: `portal respondeu HTTP ${res.status} sem a tela de login (marcador "${marcador}" ausente)`,
      };
    }
    return { ok: true, httpStatus: res.status, latenciaMs, erro: null };
  } catch (e) {
    const latenciaMs = Date.now() - inicio;
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      httpStatus: null,
      latenciaMs,
      erro: abortado
        ? `sem resposta em ${timeoutMs} ms`
        : `falha de rede: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(alarme);
  }
}

/** N tentativas espaçadas, como no original. Uma só faria de um blip uma queda. */
async function sondar(
  url: string,
  tentativas: number,
  timeoutMs: number,
  intervaloMs: number,
  marcador: string,
): Promise<Sonda> {
  let ultima: Sonda = { ok: false, httpStatus: null, latenciaMs: 0, erro: "nenhuma tentativa executada" };

  for (let i = 1; i <= tentativas; i++) {
    ultima = await tentar(url, timeoutMs, marcador);
    if (ultima.ok) return ultima;
    if (i < tentativas && intervaloMs > 0) {
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
  return ultima;
}

/**
 * As duas mensagens, herdadas do original. O motivo técnico fica de fora de
 * propósito: ele não muda o que a recepção faz, e continua gravado no log e na
 * descrição do alerta, que é onde se investiga.
 */
function montarMensagem(p: { transicao: string; em: string; duracao_minutos: number | null }): string {
  if (p.transicao === "caiu") {
    return [
      TITULO,
      "",
      "🔴 **INDISPONIBILIDADE DETECTADA**",
      "O portal do Autorizador da ASSIM está FORA do ar.",
      `⏰ ${p.em}`,
    ].join("\n");
  }

  const fora = p.duracao_minutos ? ` · ficou fora por ${p.duracao_minutos} min` : "";
  return [
    TITULO,
    "",
    "🟢 **DISPONIBILIDADE RESTAURADA**",
    "O portal do Autorizador da ASSIM está online novamente.",
    `⏰ ${p.em}${fora}`,
  ].join("\n");
}

/**
 * Chat do ClickUp (API v3). O token pessoal vai CRU no Authorization, sem
 * "Bearer" — é assim para token pessoal, diferente do OAuth.
 * content_format text/md é o que faz o negrito chegar negrito.
 */
async function enviarClickUp(workspaceId: string, channelId: string, conteudo: string) {
  const res = await fetch(
    `https://api.clickup.com/api/v3/workspaces/${workspaceId}/chat/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "message",
        content: conteudo,
        content_format: "text/md",
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async () => {
  const resumo: Record<string, unknown> = {};

  try {
    const { data: cfg, error: erroCfg } = await supabase
      .from("assim_healthcheck")
      .select("*")
      .eq("id", 1)
      .single();

    if (erroCfg || !cfg) {
      throw new Error(`config indisponível: ${erroCfg?.message ?? "linha id=1 ausente"}`);
    }

    if (!cfg.ativo) {
      return json({ ignorado: "sonda desativada em assim_healthcheck.ativo" });
    }

    // A URL do robô é a fonte única — a mesma tela em que ele loga. O override
    // existe para o teste: apontar para um host morto simula uma queda.
    let url: string | null = cfg.url_override;
    if (!url) {
      const { data: rc } = await supabase
        .from("robo_config")
        .select("assim_login_url")
        .eq("id", 1)
        .single();
      url = rc?.assim_login_url ?? null;
    }
    if (!url) {
      throw new Error("sem URL para sondar: url_override nulo e robo_config.assim_login_url vazio");
    }

    const sonda = await sondar(
      url,
      cfg.tentativas,
      cfg.timeout_ms,
      cfg.intervalo_tentativa_ms,
      cfg.marcador_html,
    );

    resumo.url = url;
    resumo.status = sonda.ok ? "online" : "offline";
    resumo.http_status = sonda.httpStatus;
    resumo.latencia_ms = sonda.latenciaMs;
    resumo.erro = sonda.erro;

    const { data: decisao, error: erroRpc } = await supabase.rpc("fn_assim_healthcheck_registrar", {
      p_ok: sonda.ok,
      p_http_status: sonda.httpStatus,
      p_latencia_ms: sonda.latenciaMs,
      p_erro: sonda.erro,
    });

    if (erroRpc) throw new Error(`fn_assim_healthcheck_registrar: ${erroRpc.message}`);

    resumo.transicao = decisao?.transicao ?? null;
    resumo.alerta_id = decisao?.alerta_id ?? null;

    // `pendente` cobre os dois casos numa variável só: a transição de agora e a
    // que ficou de uma execução anterior cujo envio falhou.
    const pendente = decisao?.pendente ?? null;

    if (!pendente) {
      resumo.clickup = "nada a enviar";
      return json(resumo);
    }

    if (!CLICKUP_TOKEN) {
      resumo.clickup = "CLICKUP_TOKEN ausente nos secrets — aviso fica pendente";
      return json(resumo);
    }
    if (!cfg.clickup_workspace_id || !cfg.clickup_channel_id) {
      resumo.clickup = "clickup_workspace_id/channel_id não configurados — aviso fica pendente";
      return json(resumo);
    }

    try {
      await enviarClickUp(cfg.clickup_workspace_id, cfg.clickup_channel_id, montarMensagem(pendente));
      // Só o envio confirmado limpa a pendência. Se este ponto não for atingido,
      // a execução seguinte reenvia — o aviso atrasa, não se perde.
      const { error: erroLimpar } = await supabase.rpc("fn_assim_healthcheck_notificado");
      if (erroLimpar) throw new Error(`fn_assim_healthcheck_notificado: ${erroLimpar.message}`);
      resumo.clickup = "enviado";
    } catch (e) {
      resumo.clickup = `falhou, segue pendente: ${e instanceof Error ? e.message : String(e)}`;
      console.error("❌ envio ao ClickUp falhou:", e);
    }

    return json(resumo);
  } catch (e) {
    // 500 de propósito: um erro AQUI é a própria sonda quebrada, e precisa
    // aparecer em cron.job_run_details em vez de virar um "sucesso" silencioso.
    console.error("⛔ assim-healthcheck:", e);
    return json({ ...resumo, erro_fatal: e instanceof Error ? e.message : String(e) }, 500);
  }
});
