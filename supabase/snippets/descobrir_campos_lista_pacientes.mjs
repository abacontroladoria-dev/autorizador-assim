#!/usr/bin/env node
// =============================================================================
// Os UUIDs dos campos da lista PACIENTES (o "passo zero" da automação)
// =============================================================================
// SOMENTE LEITURA. Não cria, não altera e não apaga nada — nem no ClickUp, nem
// no banco. Pode rodar quantas vezes quiser.
//
// POR QUE ESTE SCRIPT EXISTE
//
// O terapêutico que inclui uma terapia nova precisa, hoje, preencher à mão o
// "Formulário de Pacientes" no ClickUp para avisar o cronograma. Esquecer é
// possível — e em 09/2026 um esquecimento virou glosa. A automação vai criar a
// task direto pela API, no ato da implantação.
//
// Só que a API de criação exige o **UUID** de cada campo e, nos dropdowns, o
// UUID da OPÇÃO escolhida — não o texto dela. E não existe endpoint que leia a
// definição de um formulário: GET /list/{id}/view devolve a form view, mas só
// metadados (id, nome, public_url), nenhuma pergunta. Então os UUIDs só saem
// pelo endpoint de custom fields da LISTA, que é o que este script lê.
//
// O QUE ELE IMPRIME
//
//   1. Os campos da lista, com id, tipo e obrigatoriedade.
//   2. Para cada dropdown/label, TODAS as opções com seus UUIDs.
//   3. Um bloco JSON no fim, pronto para virar o de-para da config.
//
// COMO RODAR (o token NÃO fica em arquivo — este repositório é público):
//
//   PowerShell:
//     $env:CLICKUP_TOKEN="pk_..."
//     node supabase/snippets/descobrir_campos_lista_pacientes.mjs
//
//   bash:
//     CLICKUP_TOKEN=pk_... node supabase/snippets/descobrir_campos_lista_pacientes.mjs
//
// O token é o MESMO que já serve a glosa e o healthcheck (secret CLICKUP_TOKEN
// das Edge Functions). Token pessoal vai CRU no header Authorization, sem
// "Bearer" — isso vale só para token pessoal, não para OAuth.
// =============================================================================

const TOKEN = process.env.CLICKUP_TOKEN;

// O LIST_ID É OBRIGATÓRIO, e não sai da URL do formulário.
//
// Testado em 2026-09-02: usar `8cj47gd-10171` (o trecho do meio de
// forms.clickup.com/9011600909/f/8cj47gd-10171/NS6NIG90F6VS01DDQQ) devolve
//
//     400 {"err":"validateListIDEx List ID invalid","ECODE":"INPUT_003"}
//
// 400, não 404 — o ClickUp recusou o FORMATO antes de procurar. List id na v2 é
// numérico (ex.: 901234567); aquele trecho é o slug público do formulário, um
// objeto diferente, e nenhuma manipulação de string o converte.
//
// Para descobrir o id de verdade, rode antes:
//     node supabase/snippets/achar_lista_pacientes_clickup.mjs
const LIST_ID = process.env.CLICKUP_LIST_ID;

if (!TOKEN) {
  console.error("❌ Defina CLICKUP_TOKEN no ambiente antes de rodar (ver cabeçalho).");
  process.exit(1);
}

if (!LIST_ID) {
  console.error("❌ Defina CLICKUP_LIST_ID (numérico) no ambiente.");
  console.error("   O id da URL do formulário NÃO serve — ver o comentário acima.");
  console.error("   Para achá-lo:  node supabase/snippets/achar_lista_pacientes_clickup.mjs");
  process.exit(1);
}

const API = "https://api.clickup.com/api/v2";

