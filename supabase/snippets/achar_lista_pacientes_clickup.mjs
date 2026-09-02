#!/usr/bin/env node
// =============================================================================
// Achar o list_id real da lista PACIENTES
// =============================================================================
// SOMENTE LEITURA. Não cria, não altera, não apaga nada.
//
// POR QUE ESTE SCRIPT EXISTE
//
// A URL do formulário é forms.clickup.com/9011600909/f/8cj47gd-10171/NS6NIG...
// e a suposição natural — que `8cj47gd-10171` fosse o list_id — está ERRADA. A
// API responde:
//
//     400 {"err":"validateListIDEx List ID invalid","ECODE":"INPUT_003"}
//
// 400 e não 404: o ClickUp nem chegou a procurar, recusou o FORMATO. List id na
// v2 é numérico (ex.: 901234567); `8cj47gd-10171` é o slug público do
// formulário, que é outro objeto. O slug NÃO é conversível em list_id por
// manipulação de string — só navegando a hierarquia.
//
// Então este script varre spaces -> folders -> lists do workspace e mostra tudo,
// destacando o que parece ser a lista de pacientes. Com o list_id em mãos, o
// descobrir_campos_lista_pacientes.mjs passa a funcionar.
//
// COMO RODAR (o token NÃO fica em arquivo — este repositório é público):
//
//   PowerShell:
//     $env:CLICKUP_TOKEN="pk_..."
//     node supabase/snippets/achar_lista_pacientes_clickup.mjs
//
//   bash:
//     CLICKUP_TOKEN=pk_... node supabase/snippets/achar_lista_pacientes_clickup.mjs
//
// O token é o mesmo que já serve glosa e healthcheck (secret CLICKUP_TOKEN das
// Edge Functions). Token pessoal vai CRU no header, sem "Bearer".
// =============================================================================

const TOKEN = process.env.CLICKUP_TOKEN;
const WORKSPACE = process.env.CLICKUP_WORKSPACE ?? "9011600909";

if (!TOKEN) {
  console.error("❌ Defina CLICKUP_TOKEN no ambiente antes de rodar (ver cabeçalho).");
  process.exit(1);
}

const API = "https://api.clickup.com/api/v2";

async function get(caminho) {
  const res = await fetch(`${API}${caminho}`, { headers: { Authorization: TOKEN } });
  const texto = await res.text();
  if (!res.ok) throw new Error(`GET ${caminho} -> ${res.status}: ${texto.slice(0, 300)}`);
  return JSON.parse(texto);
}

/** Erro de permissão numa parte da árvore não pode abortar a varredura inteira. */
async function tentar(caminho, chave) {
  try {
    const r = await get(caminho);
    return r[chave] ?? [];
  } catch (e) {
    console.log(`   (${caminho} não lido: ${e.message.slice(0, 120)})`);
    return [];
  }
}

const achados = [];

/** Marca o que merece atenção — a decisão final é de quem lê, não do script. */
function interessante(nome) {
  return /paciente/i.test(nome);
}

function registrar(lista, caminho) {
  achados.push({ id: lista.id, nome: lista.name, caminho });
  const marca = interessante(lista.name) ? " ⬅️  CANDIDATA" : "";
  console.log(`      • ${String(lista.name).padEnd(34)} id=${lista.id}${marca}`);
}

(async () => {
  console.log(`Workspace: ${WORKSPACE}\n`);

  // Confirma que o token enxerga este workspace antes de varrer.
  try {
    const { teams = [] } = await get("/team");
    const t = teams.find((x) => String(x.id) === String(WORKSPACE));
    console.log(t ? `✅ Token vê o workspace: "${t.name}"` : `⚠️  O token NÃO vê o workspace ${WORKSPACE}.`);
    if (!t) {
      console.log("   Workspaces visíveis para este token:");
      for (const x of teams) console.log(`     • ${x.name} (id=${x.id})`);
    }
  } catch (e) {
    console.error(`⛔ ${e.message}`);
    process.exit(1);
  }

  const spaces = await tentar(`/team/${WORKSPACE}/space?archived=false`, "spaces");
  console.log(`\n${spaces.length} space(s)\n`);

  for (const space of spaces) {
    console.log(`── space: ${space.name}  (id=${space.id})`);

    // Listas soltas no space (sem folder). É onde uma lista operacional costuma
    // ficar, então NÃO dá para varrer só folders.
    const soltas = await tentar(`/space/${space.id}/list?archived=false`, "lists");
    if (soltas.length) {
      console.log("   (listas sem pasta)");
      for (const l of soltas) registrar(l, `${space.name}`);
    }

    const folders = await tentar(`/space/${space.id}/folder?archived=false`, "folders");
    for (const folder of folders) {
      console.log(`   pasta: ${folder.name}`);
      // O folder já vem com suas lists embutidas; só busca de novo se vier vazio.
      const lists = folder.lists?.length
        ? folder.lists
        : await tentar(`/folder/${folder.id}/list?archived=false`, "lists");
      for (const l of lists) registrar(l, `${space.name} / ${folder.name}`);
    }
    console.log("");
  }

  const candidatas = achados.filter((a) => interessante(a.nome));

  console.log("═".repeat(70));
  if (candidatas.length === 0) {
    console.log(`Nenhuma lista com "paciente" no nome, entre ${achados.length} lista(s).`);
    console.log("A lista do formulário pode ter outro nome — procure na listagem acima.");
  } else {
    console.log("CANDIDATAS:\n");
    for (const c of candidatas) {
      console.log(`  ${c.nome}`);
      console.log(`    list_id : ${c.id}`);
      console.log(`    onde    : ${c.caminho}`);
      console.log("");
    }
    console.log("Para confirmar QUAL delas é a do formulário, rode em cada uma:");
    console.log("");
    for (const c of candidatas) {
      console.log(`  $env:CLICKUP_LIST_ID="${c.id}"; node supabase/snippets/descobrir_campos_lista_pacientes.mjs`);
    }
    console.log("");
    console.log("A certa é a que tiver uma form view cujo public_url termina em");
    console.log("NS6NIG90F6VS01DDQQ — aquele script imprime as form views da lista.");
  }
  console.log("═".repeat(70));
})().catch((e) => {
  console.error("\n⛔", e.message);
  process.exit(1);
});
