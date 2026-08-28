import { getSupabaseClient } from "@/lib/supabase/client"
import { resolverNomeUsuario } from "@/services/autorizacoes.service"

/**
 * Autorizações avulsas — a solicitação que não nasce de uma sessão da agenda.
 *
 * Service próprio, e NÃO `criarAutorizacao` de autorizacoes.service.ts, por três
 * razões concretas daquele: ele descarta o `agenda_id` que recebe (grava `null`
 * fixo), manda `cpf`/`data_nascimento` que não existem em `fila_autorizacoes` — e
 * por isso carrega um retry que remove os dois quando o PostgREST reclama —, e usa
 * `data`/`tuss1` como nomes de entrada para colunas chamadas `data_atendimento` e
 * `tuss`. Herdar isso para um caminho novo seria propagar três defeitos de graça.
 *
 * O que a avulsa reaproveita de lá é só `resolverNomeUsuario`, que é o mesmo
 * lookup memoizado por sessão.
 */

/** Colunas explícitas: `select("*")` dá 403 sob privilégio por COLUNA. */
const COLUNAS_LISTAGEM = [
  "id",
  "paciente_id",
  "paciente_nome",
  "data_atendimento",
  "horario",
  "terapia_nome",
  "tuss",
  "status",
  "status_assim",
  "numero_autorizacao",
  "horario_autorizacao",
  "forma_autorizacao",
  "error_message",
  "motivo_avulsa",
  "criado_por",
  "created_at",
  "completed_at",
].join(",")

export type AutorizacaoAvulsa = {
  id: string
  paciente_id: string
  paciente_nome: string
  data_atendimento: string
  horario: string
  terapia_nome: string | null
  tuss: string | null
  status: string
  status_assim: string | null
  numero_autorizacao: string | null
  horario_autorizacao: string | null
  forma_autorizacao: string | null
  error_message: string | null
  motivo_avulsa: string | null
  criado_por: string | null
  created_at: string | null
  completed_at: string | null
}

export type CriarAvulsaPayload = {
  /** `pacientes.tita_paciente_id` — a chave estável do paciente no TiTa. */
  paciente_id: number
  paciente_nome: string
  /** Carteirinha já fatiada por `lib/central/carteirinha.ts`. */
  empresa: string
  matricula: string
  dep: string
  terapia_nome: string
  tuss: string
  crm: string | null
  /** UF do CRM. O robô seleciona esta UF no portal; sem ela ele assume RJ. */
  crm_uf: string
  nome_medico: string | null
  motivo_avulsa: string
  /** Vem do worker local. Sem ele o robô nunca pega a linha. */
  machine_id: string
}

export type ResultadoCriarAvulsa =
  | { ok: true; id: string }
  | { ok: false; erro: string; duplicada?: boolean }

/** `HH:MM:SS` do relógio local — a recepção e a coluna estão no mesmo fuso. */
function horaAgora(): string {
  const agora = new Date()
  const dois = (n: number) => String(n).padStart(2, "0")
  return `${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`
}

/** `YYYY-MM-DD` local. `toISOString()` viraria o dia depois das 21h em São Paulo. */
function hojeLocal(): string {
  const agora = new Date()
  const dois = (n: number) => String(n).padStart(2, "0")
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
}

/**
 * Enfileira a avulsa como 'pendente' para o robô da estação.
 *
 * `data_atendimento` = hoje e `horario` = a hora do envio COM SEGUNDOS. Os dois são
 * escrituração, não semântica: o robô não lê nenhum dos dois (`robo_buscar_tarefa`
 * devolve 9 campos e nenhum deles é data ou hora). Os segundos existem para não
 * colidir com `unique_fila_agendamento (paciente_id, data_atendimento, horario)`,
 * que é uma constraint sobre a grade de 40 min das sessões reais.
 *
 * `crm_uf` vai EXPLÍCITO, escolhido na tela. O trigger `trg_set_crm_uf`
 * (20260728040000) só age `if new.crm_uf is null`, então o valor da tela vence — e
 * é isso que se quer: quando o médico é de outro estado a ASSIM rejeita a guia, e
 * numa avulsa não existe sessão anterior de onde deduzir a UF com segurança.
 *
 * `criado_por` também vai explícito: o trigger `fn_set_criado_por` resolveria o
 * DONO DA ESTAÇÃO (`machine_id -> maquinas.user_id`), que não é necessariamente
 * quem digitou.
 */
