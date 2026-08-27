import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import { mensagemDeErroBanco } from "@/lib/cadastros/erroBanco"
import type {
  Responsavel,
  ResponsavelEdit,
  VinculoResponsavel,
  VinculoResponsavelEdit,
} from "@/types/responsavel"

// Ver supabase/migrations/20260826100200_create_responsaveis.sql.

const TABLE = "responsaveis"
const TABLE_VINCULO = "pacientes_responsaveis"

// Colunas explícitas, nunca `select("*")`: sob privilégio por COLUNA o PostgREST
// devolve 403 para `*`, e isso já foi um problema real neste projeto.
const COLUNAS = [
  "id",
  "nome",
  "cpf",
  "rg",
  "rg_orgao_emissor",
  "rg_uf",
  "data_nascimento",
  "celular",
  "telefone_residencial",
  "email",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "ativo",
  "criado_em",
  "atualizado_em",
].join(",")

/**
 * Inclui inativos de propósito — espelha `usePacientes`. Um responsável
 * inativado precisa continuar aparecendo para quem já está vinculado a ele
 * (ver B1 em FiliacaoResponsaveis) e para poder ser reativado. Quem não deve
 * oferecer inativos como opção NOVA filtra na própria tela, não aqui.
 */
export async function getResponsaveis(): Promise<{
  data: Responsavel[]
  error: string | null
}> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from(TABLE).select(COLUNAS).order("nome")

  if (error) {
    console.error("Erro ao buscar responsáveis:", error)
    return { data: [], error: mensagemDeErroBanco(error) }
  }

  return { data: (data ?? []) as unknown as Responsavel[], error: null }
}

export async function getResponsavelPorId(
  id: number
): Promise<{ data: Responsavel | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUNAS)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("Erro ao buscar responsável:", error)
    return { data: null, error: mensagemDeErroBanco(error) }
  }

  return { data: (data ?? null) as Responsavel | null, error: null }
}

// Colunas que a tela pode gravar. `{...row}` mandaria `id`, `criado_em`,
// `atualizado_em` junto — não quebra hoje, mas vira 403 sob privilégio por
// coluna, o que já aconteceu neste projeto.
const COLUNAS_EDITAVEIS = [
  "nome",
  "cpf",
  "rg",
  "rg_orgao_emissor",
  "rg_uf",
  "data_nascimento",
  "celular",
  "telefone_residencial",
  "email",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "ativo",
] as const

/**
 * De qual paciente veio a edição, quando veio de dentro do detalhe de um.
 *
 * A trilha do paciente filtra por `paciente_id`; sem isto a alteração do
 * responsável some do "Histórico deste paciente", que é justo onde ela foi feita.
 */
export type ContextoPacienteAuditoria = { pacienteId?: number; pacienteNome?: string }

/**
 * Cria ou atualiza. Devolve a linha gravada porque a criação precisa do `id`
 * novo para montar o vínculo em seguida.
 */
export async function upsertResponsavel(
  row: ResponsavelEdit,
  contexto?: ContextoPacienteAuditoria
): Promise<{ data: Responsavel | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  const payload: Record<string, unknown> = {
    id_usuario: usuario.id,
    nome_usuario_responsavel: usuario.nome,
  }
  for (const coluna of COLUNAS_EDITAVEIS) {
    payload[coluna] = row[coluna]
  }

  // O "antes" precisa ser lido antes da escrita, senão a trilha compara o
  // registro com ele mesmo.
  const antes = row.id ? (await getResponsavelPorId(row.id)).data : null

  // Insert e update em vez de upsert: `id` é `GENERATED ALWAYS AS IDENTITY`
  // (20260826100200_create_responsaveis.sql), e o Postgres recusa qualquer
  // valor explícito nessa coluna dentro de um INSERT — mesmo quando é um
  // upsert que na prática vai fazer UPDATE, o `ON CONFLICT` não livra o
  // INSERT inicial dessa checagem. Mesmo bug (e mesma correção) de
  // `upsertPaciente` em pacientes.service.ts.
  const query = row.id
    ? supabase.from(TABLE).update(payload).eq("id", row.id)
    : supabase.from(TABLE).insert(payload)

  const { data, error } = await query.select(COLUNAS).maybeSingle()

  if (error) {
    console.error("Erro ao salvar responsável:", error)
    return { data: null, error: mensagemDeErroBanco(error) }
  }

  const salvo = (data ?? null) as Responsavel | null

  await registrarAuditoria({
    tabela: "responsavel",
    registroId: salvo?.id ?? row.id ?? "",
    acao: antes ? "editar" : "criar",
    pacienteId: contexto?.pacienteId,
    pacienteNome: contexto?.pacienteNome,
    alvoNome: salvo?.nome ?? row.nome,
    antes: (antes ?? null) as Record<string, unknown> | null,
    depois: (salvo ?? null) as Record<string, unknown> | null,
  })

  return { data: salvo, error: null }
}

