import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type { EdicaoPdiPrazos } from "@/types/pdiPrazos"

// Escrita do Controle de Prazos do PDI: os campos manuais que a Amanda/
// Gracielle digitam (especialista, data da avaliação, validade, observações).
//
// Do CLIENTE, com a chave anon e sob RLS — ao contrário da LEITURA da lista
// (services/pdi/prazos.ts, service_role, porque o relatório Órbita não tem
// GRANT para `authenticated`). `pdi_controle_prazos` é tabela nossa e tem
// policy própria (usuario_tem_permissao('terapeutico_pdi'), ver
// 20260904120000); escrever daqui é o que faz `auth.uid()` valer e a
// permissão ser conferida pelo banco de verdade, não só escondida no Sidebar.
//
// ⚠️ RLS BLOQUEANDO WRITE NÃO GERA ERRO. Um upsert negado por policy volta como
// sucesso com zero linhas afetadas — a tela mostraria "salvo" e nada teria
// sido gravado (mesmo defeito já visto em Ocupação de Salas — ver a memória de
// projeto). Daí o `.select().maybeSingle()` no upsert e a checagem do retorno:
// sem linha de volta, é falha, e a tela precisa dizer isso. Mesmo padrão de
// services/laudosAcompanhamento.service.ts.

const TABELA = "pdi_controle_prazos"

const COLUNAS =
  "paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes," +
  " criado_por_nome, atualizado_por_nome, atualizado_em_brasilia"

export interface RegistroPdiPrazos {
  paciente_id: number
  especialista_tita_id: number | null
  data_avaliacao: string | null
  data_validade: string | null
  observacoes: string | null
  criado_por_nome: string | null
  atualizado_por_nome: string | null
  atualizado_em_brasilia: string | null
}

/** O registro atual de um paciente, ou `null` se ainda não há dado manual gravado. */
export async function getPdiPrazos(
  pacienteId: number,
): Promise<{ data: RegistroPdiPrazos | null; error: string | null }> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABELA).select(COLUNAS).eq("paciente_id", pacienteId).maybeSingle()

  if (error) {
    console.error("[pdiPrazos] falha ao ler registro:", error)
    return { data: null, error: error.message }
  }
  return { data: (data as unknown as RegistroPdiPrazos) ?? null, error: null }
}

/**
 * Grava (ou regrava) o Controle de Prazos do PDI de um paciente e registra a
 * alteração na trilha.
 *
 * UPSERT por `paciente_id`, que é a PK: um paciente tem um registro, e salvar
 * duas vezes não cria duas linhas. Idempotente por construção, não por
 * checagem.
 *
 * `pacienteNome` é só para a trilha (`alvo_nome`, mesmo papel de
 * `item.nome` em `salvarAcompanhamento`) — não é gravado em
 * `pdi_controle_prazos`, que não tem coluna de nome (o nome mora em
 * `public.pacientes`, dono da FK).
 */
export async function salvarPdiPrazos(
  pacienteId: number,
  pacienteNome: string,
  edicao: EdicaoPdiPrazos,
): Promise<{ data: RegistroPdiPrazos | null; error: string | null }> {
  const sb = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  // O estado ANTERIOR, lido antes de escrever: é o `antes` da trilha e é o que
  // distingue uma criação de uma edição.
  const { data: anterior, error: erroLeitura } = await getPdiPrazos(pacienteId)
  if (erroLeitura) return { data: null, error: erroLeitura }

  const payload = {
    paciente_id: pacienteId,
    especialista_tita_id: edicao.especialistaTitaId,
    data_avaliacao: edicao.dataAvaliacao || null,
    data_validade: edicao.dataValidade || null,
    // String vazia viraria "" no banco e apareceria como observação em branco
    // no histórico; `null` é ausência.
    observacoes: edicao.observacoes?.trim() || null,

    atualizado_por_id: usuario.id,
    atualizado_por_nome: usuario.nome,
    // Só na criação — no upsert de um registro que já existe, `onConflict`
    // atualiza a linha e estes dois seriam sobrescritos com o usuário da vez.
    ...(anterior ? {} : { criado_por_id: usuario.id, criado_por_nome: usuario.nome }),
  }

  const { data, error } = await sb
    .from(TABELA)
    .upsert(payload, { onConflict: "paciente_id" })
    .select(COLUNAS)
    .maybeSingle()

  if (error) {
    console.error("[pdiPrazos] falha ao gravar:", error)
    return { data: null, error: error.message }
  }

  // Ver o aviso no cabeçalho: policy negando write volta sem erro e sem linha.
  if (!data) {
    const msg =
      "A gravação não retornou o registro — provavelmente falta de permissão (RLS). Nada foi salvo."
    console.error(`[pdiPrazos] ${msg}`, { pacienteId })
    return { data: null, error: msg }
  }

  const gravado = data as unknown as RegistroPdiPrazos

  // A trilha vem DEPOIS da gravação e nunca a derruba: registrarAuditoria não
  // lança e avisa por toast se falhar. Se o dado foi salvo e a trilha falhou,
  // o certo é o dado continuar salvo.
  await registrarAuditoria({
    tabela: "pdi_controle_prazos",
    registroId: pacienteId,
    acao: anterior ? "editar" : "criar",
    pacienteId,
    pacienteNome,
    alvoNome: `${pacienteNome} — Controle de Prazos do PDI`,
    antes: anterior ? paraTrilha(anterior) : null,
    depois: paraTrilha(gravado),
  })

  return { data: gravado, error: null }
}

/**
 * O recorte do registro que vai para `antes`/`depois`.
 *
 * De fora ficam as colunas de infraestrutura (`paciente_id`, quem/quando) —
 * elas não mudam entre um save e outro, e `camposAlterados` as listaria como
 * ruído. Quem alterou e quando já são colunas próprias da trilha.
 */
function paraTrilha(r: RegistroPdiPrazos): Record<string, unknown> {
  return {
    especialista_tita_id: r.especialista_tita_id,
    data_avaliacao: r.data_avaliacao,
    data_validade: r.data_validade,
    observacoes: r.observacoes,
  }
}
