// =============================================================================
// Inclusão de terapia -> card na lista PACIENTES do ClickUp
// =============================================================================
// Substitui um passo manual que dependia de memória: quando o terapêutico
// implanta uma terapia nova em /cronograma/ocupacao-paciente, ele precisava
// lembrar de abrir um formulário do ClickUp e preencher à mão para gerar o card
// que manda o setor de CRONOGRAMA fazer os trâmites junto ao convênio. Em
// 09/2026 alguém esqueceu e a sessão foi glosada.
//
// Agora a rota /api/tita/confirmar-agendamento deposita o fato em
// `inclusoes_terapia` no mesmo instante em que a TiTa aceita o agendamento, e
// esta função só entrega.
//
// Chamada pelo cron `inclusao-terapia-clickup` a cada 5 min em horário
// comercial, via fn_inclusoes_terapia_disparar — que só acorda a função quando
// há pendência. Invocável à mão para teste: responde 200 com um resumo em JSON,
// porque um curl que devolve "ok" não testa nada.
//
// ── O QUE ESTA FUNÇÃO FAZ DE DIFERENTE DAS IRMÃS ────────────────────────────
//
// CRIA TASK, não mensagem de chat. É a primeira integração deste repositório a
// fazê-lo (glosa-clickup e assim-healthcheck postam em canal de Chat v3). O
// motivo é o requisito: o cronograma FECHA o card quando termina os trâmites, e
// mensagem de chat não tem estado para fechar.
//
// Isso muda a API: criar task é `POST /api/v2/list/{list_id}/task` — v2, não v3
// (não existe endpoint v3 para criar task). A autenticação é a mesma: token
// pessoal CRU no header Authorization, sem "Bearer".
//
// ── QUATRO ARMADILHAS DA API, TODAS TRATADAS AQUI ───────────────────────────
//
//   1. CUSTOM FIELD ERRADO É DESCARTADO EM SILÊNCIO. Se o campo não se aplica ao
//      task type, o ClickUp responde 201 com o campo VAZIO. É o pior modo de
//      falha possível: parece sucesso. Por isso o de-para é fail-loud (ver
//      montarCustomFields) e a estreia deve reler a task criada.
//   2. `due_date` é Unix em MILISSEGUNDOS. Em segundos a task vai para 1970 sem
//      erro nenhum.
//   3. `drop_down` exige o UUID DA OPÇÃO, nunca o texto dela.
//   4. `markdown_content` SOBRESCREVE `description` quando os dois vêm. Só um.
//
// ── POR QUE O TEXTO É MONTADO AQUI E NÃO NO BANCO ───────────────────────────
// A outbox guarda os CAMPOS. Uma pendência que sobreviveu a uma falha do ClickUp
// é reenviada pela execução seguinte — se a frase estivesse gravada, ela
// chegaria escrita pela versão antiga do código. Mesma disciplina de
// glosa-clickup e assim-healthcheck.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLICKUP_TOKEN = Deno.env.get("CLICKUP_TOKEN");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Quantos cards uma execução entrega.
 *
 * O limite real é o rate limit do ClickUp: 100 req/min POR TOKEN nos planos até
 * Business — e este token é o MESMO que serve glosa e healthcheck, então os três
 * somam no mesmo balde. 15 por rodada de 5 min deixa folga larga e, se algo
 * encher a outbox por engano, a rodada seguinte continua em vez de despejar tudo
 * de uma vez na lista do setor.
 */
const LOTE_MAX = 15;

type SessaoIncluida = {
  csv_grade_id: string;
  terapia_nome: string | null;
  terapia_exibicao_id: number | null;
  profissional_nome: string | null;
  dia_semana: string | null;
  hora_inicial: string | null;
  data_inicial: string | null;
  sala_nome: string | null;
  criadas: number;
  conflitos: number;
};

