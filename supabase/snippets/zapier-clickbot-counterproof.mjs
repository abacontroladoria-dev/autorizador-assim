#!/usr/bin/env node

// =============================================================================
// Contraprova: publicar no ClickUp Chat como ClickBot, via HTTP puro
// =============================================================================
// Objetivo: provar (ou refutar) que dá para executar a action `createChatMessage`
// do conector oficial ClickUp do Zapier — com `send_as_bot: true` — usando só
// `fetch` e Client Credentials, SEM o @zapier/zapier-sdk. É o que decide se a
// Edge Function do Pulsar consegue publicar como ClickBot, já que o SDK não roda
// em Deno (depende de node:fs para manifest e de Buffer para ler JWT).
//
// COMO RODAR (o secret vem do ambiente, nunca do arquivo — repo é público):
//
//   ZAPIER_CLIENT_ID=... ZAPIER_CLIENT_SECRET=... node supabase/snippets/zapier-clickbot-counterproof.mjs
//
// -----------------------------------------------------------------------------
// POR QUE A VERSÃO ANTERIOR DESTE SCRIPT TOMAVA 405
// -----------------------------------------------------------------------------
// Ela postava em `https://zapier.com/zapier/api/actions/v1/runs`, montado como
// ZAPIER_BASE_URL + ACTION_RUNS_PATH. Parece certo lendo as constantes do SDK, e
// está errado: `/zapier` NÃO é um segmento de URL, é uma CHAVE DE ROTEAMENTO.
//
// Em src/api/routing/config.ts o SDK mantém um `pathConfig`, e a função
// `resolveDefaultRoute` reescreve o caminho antes de sair:
//
//   "/zapier": { authHeader: "Authorization", pathPrefix: "/api/v0/sdk/zapier" }
//
// O prefixo `/zapier` é REMOVIDO e trocado por `/api/v0/sdk/zapier`, e o host
// ganha o subdomínio `sdkapi` (o default de `resolveDefaultRoute`; só `/forms` e
// `/agentic-management` usam `api`). Ou seja, o path do SDK
//
//   /zapier/api/actions/v1/runs
//
// vira, na rede,
//
//   https://sdkapi.zapier.com/api/v0/sdk/zapier/api/actions/v1/runs
//
// O 405 era o site institucional zapier.com respondendo — não a API.
//
// -----------------------------------------------------------------------------
// E A API PÚBLICA /v2/action-runs?
// -----------------------------------------------------------------------------
// `https://api.zapier.com/v2/action-runs` EXISTE, mas é outra superfície, e o
// SDK 0.107.0 não a usa em lugar nenhum (nenhuma ocorrência de "v2" ou
// "action-runs" no bundle). Sondagem sem credencial separa as duas:
//
//   POST https://api.zapier.com/v2/action-runs
//     -> 403 {"code":"authentication_failed","detail":"Invalid token header..."}
//        Rejeita no gateway, ANTES de olhar o corpo. Não diz nada sobre campos.
//
//   POST https://sdkapi.zapier.com/api/v0/sdk/zapier/api/actions/v1/runs
//     -> 400 {"code":"bad-request",
//             "detail":"Missing required action fields: action_key, action_type,
//                       and selected_api are required"}
//
// A segunda resposta é a prova de que a rota é a certa: ela conhece exatamente os
// campos `action_key`, `action_type` e `selected_api` — o vocabulário do
// `runRequestData` do SDK. Por isso este script usa a rota do SDK, e não a
// pública: é a que comprovadamente executa a action com `inputs` repassado cru,
// que é o único motivo de `send_as_bot` funcionar (o schema público não declara
// esse campo; o conector recebe assim mesmo).
// =============================================================================

const TOKEN_URL = "https://zapier.com/oauth/token/";

// Já reescrito à mão, exatamente como `resolveDefaultRoute` faria. Manter o
// resultado final aqui — e não a concatenação ingênua — é o que evita repetir o
// 405 quando alguém reler as constantes do SDK e "corrigir" este arquivo.
const RUNS_URL =
  process.env.ZAPIER_RUNS_URL ||
  "https://sdkapi.zapier.com/api/v0/sdk/zapier/api/actions/v1/runs";

/** Teto do polling. O SDK usa DEFAULT_ACTION_TIMEOUT_MILLISECONDS = 180_000. */
const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * O SDK escolhe o esquema do header INSPECIONANDO o token (getAuthorizationHeader):
 * três segmentos base64url => "JWT", qualquer outra coisa => "Bearer". Não é o
 * `token_type` da resposta OAuth. Replicado aqui pelo mesmo critério.
 */
function isJwtLike(token) {
  const parts = token.split(".");
  return (
    parts.length === 3 &&
    parts.every((part) => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part))
  );
}

async function lerCorpo(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 800) };
  }
}

/**
 * Client Credentials -> access_token.
 *
 * `audience: "zapier.com"` é obrigatório e não é óbvio; sai de
 * `exchangeClientCredentials` no bundle do SDK. `scope` default "external" é o
 * que `mergeScopes` usa quando nenhum escopo é pedido.
 */
async function obterToken(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: process.env.ZAPIER_SCOPE || "external",
    audience: process.env.ZAPIER_AUDIENCE || "zapier.com",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await lerCorpo(response);

  if (!response.ok) {
    throw new Error(
      `Troca de client credentials falhou (HTTP ${response.status}):\n${safeJson(payload)}`,
    );
  }
  if (!payload.access_token) {
    throw new Error(`Resposta sem access_token:\n${safeJson(payload)}`);
  }

  return {
    token: payload.access_token,
    tokenType: payload.token_type ?? null,
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope ?? null,
  };
}

