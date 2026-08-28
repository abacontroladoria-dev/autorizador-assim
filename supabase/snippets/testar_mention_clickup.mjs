#!/usr/bin/env node
// =============================================================================
// A menção reconhecida pelo ClickUp NOTIFICA a pessoa mencionada?
// =============================================================================
// Teste isolado, descartável. NÃO toca no banco, na outbox nem na Edge Function
// — só conversa com o ClickUp.
//
// O QUE JÁ ESTÁ RESOLVIDO (2026-08-28, sete candidatos, cada um conferido em
// GET /v3/workspaces/{ws}/chat/messages/{id}/tagged_users):
//
//   @Nome (texto puro, controle) ......... vazio
//   followers: [ids] ..................... 201, vazio
//   clickup://user/{id} .................. vazio
//   [@Nome](clickup://user/{id}) ......... vazio
//   [@Nome](user:{id}) ................... vazio
//   [@Nome](#user_mention{id}) ........... vazio      <- sem o # final
//   [@Nome](#user_mention#{id}) .......... ✅ RECONHECEU
//   [Nome](#user_mention#{id}) ........... ✅ RECONHECEU (o @ do rótulo é enfeite)
//
// O `#` final é obrigatório. E o alvo precisa PERTENCER ao canal: com um id de
// fora, o app mostra "undefined não tem acesso a este canal".
//
// O QUE ESTA RODADA RESPONDE, e é a última pergunta que falta:
// reconhecimento não é notificação — nesta mesma API, `followers` foi aceito com
// 201 e não avisou ninguém. Falta ver alguém receber.
//
// POR QUE COM O ID DE OUTRA PESSOA: na rodada anterior quem enviava e quem era
// mencionado eram o MESMO usuário (o token é do Caio). Sistema nenhum costuma
// notificar auto-menção, então aquele teste não decidia nada sobre notificação.
// Com um terceiro, a pergunta fica limpa.
//
// COMO RODAR (o token NÃO fica em arquivo — vem da variável de ambiente):
//
//   PowerShell:
//     $env:CLICKUP_TOKEN="pk_..."
//     node supabase/snippets/testar_mention_clickup.mjs
//
//   bash:
//     CLICKUP_TOKEN=pk_... node supabase/snippets/testar_mention_clickup.mjs
//
// Manda UMA mensagem para o canal de teste (tecnologia-dev).
// =============================================================================

const TOKEN = process.env.CLICKUP_TOKEN;
const WORKSPACE = process.env.CLICKUP_WORKSPACE ?? "9011600909";
const CANAL = process.env.CLICKUP_CHANNEL ?? "8cj47gd-16871"; // tecnologia-dev

const ALVO = { id: "170668231", nome: "Sanderson Rodrigues de Souza" };

if (!TOKEN) {
  console.error("CLICKUP_TOKEN não definido. Veja o cabeçalho deste arquivo.");
  process.exit(1);
}

const BASE = "https://api.clickup.com/api/v3";
const cabecalhos = { Authorization: TOKEN, "Content-Type": "application/json" };

// A sintaxe vencedora, sozinha. O `#` final é o que a faz funcionar.
const conteudo =
  `[teste-mention] Teste de menção — ignore. ` +
  `[@${ALVO.nome}](#user_mention#${ALVO.id})`;

console.log(`canal:    ${CANAL}`);
console.log(`alvo:     ${ALVO.nome} (${ALVO.id})`);
console.log(`enviando: ${conteudo}\n`);

const resEnvio = await fetch(
  `${BASE}/workspaces/${WORKSPACE}/chat/channels/${CANAL}/messages`,
  {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({ type: "message", content: conteudo, content_format: "text/md" }),
  },
);

const textoEnvio = await resEnvio.text();
let corpoEnvio;
try { corpoEnvio = JSON.parse(textoEnvio); } catch { corpoEnvio = textoEnvio; }

console.log(`POST -> ${resEnvio.status}`);

if (resEnvio.status >= 300) {
  console.log(JSON.stringify(corpoEnvio, null, 2).slice(0, 800));
  process.exit(1);
}

const id = corpoEnvio?.data?.id ?? corpoEnvio?.id;
console.log(`message_id: ${id}\n`);

const resMarcados = await fetch(
  `${BASE}/workspaces/${WORKSPACE}/chat/messages/${id}/tagged_users?limit=100`,
  { headers: cabecalhos },
);
const textoMarcados = await resMarcados.text();
let corpoMarcados;
try { corpoMarcados = JSON.parse(textoMarcados); } catch { corpoMarcados = textoMarcados; }

console.log(`GET tagged_users -> ${resMarcados.status}`);
console.log(JSON.stringify(corpoMarcados));

const lista = corpoMarcados?.data ?? [];
const achou = Array.isArray(lista) && lista.some((u) => String(u?.id) === ALVO.id);

console.log("\n" + "═".repeat(70));

if (achou) {
  console.log(`✅ O ClickUp RECONHECEU ${ALVO.nome} como mencionado.`);
} else {
  // Mesma sintaxe que funcionou antes: se aqui não marcar, a diferença é o ALVO.
  // O caso conhecido é o id não pertencer ao canal — o app diz "undefined não tem
  // acesso a este canal" ao passar o mouse na mensagem.
  console.log(
    `❌ NÃO reconheceu. A sintaxe é a mesma que funcionou antes, então a\n` +
    `   diferença está no ALVO: confirme que ${ALVO.nome} é membro do canal\n` +
    `   ${CANAL}. Passe o mouse na mensagem — "undefined não tem acesso a este\n` +
    `   canal" confirma que é isso.`,
  );
}

console.log("═".repeat(70));
console.log(
  "\nAGORA A PERGUNTA QUE ESTE SCRIPT NÃO ALCANÇA, e é a que decide tudo:\n" +
  `  · ${ALVO.nome} RECEBEU notificação? (sino, push no celular, e-mail)\n` +
  "  · peça para ele conferir ANTES de abrir o canal — abrir marca como lido\n" +
  "  · no canal, o nome aparece como menção (destacado) e abre o perfil certo?\n" +
  "\nReconhecimento não é notificação: nesta mesma API, `followers` foi aceito\n" +
  "com 201 e não avisou ninguém.",
);
