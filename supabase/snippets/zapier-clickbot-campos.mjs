#!/usr/bin/env node

// =============================================================================
// O ClickBot pode ter outro nome? — inventário dos campos reais da action
// =============================================================================
// Contexto: a contraprova (zapier-clickbot-counterproof.mjs) provou que
// `send_as_bot: true` faz a mensagem sair como **ClickBot**. A pergunta seguinte
// do usuário é se esse NOME pode virar "Robô de Avisos Corporativos".
//
// Este script não adivinha: pergunta ao Zapier quais campos a action
// `createChatMessage` aceita de verdade, e testa os candidatos plausíveis.
//
// COMO RODAR (secret só no ambiente — repo é público):
//
//   PowerShell:
//     $env:ZAPIER_CLIENT_ID = "..."
//     $env:ZAPIER_CLIENT_SECRET = "..."
//     node supabase/snippets/zapier-clickbot-campos.mjs
//
// O QUE ELE FAZ, EM DUAS ETAPAS
//
//   1. INVENTÁRIO (sem escrever nada no canal)
//      POST /zapier/api/v4/implementations/needs/  — é o endpoint que a UI do
//      Zapier usa para desenhar o formulário da action. A resposta lista TODOS
//      os campos, inclusive os que o schema público do SDK não mostra (foi assim
//      que `send_as_bot` apareceu). Se existir um campo de nome/avatar de bot,
//      ele está aqui.
//
//   2. TENTATIVA (escreve no canal, uma mensagem por candidato)
//      Só roda com --testar. Envia `send_as_bot: true` acompanhado de nomes de
//      campo plausíveis (bot_name, username, ...). Como `inputs` é repassado
//      cru, um campo inexistente é ignorado em silêncio — então o veredito é
//      VISUAL, no canal, exatamente como na contraprova.
//
// ARMADILHA JÁ CONHECIDA NESTE PROJETO: 200 não prova que um campo FEZ algo.
// Foi o caso do `followers` no ClickUp (201 sem notificar ninguém). Por isso a
// etapa 2 termina mandando você olhar o canal, e não celebrando o HTTP.
// =============================================================================

const TOKEN_URL = "https://zapier.com/oauth/token/";
const BASE = "https://sdkapi.zapier.com/api/v0/sdk/zapier";
const NEEDS_URL = `${BASE}/api/v4/implementations/needs/`;
const RUNS_URL = `${BASE}/api/actions/v1/runs`;

const SELECTED_API = process.env.ZAPIER_SELECTED_API || "ClickUpCLIAPI@2.1.63";
const ACTION_KEY = process.env.ZAPIER_ACTION_KEY || "createChatMessage";
const ACTION_TYPE = process.env.ZAPIER_ACTION_TYPE || "write";
const CONNECTION_ID =
  process.env.ZAPIER_CONNECTION_ID || "02c96d4d-1deb-877a-892a-544525ce469f";
const TEAM_ID = Number(process.env.ZAPIER_TEAM_ID || "9011600909");
const VIEW_ID = process.env.ZAPIER_VIEW_ID || "8cj47gd-16871";

/**
 * Nomes de campo plausíveis para renomear o bot.
 *
 * Não são chutes soltos: são as convenções usadas por Slack (`username`,
 * `icon_emoji`), Discord (`username`, `avatar_url`) e Mattermost (`bot_name`) —
 * as três plataformas cujo webhook de bot o ClickUp imita. Se o conector aceitar
 * algum, será um destes.
 */
const CANDIDATOS = [
  { bot_name: "Robô de Avisos Corporativos" },
  { username: "Robô de Avisos Corporativos" },
  { bot_username: "Robô de Avisos Corporativos" },
  { sender_name: "Robô de Avisos Corporativos" },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

const j = (v) => JSON.stringify(v, null, 2);

/** Mesmo critério do SDK (getAuthorizationHeader): 3 segmentos base64url = JWT. */
function isJwtLike(token) {
  const p = token.split(".");
  return p.length === 3 && p.every((x) => x.length > 0 && /^[A-Za-z0-9_-]+$/.test(x));
}

async function lerCorpo(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 800) };
  }
}

async function obterToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: required("ZAPIER_CLIENT_ID"),
    client_secret: required("ZAPIER_CLIENT_SECRET"),
    scope: process.env.ZAPIER_SCOPE || "external",
    audience: process.env.ZAPIER_AUDIENCE || "zapier.com",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await lerCorpo(res);
  if (!res.ok || !payload.access_token) {
    throw new Error(`Token falhou (HTTP ${res.status}):\n${j(payload)}`);
  }
  return payload.access_token;
}