function montarHeaders(token) {
  return {
    // O pathConfig de "/zapier" declara authHeader: "Authorization".
    Authorization: `${isJwtLike(token) ? "JWT" : "Bearer"} ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    // Telemetria que o gateway espera (applyTelemetryHeaders). Não é
    // obrigatória, mas identifica esta chamada nos logs do Zapier em vez de ela
    // aparecer como cliente anônimo.
    "zapier-sdk-version": "0.107.0",
  };
}

/**
 * Dispara a execução. Corpo envelopado em `data`, como `api.post(ACTION_RUNS_PATH,
 * { data: runRequestData })`.
 *
 * `authentication_id` é o nome de wire do que a UI do Zapier chama de "conexão":
 * o `connection` do SDK vira `runRequestData.authentication_id`.
 */
async function criarRun(token) {
  const inputs = {
    team_id: Number(process.env.ZAPIER_TEAM_ID || "9011600909"),
    view_id: process.env.ZAPIER_VIEW_ID || "8cj47gd-16871",
    comment_type: "message",
    comment_text:
      process.env.ZAPIER_MESSAGE || "CONTRAPROVA HTTP — deve aparecer como ClickBot",
    // O ponto do teste. Ausente do schema público da action; chega ao conector
    // porque `inputs` é repassado sem validação.
    send_as_bot: true,
  };

  if (!Number.isInteger(inputs.team_id)) {
    throw new Error(`ZAPIER_TEAM_ID inválido: ${process.env.ZAPIER_TEAM_ID}`);
  }

  const corpo = {
    data: {
      selected_api: process.env.ZAPIER_SELECTED_API || "ClickUpCLIAPI@2.1.63",
      action_key: process.env.ZAPIER_ACTION_KEY || "createChatMessage",
      action_type: process.env.ZAPIER_ACTION_TYPE || "write",
      authentication_id:
        process.env.ZAPIER_CONNECTION_ID || "02c96d4d-1deb-877a-892a-544525ce469f",
      inputs,
    },
  };

  console.log("\n=== REQUEST ===");
  console.log(`POST ${RUNS_URL}`);
  console.log(safeJson(corpo));

  const response = await fetch(RUNS_URL, {
    method: "POST",
    headers: montarHeaders(token),
    body: JSON.stringify(corpo),
  });

  const payload = await lerCorpo(response);

  console.log("\n=== RESPONSE (create) ===");
  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log(safeJson(payload));

  if (!response.ok) {
    throw new Error(`Criação do run falhou (HTTP ${response.status}).`);
  }

  const runId = payload?.data?.id;
  if (!runId) throw new Error(`Resposta sem data.id:\n${safeJson(payload)}`);

  return runId;
}

/**
 * Polling, na mesma regra do SDK (`api.poll` em runActionPlugin):
 * 202 ou `data.status === "waiting"` = ainda rodando; 200 com status diferente =
 * terminou. `errors` não-vazio significa falha DA ACTION mesmo com HTTP 200 —
 * é assim que "View not found" aparece.
 */
async function aguardarRun(token, runId) {
  const url = `${RUNS_URL}/${encodeURIComponent(runId)}`;
  const limite = Date.now() + POLL_TIMEOUT_MS;
  let tentativas = 0;

  console.log("\n=== POLLING ===");
  console.log(`GET ${url}`);

  while (Date.now() < limite) {
    tentativas++;
    const response = await fetch(url, { method: "GET", headers: montarHeaders(token) });
    const payload = await lerCorpo(response);
    const status = payload?.data?.status;

    if (response.status !== 202 && status !== "waiting") {
      console.log(`\nConcluído após ${tentativas} tentativa(s). HTTP ${response.status}`);
      console.log(safeJson(payload));
      return payload?.data ?? {};
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Timeout de ${POLL_TIMEOUT_MS}ms aguardando o run ${runId}.`);
}

async function main() {
  const clientId = required("ZAPIER_CLIENT_ID");
  const clientSecret = required("ZAPIER_CLIENT_SECRET");

  console.log("Contraprova ClickBot — HTTP puro, sem SDK");

  const auth = await obterToken(clientId, clientSecret);

  console.log("\n=== TOKEN ===");
  console.log(`token_type   : ${auth.tokenType ?? "(nenhum)"}`);
  console.log(`formato JWT  : ${isJwtLike(auth.token) ? "SIM -> header 'JWT'" : "NÃO -> header 'Bearer'"}`);
  console.log(`expires_in   : ${auth.expiresIn ?? "(nenhum)"}`);
  console.log(`scope        : ${auth.scope ?? "(nenhum)"}`);

  const runId = await criarRun(auth.token);
  const resultado = await aguardarRun(auth.token, runId);

  const erros = resultado?.errors ?? [];

  console.log("\n=== VEREDITO ===");

  if (erros.length > 0) {
    console.log("❌ A ACTION FALHOU (HTTP pode ter sido 200 — o erro vem no corpo):");
    for (const e of erros) console.log(`   - ${e.detail || e.title || safeJson(e)}`);
    process.exitCode = 1;
    return;
  }

  console.log("✅ Run concluído sem erros.");
  console.log("");
  console.log("ISTO AINDA NÃO É A PROVA. HTTP 200 diz que o request era válido,");
  console.log("não que `send_as_bot` fez efeito — é a mesma armadilha do campo");
  console.log("`followers`, que voltou 201 sem notificar ninguém.");
  console.log("");
  console.log("A prova é VISUAL: abra o canal no ClickUp e confirme que o AUTOR");
  console.log("da mensagem é ClickBot, e não Caio Vinícius.");
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