export async function criarAutorizacaoAvulsa(
  payload: CriarAvulsaPayload
): Promise<ResultadoCriarAvulsa> {
  const supabase = getSupabaseClient()
  const criadoPor = await resolverNomeUsuario(supabase)

  const { data, error } = await supabase
    .from("fila_autorizacoes")
    .insert({
      paciente_id: String(payload.paciente_id),
      paciente_nome: payload.paciente_nome,
      data_atendimento: hojeLocal(),
      horario: horaAgora(),
      empresa: payload.empresa,
      matricula: payload.matricula,
      dep: payload.dep,
      terapia_nome: payload.terapia_nome,
      tuss: payload.tuss,
      crm: payload.crm,
      crm_uf: payload.crm_uf,
      nome_medico: payload.nome_medico,
      status: "pendente",
      machine_id: payload.machine_id,
      criado_por: criadoPor,
      avulsa: true,
      motivo_avulsa: payload.motivo_avulsa,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Erro ao criar autorização avulsa:", error)
    // 23505 = unique_violation. Só acontece se duas avulsas do mesmo paciente
    // caírem no mesmo segundo — o guarda dos 30 min já barra o caso realista.
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        duplicada: true,
        erro: "Já existe uma solicitação para este paciente neste exato horário.",
      }
    }
    return { ok: false, erro: error.message }
  }

  return { ok: true, id: (data as { id: string }).id }
}

/** As avulsas de um intervalo fechado de datas, mais recentes primeiro. */
export async function listarAutorizacoesAvulsas(
  de: string,
  ate: string
): Promise<{ data: AutorizacaoAvulsa[]; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("fila_autorizacoes")
    .select(COLUNAS_LISTAGEM)
    .eq("avulsa", true)
    .gte("data_atendimento", de)
    .lte("data_atendimento", ate)
    .order("data_atendimento", { ascending: false })
    .order("horario", { ascending: false })

  if (error) {
    console.error("Erro ao listar autorizações avulsas:", error)
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as unknown as AutorizacaoAvulsa[], error: null }
}

/**
 * A última autorização do paciente HOJE, para a regra dos 30 minutos.
 *
 * Olha TODAS as linhas do paciente no dia, avulsas e de sessão, porque a ASSIM
 * conta o intervalo por beneficiário no RELÓGIO — não por origem da solicitação.
 *
 * SÓ `horario_autorizacao`, de propósito. A RPC do /solicitar usa
 * `COALESCE(horario_autorizacao, completed_at AT TIME ZONE ...)` porque no SQL a
 * conversão é barata, mas aqui não: `fila_autorizacoes` mistura dois fusos —
 * `completed_at` é UTC e `horario_autorizacao` é hora de parede de São Paulo. Um
 * `completed_at` cru entregue a `minutosDesde()` (que faz `new Date()` local)
 * apareceria 3 horas NO FUTURO, o intervalo daria negativo e o paciente ficaria
 * bloqueado para sempre, calado.
 *
 * O que se perde é a linha que concluiu sem carimbar horário. Aceitável: falhar
 * para o lado de deixar pedir num caso raro é muito melhor que travar o caso comum.
 *
 * Sem filtro de status: qualquer linha com `horario_autorizacao` teve interação com
 * o portal, e é a interação que a ASSIM cronometra — inclusive a que deu erro
 * depois da identificação do beneficiário.
 */
export async function ultimaAutorizacaoDoPaciente(
  pacienteId: number
): Promise<string | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("fila_autorizacoes")
    .select("horario_autorizacao")
    .eq("paciente_id", String(pacienteId))
    .eq("data_atendimento", hojeLocal())
    .not("horario_autorizacao", "is", null)
    .order("horario_autorizacao", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Erro ao ler última autorização do paciente:", error)
    return null
  }

  return (data as { horario_autorizacao: string | null } | null)?.horario_autorizacao ?? null
}

// Carteirinha, CRM, UF e médico solicitante NÃO têm função de busca aqui: vêm
// prontos na linha de `listar_pacientes_assim()` (ver hooks/usePacientesAssim.ts),
// numa chamada só, em vez de um round-trip por paciente escolhido.

export { hojeLocal }