/**
 * Vínculos de um paciente, com o responsável embutido.
 *
 * As colunas do embed também são listadas explicitamente — a regra do `*` vale
 * dentro do embed do PostgREST igual vale fora dele.
 */
export async function getVinculosDoPaciente(
  idPaciente: number
): Promise<{ data: VinculoResponsavel[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE_VINCULO)
    .select(`paciente_id,responsavel_id,tipo,parentesco,responsavel:responsaveis(${COLUNAS})`)
    .eq("paciente_id", idPaciente)

  if (error) {
    console.error("Erro ao buscar vínculos de responsáveis:", error)
    return { data: [], error: mensagemDeErroBanco(error) }
  }

  return { data: (data ?? []) as unknown as VinculoResponsavel[], error: null }
}

/**
 * Pacientes de quem esta pessoa é responsável — o caso dos irmãos, e a razão de
 * `responsaveis` ser entidade própria em vez de campo repetido no paciente.
 */
export async function getPacientesDoResponsavel(responsavelId: number): Promise<{
  data: { id_paciente: number; nome: string; tipo: string }[]
  error: string | null
}> {
  const { data, error } = await getVinculosDeResponsaveis([responsavelId])
  if (error) return { data: [], error }
  return { data: data.get(responsavelId) ?? [], error: null }
}

/**
 * Os pacientes de VÁRIOS responsáveis, em uma única consulta.
 *
 * Substitui o padrão anterior de uma chamada de `getPacientesDoResponsavel`
 * por card renderizado — 300 responsáveis na lista viravam 301 requisições.
 * Como agora só os ≤4 responsáveis selecionados no paciente aberto importam,
 * uma query resolve.
 */
export async function getVinculosDeResponsaveis(responsavelIds: number[]): Promise<{
  data: Map<number, { id_paciente: number; nome: string; tipo: string }[]>
  error: string | null
}> {
  const ids = [...new Set(responsavelIds)]
  if (ids.length === 0) return { data: new Map(), error: null }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE_VINCULO)
    .select("responsavel_id,tipo,paciente:pacientes(id_paciente,nome)")
    .in("responsavel_id", ids)

  if (error) {
    console.error("Erro ao buscar pacientes dos responsáveis:", error)
    return { data: new Map(), error: mensagemDeErroBanco(error) }
  }

  const linhas = (data ?? []) as unknown as {
    responsavel_id: number
    tipo: string
    paciente: { id_paciente: number; nome: string } | null
  }[]

  const porResponsavel = new Map<number, { id_paciente: number; nome: string; tipo: string }[]>()
  for (const linha of linhas) {
    if (!linha.paciente) continue
    const lista = porResponsavel.get(linha.responsavel_id) ?? []
    lista.push({ id_paciente: linha.paciente.id_paciente, nome: linha.paciente.nome, tipo: linha.tipo })
    porResponsavel.set(linha.responsavel_id, lista)
  }
  for (const lista of porResponsavel.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }

  return { data: porResponsavel, error: null }
}

