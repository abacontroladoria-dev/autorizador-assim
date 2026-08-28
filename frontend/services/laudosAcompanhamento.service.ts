import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type {
  EdicaoAcompanhamentoLaudo,
  ItemAcompanhamentoLaudo,
} from "@/types/laudosAcompanhamento"

// Escrita do acompanhamento de laudo: a data em que a recepção avisou o
// responsável, mais a observação.
//
// Do CLIENTE, com a chave anon e sob RLS — ao contrário da LEITURA da lista, que
// precisa de service_role porque `orbita_laudos_relatorio` não tem GRANT para
// `authenticated` (ver services/laudos/acompanhamento.ts). `laudos_acompanhamento`
// é tabela nossa e tem policy própria; escrever daqui é o que faz
// `auth.uid()` valer e a permissão ser conferida pelo banco.
//
// ⚠️ RLS BLOQUEANDO WRITE NÃO GERA ERRO. Um upsert negado por policy volta como
// sucesso com zero linhas afetadas — a tela mostraria "salvo" e nada teria sido
// gravado. É o defeito que já apareceu em Ocupação de Salas. Daí o
// `.select().maybeSingle()` no upsert e a checagem do retorno: sem linha de
// volta, é falha, e a tela precisa dizer isso.

const TABELA = "laudos_acompanhamento"

/** As colunas que voltam do upsert e que entram na trilha. */
const COLUNAS =
  "id_laudo, id_favorecido, paciente_id, mensagem_enviada_em, observacao," +
  " snap_paciente_nome, snap_data_laudo, snap_validade, snap_situacao, snap_autorizado_em," +
  " criado_por_nome, atualizado_por_nome, atualizado_em_brasilia"

export interface RegistroAcompanhamento {
  id_laudo: string
  id_favorecido: number | null
  paciente_id: number | null
  mensagem_enviada_em: string | null
  observacao: string | null
  snap_paciente_nome: string | null
  snap_data_laudo: string | null
  snap_validade: string | null
  snap_situacao: string | null
  snap_autorizado_em: string | null
  criado_por_nome: string | null
  atualizado_por_nome: string | null
  atualizado_em_brasilia: string | null
}

/** O registro atual de um laudo, ou `null` se a recepção nunca gravou nada. */
export async function getAcompanhamento(
  idLaudo: string,
): Promise<{ data: RegistroAcompanhamento | null; error: string | null }> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABELA).select(COLUNAS).eq("id_laudo", idLaudo).maybeSingle()

  if (error) {
    console.error("[laudosAcompanhamento] falha ao ler registro:", error)
    return { data: null, error: error.message }
  }
  return { data: (data as unknown as RegistroAcompanhamento) ?? null, error: null }
}

/**
 * Grava (ou regrava) o acompanhamento de um laudo e registra a alteração na
 * trilha.
 *
 * UPSERT por `id_laudo`, que é a PK: um laudo tem um registro, e salvar duas
 * vezes não cria duas linhas. Idempotente por construção, não por checagem.
 *
 * `item` é a linha que está na tela — dela saem o `id_favorecido`, o
 * `paciente_id` e o snapshot do laudo. O snapshot é regravado a cada save de
 * propósito: ele descreve o laudo NO MOMENTO daquele contato, e é isso que dá
 * sentido ao histórico depois que o laudo for renovado ou sair do relatório.
 */
export async function salvarAcompanhamento(
  item: ItemAcompanhamentoLaudo,
  edicao: EdicaoAcompanhamentoLaudo,
): Promise<{ data: RegistroAcompanhamento | null; error: string | null }> {
  const sb = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  // O estado ANTERIOR, lido antes de escrever: é o `antes` da trilha e é o que
  // distingue uma criação de uma edição. Sem ele o histórico não teria
  // "antes → depois", que é justamente o que se pede desta tela.
  const { data: anterior, error: erroLeitura } = await getAcompanhamento(item.idLaudo)
  if (erroLeitura) return { data: null, error: erroLeitura }

  const payload = {
    id_laudo: item.idLaudo,
    id_favorecido: item.idFavorecido,
    paciente_id: item.pacienteId,
    mensagem_enviada_em: edicao.mensagemEnviadaEm || null,
    // String vazia viraria "" no banco e apareceria como observação em branco no
    // histórico; `null` é ausência.
    observacao: edicao.observacao?.trim() || null,

    snap_paciente_nome: item.nome,
    snap_data_laudo: item.dataLaudo,
    snap_validade: item.validade,
    snap_situacao: item.situacao,
    snap_autorizado_em: item.autorizadoEm,

    atualizado_por_id: usuario.id,
    atualizado_por_nome: usuario.nome,
    // Só na criação. No upsert de um registro que já existe, `onConflict`
    // atualiza a linha e estes dois seriam sobrescritos com o usuário da vez —
    // "criado por" passaria a mentir. Ver o merge condicional abaixo.
    ...(anterior
      ? {}
      : { criado_por_id: usuario.id, criado_por_nome: usuario.nome }),
  }

  const { data, error } = await sb
    .from(TABELA)
    .upsert(payload, { onConflict: "id_laudo" })
    .select(COLUNAS)
    .maybeSingle()

  if (error) {
    console.error("[laudosAcompanhamento] falha ao gravar:", error)
    return { data: null, error: error.message }
  }

  // Ver o aviso no cabeçalho: policy negando write volta sem erro e sem linha.
  if (!data) {
    const msg =
      "A gravação não retornou o registro — provavelmente falta de permissão (RLS). Nada foi salvo."
    console.error(`[laudosAcompanhamento] ${msg}`, { idLaudo: item.idLaudo })
    return { data: null, error: msg }
  }

  const gravado = data as unknown as RegistroAcompanhamento

  // A trilha vem DEPOIS da gravação e nunca a derruba: registrarAuditoria não
  // lança e avisa por toast se falhar (avisarFalhaDeTrilha). Se o aviso foi
  // salvo e a trilha falhou, o certo é o aviso continuar salvo.
  await registrarAuditoria({
    tabela: "laudo_acompanhamento",
    // O `ID Laudo` do Órbita. É a PK da tabela e a chave estável entre
    // importações do robô — a trilha continua colada no laudo certo depois de
    // qualquer recarga do relatório.
    registroId: item.idLaudo,
    acao: anterior ? "editar" : "criar",
    pacienteId: item.pacienteId,
    pacienteNome: item.nome,
    // O que identifica a linha na listagem do histórico geral, onde ela aparece
    // junto das alterações de paciente, responsável e ficha.
    alvoNome: `${item.nome} — laudo ${item.idLaudo}`,
    antes: anterior ? paraTrilha(anterior) : null,
    depois: paraTrilha(gravado),
  })

  return { data: gravado, error: null }
}

/**
 * O recorte do registro que vai para `antes`/`depois`.
 *
 * De fora ficam as colunas de infraestrutura (`id_laudo`, `paciente_id`,
 * `id_favorecido`, quem/quando) — elas não mudam entre um save e outro, e
 * `camposAlterados` as listaria como ruído. Quem alterou e quando já são colunas
 * próprias da trilha.
 */
function paraTrilha(r: RegistroAcompanhamento): Record<string, unknown> {
  return {
    mensagem_enviada_em: r.mensagem_enviada_em,
    observacao: r.observacao,
    snap_paciente_nome: r.snap_paciente_nome,
    snap_data_laudo: r.snap_data_laudo,
    snap_validade: r.snap_validade,
    snap_situacao: r.snap_situacao,
    snap_autorizado_em: r.snap_autorizado_em,
  }
}