function headers(token) {
  return {
    Authorization: `${isJwtLike(token) ? "JWT" : "Bearer"} ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "zapier-sdk-version": "0.107.0",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 1 — inventário
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Este endpoint NÃO usa o envelope `data` (o de runs usa). O corpo é plano, e as
 * chaves têm outros nomes: `action` em vez de `action_key`, `type_of` em vez de
 * `action_type`, `params` em vez de `inputs`. Trocar isso dá erro obscuro.
 */
async function inventariar(token) {
  const corpo = {
    selected_api: SELECTED_API,
    action: ACTION_KEY,
    type_of: ACTION_TYPE,
    authentication_id: CONNECTION_ID,
    // O formulário do Zapier é dinâmico: alguns campos só aparecem depois que
    // o canal está escolhido. Mandar o que já sabemos revela o formulário
    // completo em vez do inicial.
    params: { team_id: TEAM_ID, view_id: VIEW_ID },
  };

  console.log("=== ETAPA 1 — CAMPOS REAIS DA ACTION ===");
  console.log(`POST ${NEEDS_URL}\n`);

  const res = await fetch(NEEDS_URL, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(corpo),
  });

  const payload = await lerCorpo(res);

  if (!res.ok) {
    console.log(`HTTP ${res.status}`);
    console.log(j(payload));
    throw new Error("Não foi possível listar os campos da action.");
  }

  // A forma da resposta varia entre versões; procuramos qualquer objeto que
  // pareça um campo de formulário, em vez de assumir um caminho fixo.
  const campos = [];
  (function varrer(node) {
    if (Array.isArray(node)) return node.forEach(varrer);
    if (!node || typeof node !== "object") return;
    if (typeof node.key === "string" && (node.type || node.label || node.title)) {
      campos.push({
        key: node.key,
        label: node.label ?? node.title ?? "",
        type: node.type ?? "",
        required: node.required ?? false,
      });
    }
    Object.values(node).forEach(varrer);
  })(payload);

  const vistos = new Set();
  const unicos = campos.filter((c) => !vistos.has(c.key) && vistos.add(c.key));

  if (unicos.length === 0) {
    console.log("Nenhum campo reconhecido na resposta. Corpo cru abaixo:\n");
    console.log(j(payload).slice(0, 3000));
    return [];
  }

  console.log(`${unicos.length} campo(s):\n`);
  for (const c of unicos) {
    const req = c.required ? " (obrigatório)" : "";
    console.log(`  ${c.key.padEnd(28)} ${c.type.padEnd(10)} ${c.label}${req}`);
  }

  // A pergunta do usuário, respondida diretamente.
  const suspeitos = unicos.filter((c) =>
    /bot|name|user|avatar|icon|sender|display/i.test(`${c.key} ${c.label}`),
  );

  console.log("\n--- campos que poderiam nomear o bot ---");
  if (suspeitos.length === 0) {
    console.log("NENHUM. A action não expõe nome/avatar de bot.");
  } else {
    for (const c of suspeitos) console.log(`  ${c.key} — ${c.label} (${c.type})`);
  }

  return unicos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 2 — tentativa (opcional, escreve no canal)
// ─────────────────────────────────────────────────────────────────────────────

async function enviar(token, extra, rotulo) {
  const corpo = {
    data: {
      selected_api: SELECTED_API,
      action_key: ACTION_KEY,
      action_type: ACTION_TYPE,
      authentication_id: CONNECTION_ID,
      inputs: {
        team_id: TEAM_ID,
        view_id: VIEW_ID,
        comment_type: "message",
        comment_text: `TESTE DE NOME — ${rotulo}`,
        send_as_bot: true,
        ...extra,
      },
    },
  };

  const res = await fetch(RUNS_URL, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(corpo),
  });

  const payload = await lerCorpo(res);
  const runId = payload?.data?.id;

  if (!res.ok || !runId) {
    console.log(`  ${rotulo}: HTTP ${res.status} — ${j(payload).slice(0, 200)}`);
    return;
  }

  // Polling curto: o run leva ~1s. Não vale reimplementar o timeout de 180s
  // aqui — se demorar mais que isto, o interessante já é o próprio atraso.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const p = await fetch(`${RUNS_URL}/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: headers(token),
    });
    const corpoPoll = await lerCorpo(p);
    const status = corpoPoll?.data?.status;
    if (p.status !== 202 && status !== "waiting") {
      const erros = corpoPoll?.data?.errors ?? [];
      console.log(
        erros.length > 0
          ? `  ${rotulo}: ERRO — ${erros.map((e) => e.detail || e.title).join("; ")}`
          : `  ${rotulo}: enviado (status ${status})`,
      );
      return;
    }
  }
  console.log(`  ${rotulo}: timeout no polling`);
}

async function tentarNomes(token) {
  console.log("\n=== ETAPA 2 — TENTATIVA DE RENOMEAR ===");
  console.log("Cada linha manda UMA mensagem no canal.\n");

  for (const extra of CANDIDATOS) {
    const chave = Object.keys(extra)[0];
    await enviar(token, extra, chave);
  }

  console.log("\n--- VEREDITO ---");
  console.log("Abra o canal e olhe o AUTOR de cada mensagem 'TESTE DE NOME — ...'.");
  console.log("");
  console.log("Se TODAS continuarem 'ClickBot', o nome não é parametrizável por");
  console.log("este caminho: campo desconhecido em `inputs` é ignorado calado.");
  console.log("Um HTTP 'enviado' acima NÃO significa que o campo funcionou.");
}

async function main() {
  const token = await obterToken();
  await inventariar(token);

  if (process.argv.includes("--testar")) {
    await tentarNomes(token);
  } else {
    console.log("\n(Para tentar renomear de fato — escreve no canal — rode com --testar)");
  }
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
