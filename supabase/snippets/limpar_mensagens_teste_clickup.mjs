#!/usr/bin/env node
// =============================================================================
// Apagar as mensagens de TESTE deixadas no canal tecnologia-dev
// =============================================================================
// Descartável: some junto com o testar_mention_clickup.mjs quando a limpeza
// estiver feita.
//
// O QUE APAGA: só mensagens cujo texto casa com os padrões de teste desta
// investigação — "[teste-mention...]" e os avisos de glosa do paciente fictício.
// NÃO varre o canal, NÃO apaga por data, NÃO apaga o que não reconhece.
//
// POR QUE ESSA TRAVA: o canal tem conversa de gente. Um script de limpeza que
// decide sozinho o que é lixo apaga trabalho alheio, e mensagem apagada não
// volta. Por isso o padrão de casamento é literal, o alvo é UM canal, e nada
// acontece sem --apagar.
//
// COMO RODAR — SEMPRE em duas etapas:
//
//   1) Ver o que SERIA apagado (não apaga nada):
//        $env:CLICKUP_TOKEN="pk_..."
//        node supabase/snippets/limpar_mensagens_teste_clickup.mjs
//
//   2) Conferir a lista e, só então, apagar:
//        node supabase/snippets/limpar_mensagens_teste_clickup.mjs --apagar
//
// DELETE /api/v3/workspaces/{ws}/chat/messages/{id} -> 204 (doc oficial).
// =============================================================================

const TOKEN = process.env.CLICKUP_TOKEN;
const WORKSPACE = process.env.CLICKUP_WORKSPACE ?? "9011600909";
const CANAL = process.env.CLICKUP_CHANNEL ?? "8cj47gd-16871"; // tecnologia-dev
const APAGAR = process.argv.includes("--apagar");

if (!TOKEN) {
  console.error("CLICKUP_TOKEN não definido. Veja o cabeçalho deste arquivo.");
  process.exit(1);
}

const BASE = "https://api.clickup.com/api/v3";
const cabecalhos = { Authorization: TOKEN, "Content-Type": "application/json" };

/**
 * O que conta como mensagem de teste. Literal de propósito: cada padrão
 * corresponde a algo que ESTA investigação criou, e nada mais.
 */
const PADROES = [
  /\[teste-mention/i,                    // as sondas de sintaxe de menção
  /\[TESTE\]\s*Paciente Ficticio/i,      // o aviso de glosa fabricado
  /Solicitado por Teste Manual/i,        // idem, pelo rodapé
];

const ehTeste = (texto) => PADROES.some((p) => p.test(texto ?? ""));

// ── Ler o canal, paginando ───────────────────────────────────────────────────
const mensagens = [];
let cursor = null;

do {
  const url = new URL(`${BASE}/workspaces/${WORKSPACE}/chat/channels/${CANAL}/messages`);
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, { headers: cabecalhos });
  const texto = await res.text();

  if (!res.ok) {
    console.error(`GET messages -> ${res.status}: ${texto.slice(0, 400)}`);
    process.exit(1);
  }

  const corpo = JSON.parse(texto);
  mensagens.push(...(corpo?.data ?? []));
  cursor = corpo?.next_cursor || null;
} while (cursor);

console.log(`canal ${CANAL}: ${mensagens.length} mensagens lidas\n`);

const alvos = mensagens.filter((m) => ehTeste(m?.content));

if (alvos.length === 0) {
  console.log("Nada a apagar — nenhuma mensagem casa com os padrões de teste.");
  process.exit(0);
}

console.log(`${alvos.length} mensagem(ns) de teste:\n`);
for (const m of alvos) {
  const trecho = String(m.content ?? "").replace(/\s+/g, " ").slice(0, 70);
  console.log(`  ${m.id}  ${trecho}`);
}

if (!APAGAR) {
  console.log(
    `\n${"─".repeat(70)}\n` +
    "SIMULAÇÃO — nada foi apagado. Confira a lista acima; se estiver certa:\n" +
    "  node supabase/snippets/limpar_mensagens_teste_clickup.mjs --apagar\n" +
    "Mensagem apagada no ClickUp não volta.",
  );
  process.exit(0);
}

console.log(`\n${"─".repeat(70)}\napagando...\n`);

let apagadas = 0;
const erros = [];

for (const m of alvos) {
  const res = await fetch(`${BASE}/workspaces/${WORKSPACE}/chat/messages/${m.id}`, {
    method: "DELETE",
    headers: cabecalhos,
  });

  if (res.status === 204 || res.ok) {
    apagadas++;
    console.log(`  ✓ ${m.id}`);
  } else {
    const detalhe = (await res.text()).slice(0, 200);
    erros.push(`${m.id}: ${res.status} ${detalhe}`);
    console.log(`  ✗ ${m.id} -> ${res.status} ${detalhe}`);
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`apagadas: ${apagadas} de ${alvos.length}`);
if (erros.length) {
  console.log(`\nfalhas (o ClickUp pode não deixar apagar mensagem de outro autor):`);
  for (const e of erros) console.log(`  ${e}`);
}