async function get(caminho) {
  const res = await fetch(`${API}${caminho}`, {
    headers: { Authorization: TOKEN },
  });
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${caminho} -> ${res.status}: ${texto.slice(0, 400)}`);
  }
  return JSON.parse(texto);
}

/** Tipos que têm opções em type_config.options e por isso exigem UUID no envio. */
const TIPOS_COM_OPCOES = new Set(["drop_down", "labels"]);

function imprimirCampo(campo) {
  const obrigatorio = campo.required ? " (OBRIGATÓRIO)" : "";
  console.log(`\n── ${campo.name}${obrigatorio}`);
  console.log(`   tipo : ${campo.type}`);
  console.log(`   id   : ${campo.id}`);

  if (!TIPOS_COM_OPCOES.has(campo.type)) return;

  const opcoes = campo.type_config?.options ?? [];
  if (opcoes.length === 0) {
    console.log("   opções: (nenhuma)");
    return;
  }
  console.log("   opções:");
  for (const o of opcoes) {
    // `name` para drop_down; `label` para labels — a API usa chaves diferentes.
    const rotulo = o.name ?? o.label ?? "(sem rótulo)";
    console.log(`     • ${rotulo.padEnd(28)} ${o.id}`);
  }
}

/**
 * Esboço do de-para para a config. Só monta o esqueleto com os campos que a
 * automação precisa preencher — o casamento valor-do-Pulsar -> UUID continua
 * sendo decisão humana, porque depende de saber que "Convencional Convênio" é o
 * default de quem não é judicial, etc.
 */
function esbocarDePara(campos) {
  const porNome = new Map(campos.map((c) => [c.name.trim().toLowerCase(), c]));
  const querido = [
    "origem da solicitação",
    "convênio",
    "tipo de autorização",
    "motivo",
    "unidade",
    "paciente",
    "descreva a solicitação:",
    "solicitante",
    "data de início da vigência",
  ];

  const mapa = {};
  for (const nome of querido) {
    const campo = porNome.get(nome);
    if (!campo) {
      mapa[nome] = "⚠️ CAMPO NÃO ENCONTRADO NA LISTA";
      continue;
    }
    const entrada = { field_id: campo.id, type: campo.type };
    if (TIPOS_COM_OPCOES.has(campo.type)) {
      entrada.opcoes = Object.fromEntries(
        (campo.type_config?.options ?? []).map((o) => [o.name ?? o.label, o.id]),
      );
    }
    mapa[nome] = entrada;
  }
  return mapa;
}

(async () => {
  console.log(`Lista: ${LIST_ID}\n`);

  // A lista em si — confirma que o id é de uma lista e mostra o nome, que é como
  // se verifica de olho que se está mexendo em PACIENTES e não em outra.
  try {
    const lista = await get(`/list/${LIST_ID}`);
    console.log(`✅ Lista encontrada: "${lista.name}"`);
    if (lista.space?.name) console.log(`   space: ${lista.space.name}`);
    if (lista.folder?.name) console.log(`   folder: ${lista.folder.name}`);
  } catch (e) {
    console.error(`⚠️  Não foi possível ler a lista: ${e.message}`);
    console.error("");
    console.error("   400 (INPUT_003, 'List ID invalid') = o id não tem forma de list id.");
    console.error("       É o que acontece com o slug da URL do formulário. List id é");
    console.error("       numérico. Rode: node supabase/snippets/achar_lista_pacientes_clickup.mjs");
    console.error("   401 = o token não enxerga esta lista.");
    console.error("   404 = a forma é válida, mas essa lista não existe.");
    process.exit(1);
  }

  // As views, só para registrar qual é a form view (a doc confirma que não dá
  // para ler as PERGUNTAS dela, mas o public_url ajuda a conferir que é o mesmo
  // formulário que o time usa hoje).
  try {
    const { views = [] } = await get(`/list/${LIST_ID}/view`);
    const forms = views.filter((v) => v.type === "form");
    if (forms.length) {
      console.log("\n── Form views desta lista (só metadados; a API não expõe as perguntas)");
      for (const f of forms) {
        console.log(`   • ${f.name}  id=${f.id}`);
        if (f.public_url) console.log(`     ${f.public_url}`);
      }
    }
  } catch (e) {
    console.log(`\n(views não lidas: ${e.message})`);
  }

  const { fields = [] } = await get(`/list/${LIST_ID}/field`);

  console.log(`\n═══ ${fields.length} custom fields ═══`);
  for (const campo of fields) imprimirCampo(campo);

  console.log("\n\n═══ Esboço do de-para (para a config da automação) ═══");
  console.log(JSON.stringify(esbocarDePara(fields), null, 2));

  console.log(`
─────────────────────────────────────────────────────────────────────────────
O que conferir neste resultado:

  1. O nome da lista é mesmo PACIENTES?
  2. Todo campo OBRIGATÓRIO tem origem no Pulsar? (ver o plano)
  3. As opções de "Unidade" incluem Realengo, Padre Miguel e Fazendinha com
     ESSA grafia? São as três que o Pulsar conhece.
  4. As opções de "Convênio" batem com o convenio_nome da grade?
  5. "Tipo de Autorização" tem Liminar/Penhora/Acordo com a mesma grafia da
     coluna origem_judicial (migration 20260831120000)?
─────────────────────────────────────────────────────────────────────────────`);
})().catch((e) => {
  console.error("\n⛔", e.message);
  process.exit(1);
});