type Inclusao = {
  id: number;
  bundle_id: string;
  paciente_nome: string;
  paciente_id: string | null;
  convenio_nome: string | null;
  unidade_nome: string | null;
  sessoes: SessaoIncluida[];
  sessoes_nao_criadas: number;
  data_inicial: string | null;
  implantado_por_nome: string | null;
  implantado_por_email: string | null;
  modalidade: string | null;
  tentativas: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Nome de exibição da terapia
// ─────────────────────────────────────────────────────────────────────────────
// O TiTa às vezes grava na sessão o nome da AÇÃO em vez do nome de exibição da
// terapia — "Aplicador ABA (PS)" onde a clínica diz "Psicologia ABA".
//
// ARMADILHA: esta lista NÃO é a mesma do CASE de `tuss_da_sessao()`. As duas
// respondem perguntas diferentes ("qual nome exibir" vs "qual TUSS") e
// confundi-las mudaria o TUSS de terapias que não são ABA. Espelha
// ABA_EXIB_PSICO_IDS de frontend/lib/cronograma/constants.ts e a cópia que
// glosa-clickup já mantém — se a regra mudar, as três mudam juntas.
const ABA_EXIB_PSICO_IDS = new Set([2269, 2317, 2262, 2261, 2248, 2353, 2263]);
const ABA_EXIB_NOME = "Psicologia ABA";

function nomeTerapia(terapia: string | null, exibicaoId: number | null): string {
  if (!terapia) return "(terapia não identificada)";
  if (exibicaoId == null || !ABA_EXIB_PSICO_IDS.has(exibicaoId)) return terapia;
  if (terapia.includes(ABA_EXIB_NOME)) return terapia;
  return `${ABA_EXIB_NOME} (${terapia})`;
}

/** `2026-09-07` -> `07/09/2026`, sem passar por Date (que erraria o fuso). */
function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** `13:20:00` -> `13:20`. */
function formatarHora(hora: string | null): string | null {
  if (!hora) return null;
  const m = String(hora).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Data em Unix MILISSEGUNDOS, à meia-noite UTC.
 *
 * Construída das partes da string, nunca `new Date(iso)` com fuso implícito. E
 * milissegundos, não segundos: com segundos o ClickUp põe a task em 1970 e não
 * reclama.
 */
function dataParaMs(iso: string | null): number | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// ─────────────────────────────────────────────────────────────────────────────
// O texto da solicitação — onde mora o sentido
// ─────────────────────────────────────────────────────────────────────────────
// O dropdown "Motivo" do formulário tem UMA opção só ("Alteração de
// Cronograma"), que serve igualmente a alta, desligamento, troca de profissional
// e inclusão. Ou seja: o campo estruturado NÃO diz o que aconteceu. Quem diz é
// este texto.
//
// Por isso ele abre declarando o fato em uma linha inequívoca, antes de
// qualquer detalhe — é o que o cronograma lê primeiro para saber o que fazer.

function montarDescricao(inc: Inclusao): string {
  const linhas: string[] = [];

  linhas.push("**Inclusão de atendimento** — implantada no Pulsar e já criada na agenda.");
  linhas.push("");
  linhas.push("Sessões incluídas (série semanal recorrente):");
  linhas.push("");

  for (const s of inc.sessoes) {
    const partes = [
      nomeTerapia(s.terapia_nome, s.terapia_exibicao_id),
      s.profissional_nome ?? "(profissional não identificado)",
      [s.dia_semana, formatarHora(s.hora_inicial)].filter(Boolean).join(" "),
    ].filter(Boolean);

    let linha = `- ${partes.join(" · ")}`;
    const inicio = formatarData(s.data_inicial);
    if (inicio) linha += ` — a partir de ${inicio}`;
    if (s.sala_nome) linha += ` (${s.sala_nome})`;
    linhas.push(linha);
  }

  // Implantação parcial: dizer explicitamente. Sem isto o cronograma poderia
  // fazer trâmite para horário que não chegou a existir.
  if (inc.sessoes_nao_criadas > 0) {
    linhas.push("");
    linhas.push(
      `> ⚠️ ${inc.sessoes_nao_criadas} ${
        inc.sessoes_nao_criadas === 1 ? "horário não pôde ser implantado" : "horários não puderam ser implantados"
      } porque já ${inc.sessoes_nao_criadas === 1 ? "estava ocupado" : "estavam ocupados"}. ${
        inc.sessoes_nao_criadas === 1 ? "Ele não está" : "Eles não estão"
      } na lista acima.`,
    );
  }

  // Conflito DENTRO de uma série aceita é outra coisa, e precisa de frase
  // própria: o horário foi implantado, mas algumas ocorrências semanais até
  // 31/12 caíram sobre datas já ocupadas. O agendamento existe; o que não existe
  // é a recorrência completa. Sem distinguir isso, o cronograma faria trâmite
  // achando que a agenda está cheia quando tem buraco no meio.
  const comConflito = inc.sessoes.filter((s) => (s.conflitos ?? 0) > 0);
  if (comConflito.length > 0) {
    const total = comConflito.reduce((acc, s) => acc + (s.conflitos ?? 0), 0);
    linhas.push("");
    linhas.push(
      `> ℹ️ ${total} ${
        total === 1 ? "ocorrência semanal" : "ocorrências semanais"
      } dentro da série acima já ${total === 1 ? "estava ocupada" : "estavam ocupadas"} e não ${
        total === 1 ? "foi criada" : "foram criadas"
      }. O horário está implantado; a recorrência tem falhas.`,
    );
  }

  linhas.push("");
  const contexto: string[] = [];
  if (inc.convenio_nome) contexto.push(`**Convênio** · ${inc.convenio_nome}`);
  if (inc.unidade_nome) contexto.push(`**Unidade** · ${inc.unidade_nome}`);
  if (contexto.length) linhas.push(contexto.join("  ·  "));

  if (inc.implantado_por_nome || inc.implantado_por_email) {
    linhas.push("");
    linhas.push(`_Implantado por ${inc.implantado_por_nome ?? inc.implantado_por_email}_`);
  }

  linhas.push("");
  linhas.push("_Card criado automaticamente pelo Pulsar no ato da implantação._");

  return linhas.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Os custom fields — e por que o de-para falha alto
// ─────────────────────────────────────────────────────────────────────────────

type CampoConfig = {
  field_id?: string;
  /** Para dropdown de valor fixo (Origem da Solicitação, Motivo). */
  valor?: string;
  /** Para dropdown que depende do dado (Convênio, Tipo de Autorização). */
  opcoes?: Record<string, string>;
  /**
   * Para dropdown casado por PREFIXO em vez de igualdade — hoje só a Unidade.
   *
   * ACHADO DE 2026-09-02, medido em 53.692 linhas: `unidade_nome` da grade tem UM
   * único valor, "CLÍNICA UNIVERSO ABA", em 100% das linhas. Quem distingue
   * unidade é `sala_nome`, no padrão "Unid. <Unidade> - <resto>". Casar por
   * igualdade contra unidade_nome falharia SEMPRE.
   */
  prefixos?: Record<string, string>;
};

class DeParaAusente extends Error {}

/**
 * Resolve o UUID da opção de um dropdown.
 *
 * LANÇA quando o valor do Pulsar não tem opção correspondente — e isso é
 * deliberado. A alternativa seria omitir o campo, e aí o ClickUp criaria a task
 * com 201 e o campo vazio: um card silenciosamente incompleto, que é
 * exatamente o modo de falha que esta função existe para evitar. Falhando, a
 * linha fica pendente com `ultimo_erro` preenchido e alguém conserta o de-para
 * com um UPDATE (ver o snippet de config).
 */
function opcaoObrigatoria(campo: CampoConfig | undefined, valor: string | null, rotulo: string): string {
  if (!campo?.field_id) throw new DeParaAusente(`campo "${rotulo}" não configurado em inclusoes_terapia_config.campos`);
  if (campo.valor) return campo.valor;

  if (!valor) throw new DeParaAusente(`sem valor de "${rotulo}" na linha para casar com o dropdown`);

  const opcoes = campo.opcoes ?? {};
  const achado = opcoes[valor]
    // Tolerância só a caixa e espaço em volta — não a grafia. "Realengo" e
    // "realengo " são o mesmo lugar; "Real Saúde" e "Realengo" não são, e casar
    // por aproximação criaria card na unidade errada.
    ?? Object.entries(opcoes).find(([k]) => k.trim().toLowerCase() === valor.trim().toLowerCase())?.[1];

  if (!achado) {
    throw new DeParaAusente(`"${valor}" não tem opção correspondente em "${rotulo}" (de-para desatualizado?)`);
  }
  return achado;
}

/**
 * Resolve a Unidade pelo PREFIXO de `sala_nome` das sessões — ver o comentário de
 * `prefixos` em CampoConfig para o motivo de não vir de `unidade_nome`.
 *
 * Devolve null quando nenhuma sala casa, e aqui isso NÃO é erro: as salas sem
 * prefixo "Unid." que sobram na grade são FUNÇÃO, não lugar ("Apoio
 * Operacional", "Especialista Técnico de Área" — 1.699 linhas em 30 dias). Não
 * existe unidade a declarar, então o campo fica vazio em vez de travar a linha.
 * Um prefixo novo e genuinamente desconhecido também cai aqui: o card sai sem
 * unidade, visível, em vez de não sair.
 *
 * Usa a PRIMEIRA sala que casa. Um bundle é de um paciente num ato só; sessões em
 * unidades diferentes seriam anomalia, e escolher a primeira é melhor que somar
 * duas unidades num dropdown de valor único.
 */
function unidadePorSala(campo: CampoConfig | undefined, sessoes: SessaoIncluida[]): string | null {
  const prefixos = campo?.prefixos;
  if (!campo?.field_id || !prefixos) return null;

  for (const s of sessoes) {
    const sala = (s.sala_nome ?? "").trim();
    if (!sala) continue;
    for (const [prefixo, uuid] of Object.entries(prefixos)) {
      if (sala.toLowerCase().startsWith(prefixo.trim().toLowerCase())) return uuid;
    }
  }
  return null;
}

/**
 * A sala pede que esta inclusão NÃO gere card?
 *
 * Decisão do usuário (2026-09-02) para "Sala Teste": implantação de teste não
 * pode mandar o cronograma abrir trâmite junto ao convênio para algo irreal.
 * Casado por prefixo, como a unidade. Basta UMA sessão em sala de teste para o
 * bundle inteiro ser dispensado — um bundle misto é sinal de teste, não de
 * inclusão real.
 */
function salaDispensaCard(campos: Record<string, unknown>, sessoes: SessaoIncluida[]): string | null {
  const lista = campos["salas_sem_card"];
  if (!Array.isArray(lista) || lista.length === 0) return null;

  for (const s of sessoes) {
    const sala = (s.sala_nome ?? "").trim().toLowerCase();
    if (!sala) continue;
    for (const bruto of lista) {
      const prefixo = String(bruto).trim().toLowerCase();
      if (prefixo && sala.startsWith(prefixo)) return String(bruto);
    }
  }
  return null;
}

/**
 * Tipo de Autorização, derivado do que o Pulsar já sabe.
 *
 * Três das seis opções do formulário — Liminar, Penhora, Acordo — são
 * exatamente a coluna `origem_judicial` de
 * cadastros_pacientes_altas_individualidades (migration 20260831120000), com a
 * mesma grafia. Quando ela está preenchida, é a resposta.
 *
 * NULL é o padrão dessa coluna e significa "não informado" — a maioria dos
 * pacientes não é judicial. Nesse caso a natureza vem do convênio.
 *
 * "Parceria" não é produzida aqui: não existe dado no banco que a determine
 * (grep não acha o termo no repositório). Os poucos casos são ajustados à mão no
 * card, o que é honesto — melhor um campo ajustável que um chute.
 */
function tipoAutorizacao(origemJudicial: string | null, convenio: string | null): string {
  if (origemJudicial) return origemJudicial;
  const c = (convenio ?? "").trim().toLowerCase();
  if (!c || c.includes("particular")) return "Particular";
  return "Convencional Convênio";
}

/**
 * A origem judicial do paciente, se registrada.
 *
 * DUAS CHAVES DE PACIENTE, E CONFUNDI-LAS NÃO DÁ ERRO — DÁ DADO ERRADO.
 * `inclusoes_terapia.paciente_id` é o id_favorecido do TiTa. A tabela de
 * individualidades usa `id_paciente_pulsar`, que aponta para
 * `pacientes.id_paciente` — outro número, também bigint. Ler uma pela outra
 * devolveria a origem judicial de OUTRO paciente, silenciosamente. A ponte é
 * `pacientes.tita_paciente_id`, que é único e é a chave estável vinda do TiTa
 * (migration 20260817190000). O alerta é literal no cabeçalho de 20260826140400.
 *
 * Lida na hora do envio, e não congelada na outbox, porque o cadastro costuma
 * vir depois da implantação — o card deve refletir o que se sabe agora.
 *
 * Ausência de qualquer elo (paciente não encontrado, tabela ainda não em
 * produção, nada preenchido) devolve null, que é "não informado" — e aí o tipo
 * de autorização cai na regra do convênio. Nunca lança: um cadastro incompleto
 * não pode impedir o cronograma de ser avisado.
 */
async function buscarOrigemJudicial(titaPacienteId: string | null): Promise<string | null> {
  if (!titaPacienteId) return null;
  try {
    const { data: pac } = await supabase
      .from("pacientes")
      .select("id_paciente")
      .eq("tita_paciente_id", Number(titaPacienteId))
      .maybeSingle();

    const idPulsar = (pac?.id_paciente as number | undefined) ?? null;
    if (idPulsar == null) return null;

    const { data: ind } = await supabase
      .from("cadastros_pacientes_altas_individualidades")
      .select("origem_judicial")
      .eq("id_paciente_pulsar", idPulsar)
      .maybeSingle();

    return (ind?.origem_judicial as string | null) ?? null;
  } catch (e) {
    console.warn("origem judicial não lida (segue como não informado):", e instanceof Error ? e.message : e);
    return null;
  }
}

function montarCustomFields(
  inc: Inclusao,
  campos: Record<string, CampoConfig>,
  origemJudicial: string | null,
): Array<{ id: string; value: unknown }> {
  const out: Array<{ id: string; value: unknown }> = [];

  const push = (chave: string, value: unknown) => {
    const id = campos[chave]?.field_id;
    if (id && value != null && value !== "") out.push({ id, value });
  };

  // Obrigatórios do formulário. `obrigatorio` resolve o UUID da opção e LANÇA
  // DeParaAusente quando o campo não está configurado ou o valor não tem opção
  // correspondente — nunca com o operador `!` sobre `campos.x`, que estouraria
  // um TypeError cru ("Cannot read properties of undefined") em vez da mensagem
  // que diz qual chave falta na config.
  const obrigatorio = (chave: string, valor: string | null, rotulo: string) => {
    const campo = campos[chave];
    const value = opcaoObrigatoria(campo, valor, rotulo);
    out.push({ id: campo!.field_id!, value });
  };

  obrigatorio("origem_solicitacao", null, "Origem da Solicitação");
  obrigatorio("motivo", null, "Motivo");
  // ── Convênio: obrigatório, EXCETO nos valores que significam "ainda não se
  // sabe". `convenios_sem_campo` é a lista desses valores, e existe porque
  // `opcaoObrigatoria` não consegue distinguir "não sei traduzir isto" (erro
  // real, que deve travar) de "isto deve ficar vazio de propósito" (decisão).
  //
  // São "Ainda não selecionado" (10.056 linhas) e "Administrativo" (8.016) —
  // 18 mil linhas que não existem no dropdown do ClickUp. Mapeá-las para
  // "Particular" mentiria: indefinido não é particular, e é o cronograma que
  // age sobre essa informação. Convênio genuinamente novo continua travando.
  const semConvenio = campos["convenios_sem_campo"] as unknown;
  const dispensaConvenio = Array.isArray(semConvenio) &&
    semConvenio.some((v) =>
      String(v).trim().toLowerCase() === (inc.convenio_nome ?? "").trim().toLowerCase()
    );
  if (!dispensaConvenio) {
    obrigatorio("convenio", inc.convenio_nome, "Convênio");
  }

  // ── Unidade: derivada do PREFIXO de sala_nome, não de unidade_nome (que tem
  // valor único). Vazia quando a sala é função e não lugar — ver unidadePorSala.
  const campoUnidade = campos["unidade_por_sala"];
  const uuidUnidade = unidadePorSala(campoUnidade, inc.sessoes);
  if (uuidUnidade) out.push({ id: campoUnidade!.field_id!, value: uuidUnidade });

  obrigatorio("tipo_autorizacao", tipoAutorizacao(origemJudicial, inc.convenio_nome), "Tipo de Autorização");

  // ── Especialidade (labels): MULTIVALORADO.
  // `terapia_nome` traz listas separadas por vírgula ("Aplicador ABA (AE),
  // Aplicador ABA (HS), Psicopedagogia" — 202 linhas em 30 dias), e o campo do
  // ClickUp aceita vários. Quebra por vírgula e mapeia cada parte; parte sem
  // correspondência é OMITIDA, nunca inventada — errar a especialidade manda o
  // cronograma pedir autorização da terapia errada.
  const campoEspec = campos["especialidade"];
  if (campoEspec?.field_id && campoEspec.opcoes) {
    const opcoes = campoEspec.opcoes;
    const uuids = new Set<string>();
    for (const s of inc.sessoes) {
      for (const parte of String(s.terapia_nome ?? "").split(",")) {
        const nome = parte.trim();
        if (!nome) continue;
        const uuid = opcoes[nome] ??
          Object.entries(opcoes).find(([k]) => k.trim().toLowerCase() === nome.toLowerCase())?.[1];
        if (uuid) uuids.add(uuid);
        else console.warn(`especialidade sem de-para (omitida): "${nome}"`);
      }
    }
    if (uuids.size > 0) out.push({ id: campoEspec.field_id, value: [...uuids] });
  }

  // Os não-obrigatórios: ausentes simplesmente não entram.
  push("nome_paciente", inc.paciente_nome);
  push("solicitante", inc.implantado_por_nome ?? inc.implantado_por_email);
  push("observacoes", montarDescricao(inc));
  push("data_inicio_vigencia", dataParaMs(inc.data_inicial));

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// A entrega
// ─────────────────────────────────────────────────────────────────────────────

async function criarTask(listId: string, corpo: unknown): Promise<{ id: string; url: string }> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: {
      // Token pessoal vai CRU, sem "Bearer" — "Bearer" é só para OAuth.
      Authorization: CLICKUP_TOKEN!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  const texto = await res.text();
  if (!res.ok) {
    // 429 merece nome: é rate limit compartilhado com glosa e healthcheck, e a
    // linha volta para a rodada seguinte sozinha (enviado_em continua nulo).
    const prefixo = res.status === 429 ? "rate limit do ClickUp" : `ClickUp ${res.status}`;
    throw new Error(`${prefixo}: ${texto.slice(0, 500)}`);
  }

  const task = JSON.parse(texto) as { id: string; url?: string };
  return { id: task.id, url: task.url ?? "" };
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
      .from("inclusoes_terapia_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (erroCfg || !cfg) {
      throw new Error(`config indisponível: ${erroCfg?.message ?? "linha id=1 ausente"}`);
    }

    if (!cfg.ativo) {
      return json({ ignorado: "criação de card desativada em inclusoes_terapia_config.ativo" });
    }

    const { data: pendentes, error: erroLista } = await supabase
      .from("inclusoes_terapia")
      .select("*")
      .is("enviado_em", null)
      .order("criado_em", { ascending: true })
      .limit(LOTE_MAX);

    if (erroLista) throw new Error(`leitura da outbox: ${erroLista.message}`);

    resumo.pendentes = pendentes?.length ?? 0;

    if (!pendentes || pendentes.length === 0) {
      resumo.clickup = "nada a enviar";
      return json(resumo);
    }

    if (!CLICKUP_TOKEN) {
      resumo.clickup = "CLICKUP_TOKEN ausente nos secrets — cards ficam pendentes";
      return json(resumo);
    }
    if (!cfg.clickup_list_id) {
      resumo.clickup = "clickup_list_id não configurado — cards ficam pendentes";
      return json(resumo);
    }

    const campos = (cfg.campos ?? {}) as Record<string, CampoConfig>;
    const janelaMs = (cfg.janela_horas ?? 72) * 3600_000;

    let enviados = 0;
    let expirados = 0;
    let dispensados = 0;
    const falhas: string[] = [];

    for (const inc of pendentes as Array<Inclusao & { criado_em: string }>) {
      try {
        // Guarda de retroatividade: uma linha velha demais não vira card. Existe
        // para o caso de a automação ficar parada (ClickUp fora, config
        // desligada) e alguém religar dias depois — sem isto, o setor receberia
        // de uma vez cards de inclusões que já foram tratadas na mão.
        if (Date.now() - new Date(inc.criado_em).getTime() > janelaMs) {
          await supabase
            .from("inclusoes_terapia")
            .update({
              enviado_em: new Date().toISOString(),
              ultimo_erro: `expirado sem envio (mais de ${cfg.janela_horas}h na outbox)`,
            })
            .eq("id", inc.id);
          expirados++;
          continue;
        }

        // Sala de teste não vira card (decisão do usuário, 2026-09-02). Marcada
        // como enviada, não deixada pendente: pendente para sempre acumularia
        // ruído na outbox e mascararia falha real. O motivo fica em ultimo_erro
        // para que a linha conte a própria história.
        const salaTeste = salaDispensaCard(campos, inc.sessoes);
        if (salaTeste) {
          await supabase
            .from("inclusoes_terapia")
            .update({
              enviado_em: new Date().toISOString(),
              ultimo_erro: `dispensado: sessão em "${salaTeste}" (sala de teste, não gera card)`,
            })
            .eq("id", inc.id);
          dispensados++;
          continue;
        }

        const origemJudicial = await buscarOrigemJudicial(inc.paciente_id);

        const terapias = inc.sessoes
          .map((s) => nomeTerapia(s.terapia_nome, s.terapia_exibicao_id))
          .filter((v, i, a) => a.indexOf(v) === i);

        const corpo = {
          // O título carrega o essencial para quem varre a lista sem abrir: quem
          // e o quê. As terapias entram até um limite — título de três linhas
          // não ajuda ninguém.
          name: `Inclusão de atendimento · ${inc.paciente_nome} · ${
            terapias.length <= 2 ? terapias.join(" + ") : `${terapias.length} terapias`
          }`,
          // markdown_content e NÃO description: mandar os dois faz o primeiro
          // sobrescrever o segundo, então só um existe aqui.
          markdown_content: montarDescricao(inc),
          custom_fields: montarCustomFields(inc, campos, origemJudicial),
          // Faz o ClickUp recusar em vez de aceitar com campo obrigatório vazio.
          // É a contrapartida do descarte silencioso descrito no cabeçalho.
          check_required_custom_fields: true,
        };

        const task = await criarTask(cfg.clickup_list_id, corpo);

        // Só o envio confirmado marca como enviado. Se este ponto não for
        // atingido, a execução seguinte reenvia — o card atrasa, não se perde.
        const { error: erroMarcar } = await supabase
          .from("inclusoes_terapia")
          .update({
            enviado_em: new Date().toISOString(),
            clickup_task_id: task.id,
            clickup_task_url: task.url,
            ultimo_erro: null,
          })
          .eq("id", inc.id);

        if (erroMarcar) {
          // Pior caso: a task foi criada e a marcação não. A execução seguinte
          // recriaria — card duplicado é ruim, mas silêncio é pior, e registrar
          // é o que permite descobrir.
          throw new Error(`criado (${task.id}) mas não marcado: ${erroMarcar.message}`);
        }

        enviados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        falhas.push(`${inc.bundle_id}: ${msg}`);
        await supabase
          .from("inclusoes_terapia")
          .update({ tentativas: (inc.tentativas ?? 0) + 1, ultimo_erro: msg.slice(0, 500) })
          .eq("id", inc.id);
        console.error(`❌ inclusão ${inc.bundle_id} falhou:`, msg);
      }
    }

    resumo.enviados = enviados;
    if (expirados) resumo.expirados = expirados;
    if (dispensados) resumo.dispensados = dispensados;
    resumo.falhas = falhas.length ? falhas : undefined;
    resumo.clickup = falhas.length ? "parcial" : "enviado";

    return json(resumo);
  } catch (e) {
    // 500 de propósito: um erro AQUI é a própria entrega quebrada, e precisa
    // aparecer em cron.job_run_details em vez de virar um "sucesso" silencioso.
    console.error("⛔ inclusao-terapia-clickup:", e);
    return json({ ...resumo, erro_fatal: e instanceof Error ? e.message : String(e) }, 500);
  }
});