/**
 * Inativa ou reativa o cadastro, com motivo — cópia estrutural de
 * `definirAtivoPaciente` (pacientes.service.ts). Nunca excluir: a FK
 * `pacientes_responsaveis.responsavel_id` é `ON DELETE RESTRICT`.
 */
export async function definirAtivoResponsavel(
  id: number,
  ativo: boolean,
  motivo?: string,
  contexto?: ContextoPacienteAuditoria
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  const antes = (await getResponsavelPorId(id)).data

  const { data: depois, error } = await supabase
    .from(TABLE)
    .update({
      ativo,
      id_usuario: usuario.id,
      nome_usuario_responsavel: usuario.nome,
    })
    .eq("id", id)
    .select(COLUNAS)
    .maybeSingle()

  if (error) {
    console.error("Erro ao alterar situação do responsável:", error)
    return { ok: false, error: mensagemDeErroBanco(error) }
  }

  await registrarAuditoria({
    tabela: "responsavel",
    registroId: id,
    acao: ativo ? "reativar" : "inativar",
    pacienteId: contexto?.pacienteId,
    pacienteNome: contexto?.pacienteNome,
    alvoNome: antes?.nome ?? null,
    antes: (antes ?? null) as Record<string, unknown> | null,
    depois: (depois ?? null) as Record<string, unknown> | null,
    motivo: motivo?.trim() || null,
  })

  return { ok: true, error: null }
}

/**
 * Substitui o conjunto de vínculos do paciente pelo que a tela mandou.
 *
 * Faz upsert do que veio e apaga só os tipos que sumiram — em vez de "apaga tudo
 * e reinsere", que deixaria o paciente sem responsável numa janela de tempo e
 * geraria churn de auditoria em cada salvamento.
 */
export async function salvarVinculos(
  idPaciente: number,
  vinculos: VinculoResponsavelEdit[],
  pacienteNome?: string
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  const { data: antes } = await getVinculosDoPaciente(idPaciente)

  if (vinculos.length > 0) {
    const payload = vinculos.map((v) => ({
      paciente_id: idPaciente,
      responsavel_id: v.responsavel_id,
      tipo: v.tipo,
      parentesco: v.parentesco,
      id_usuario: usuario.id,
      nome_usuario_responsavel: usuario.nome,
    }))

    const { error } = await supabase
      .from(TABLE_VINCULO)
      .upsert(payload, { onConflict: "paciente_id,tipo" })

    if (error) {
      console.error("Erro ao salvar vínculos de responsáveis:", error)
      return { ok: false, error: mensagemDeErroBanco(error) }
    }
  }

  const tiposMantidos = vinculos.map((v) => v.tipo)
  let remocao = supabase.from(TABLE_VINCULO).delete().eq("paciente_id", idPaciente)
  if (tiposMantidos.length > 0) {
    remocao = remocao.not("tipo", "in", `(${tiposMantidos.join(",")})`)
  }

  const { error: erroRemocao } = await remocao
  if (erroRemocao) {
    console.error("Erro ao remover vínculos de responsáveis:", erroRemocao)
    return { ok: false, error: mensagemDeErroBanco(erroRemocao) }
  }

  // A trilha guarda o conjunto de vínculos como um todo — "quem responde por
  // este paciente" é a informação útil, não cada linha isolada.
  await registrarAuditoria({
    tabela: "responsavel",
    registroId: `paciente:${idPaciente}`,
    acao: "editar",
    pacienteId: idPaciente,
    pacienteNome: pacienteNome ?? null,
    alvoNome: pacienteNome ? `Responsáveis de ${pacienteNome}` : "Responsáveis do paciente",
    antes: { vinculos: resumirVinculos(antes) },
    depois: { vinculos: vinculos.map((v) => `${v.tipo}#${v.responsavel_id}`).sort().join(", ") },
  })

  return { ok: true, error: null }
}

function resumirVinculos(lista: VinculoResponsavel[]): string {
  return lista
    .map((v) => `${v.tipo}#${v.responsavel_id}`)
    .sort()
    .join(", ")
}
