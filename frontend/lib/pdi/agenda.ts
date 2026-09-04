// Leituras puras sobre linhas da grade (via `buscarGrade()`,
// lib/grade/fonte.ts), filtradas por paciente, para o Controle de Prazos do
// PDI: dias/turno clínicos, sinalização de ambiente natural, contagem de
// aplicadores e verificação do Coordenador de Caso.
//
// Módulo PURO — sem import de supabase/fetch. Quem chama já filtrou as linhas
// pelo `paciente_id` de interesse (`buscarGrade` não tem esse filtro pronto —
// ver `refinar` em lib/grade/fonte.ts); as funções aqui não filtram paciente
// de novo, só terapia/dia/hora.
//
// `LinhaGradePdi` NÃO é um tipo que já existia no projeto: `buscarGrade<T>()`
// é genérico e cada chamador declara o corte de colunas que precisa inline
// (ver `campos: 'profissional_nome, terapia_nome, ...'` em
// BuscarReposicaoManual.tsx) — não há um `GradeRow` canônico exportado para
// reaproveitar. O corte abaixo espelha as colunas de
// `public.vw_grade_base`/`vw_grade_atendimentos`
// (supabase/migrations/20260806110000_vw_grade_ponto_unico_leitura.sql),
// confirmadas ao vivo em 04/09/2026 via PostgREST (`dia_semana` no mesmo
// formato de `DIAS_LIST`, ex. "Segunda-feira"; `hora_inicial`/`hora_final`
// como "HH:MM:SS").

import { ABA_EXT, DIAS_LIST, DIAS_ORD } from "@/lib/cronograma/constants"

export interface LinhaGradePdi {
  paciente_id: number | null
  profissional_id: number | null
  /** `data` da sessão, ISO (`AAAA-MM-DD`) — usada só por `coordenadorDoCaso`. */
  data: string | null
  dia_semana: string | null
  hora_inicial: string | null
  hora_final: string | null
  terapia_nome: string | null
  /** Nome do profissional gravado na própria linha — usado por `aplicadoresDetalhados`. */
  profissional_nome?: string | null
  /**
   * Nome do paciente gravado na própria linha de grade — fallback de nome em
   * lib/pdi/juntar.ts para um paciente TRACKED (já tem linha em
   * `pdi_controle_prazos`) que não aparece no relatório Órbita de hoje. Não
   * lido por nenhuma das funções puras deste módulo, só carregado através
   * delas (o corte de colunas de `buscarGradeDaJanela` em
   * services/pdi/prazos.ts inclui essa coluna).
   */
  paciente_nome?: string | null
}

/**
 * Existe QUALQUER linha de grade (de qualquer terapia — clínica ou ambiente
 * natural) para o paciente na janela já buscada pelo chamador. É o sinal de
 * "Ativo" do Controle de Prazos do PDI (ver o cabeçalho de lib/pdi/juntar.ts):
 * ao contrário de `diasClinicos`/`turnoClinico`, não filtra `ehClinica` — um
 * paciente só com Aplicador ABA Casa/Escola ainda está em atendimento.
 */
export function temAgendamentoFuturo(rows: LinhaGradePdi[]): boolean {
  return rows.length > 0
}

/** Uma linha é "clínica" quando a terapia NÃO é ambiente natural (Casa/Escola). */
function ehClinica(r: LinhaGradePdi): boolean {
  return !!r.terapia_nome && !ABA_EXT.has(r.terapia_nome)
}

/**
 * Dias da semana com sessão CLÍNICA (fora de `ABA_EXT`), ordenados pela mesma
 * ordem de `DIAS_LIST`/`DIAS_ORD` usada no resto do cronograma.
 */
export function diasClinicos(rows: LinhaGradePdi[]): string[] {
  const dias = new Set<string>()
  for (const r of rows) {
    if (ehClinica(r) && r.dia_semana) dias.add(r.dia_semana)
  }
  return [...dias].sort((a, b) => (DIAS_ORD[a] ?? DIAS_LIST.length) - (DIAS_ORD[b] ?? DIAS_LIST.length))
}

export type TurnoClinico = "manhã" | "tarde" | "ambos" | null

// Janelas de turno pedidas no plano. Comparação lexicográfica de "HH:MM:SS"
// funciona como comparação de horário porque a string vem sempre zero-padded
// (mesmo padrão de comparação por string ISO usado em todo o módulo de datas).
const MANHA_INICIO = "08:00:00"
const MANHA_FIM = "12:00:00" // exclusivo
const TARDE_INICIO = "13:00:00"
const TARDE_FIM = "17:40:00" // inclusivo

/**
 * Turno clínico do paciente: "manhã" (08:00–12:00), "tarde" (13:00–17:40) ou
 * "ambos" quando há sessão clínica nas duas janelas — sinalizar no card, pedido
 * do plano. `null` sem nenhuma sessão clínica com horário legível.
 *
 * Só considera linhas clínicas (fora de `ABA_EXT`) — ambiente natural tem
 * horário próprio, fora dessa pergunta.
 */
export function turnoClinico(rows: LinhaGradePdi[]): TurnoClinico {
  let manha = false
  let tarde = false
  for (const r of rows) {
    if (!ehClinica(r) || !r.hora_inicial) continue
    if (r.hora_inicial >= MANHA_INICIO && r.hora_inicial < MANHA_FIM) manha = true
    else if (r.hora_inicial >= TARDE_INICIO && r.hora_inicial <= TARDE_FIM) tarde = true
  }
  if (manha && tarde) return "ambos"
  if (manha) return "manhã"
  if (tarde) return "tarde"
  return null
}

/** Alguma sessão agendada em ambiente natural (Casa/Escola). */
export function temAgendamentoAmbienteNatural(rows: LinhaGradePdi[]): boolean {
  return rows.some((r) => !!r.terapia_nome && ABA_EXT.has(r.terapia_nome))
}

// Siglas de Aplicador ABA citadas no plano: PS, EF, SF, AE, HS + AV (a sexta,
// achada em TERAPIA_TO_ESP/ESP_CLINICO — ver constants.ts).
const SIGLAS_APLICADOR_ABA = ["PS", "EF", "SF", "AE", "HS", "AV"] as const
type SiglaAplicadorAba = (typeof SIGLAS_APLICADOR_ABA)[number]
/** `"Aplicador ABA (PS)"` → `"PS"` — o inverso do template usado em `NOMES_APLICADOR_ABA`. */
const SIGLA_POR_NOME = new Map<string, SiglaAplicadorAba>(
  SIGLAS_APLICADOR_ABA.map((s) => [`Aplicador ABA (${s})`, s]),
)
const NOMES_APLICADOR_ABA = new Set(SIGLA_POR_NOME.keys())

/** Um Aplicador ABA distinto, os dias em que atende e a(s) sigla(s) de terapia. */
export interface AplicadorPdi {
  profissionalId: number
  nome: string
  dias: string[]
  /**
   * Siglas de terapia deste profissional para este paciente — PS, EF, SF, AE,
   * HS ou AV (ver `SIGLAS_APLICADOR_ABA`). Pedido do usuário (05/09/2026): o
   * modal já mostrava QUEM é o aplicador, faltava dizer QUAL sigla (o mesmo
   * profissional pode atuar em mais de uma, daí ser um array, não um único
   * valor). Ordenado na mesma ordem de `SIGLAS_APLICADOR_ABA`.
   */
  siglas: SiglaAplicadorAba[]
}

/**
 * Aplicadores ABA distintos na agenda do paciente, com nome, dias e sigla —
 * pedido do usuário (05/09/2026): o card já mostrava só a CONTAGEM
 * (`quantidadeAplicadores` abaixo), o modal de detalhe passou a mostrar QUEM
 * são e QUAL sigla cada um faz. `nome` cai pro `profissional_id` quando a
 * linha não tem `profissional_nome` (não deveria faltar na prática, mas evita
 * "undefined" na tela). Ordenado por nome, cada lista de dias na ordem de
 * `DIAS_LIST`.
 */
export function aplicadoresDetalhados(rows: LinhaGradePdi[]): AplicadorPdi[] {
  const porId = new Map<number, { nome: string; dias: Set<string>; siglas: Set<SiglaAplicadorAba> }>()
  for (const r of rows) {
    if (r.profissional_id === null || !r.terapia_nome) continue
    const sigla = SIGLA_POR_NOME.get(r.terapia_nome)
    if (!sigla) continue
    const atual = porId.get(r.profissional_id) ?? {
      nome: r.profissional_nome?.trim() || `Profissional ${r.profissional_id}`,
      dias: new Set<string>(),
      siglas: new Set<SiglaAplicadorAba>(),
    }
    if (r.dia_semana) atual.dias.add(r.dia_semana)
    atual.siglas.add(sigla)
    porId.set(r.profissional_id, atual)
  }
  return [...porId.entries()]
    .map(([profissionalId, v]) => ({
      profissionalId,
      nome: v.nome,
      dias: [...v.dias].sort(
        (a, b) => (DIAS_ORD[a] ?? DIAS_LIST.length) - (DIAS_ORD[b] ?? DIAS_LIST.length),
      ),
      siglas: SIGLAS_APLICADOR_ABA.filter((s) => v.siglas.has(s)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** Quantidade de profissionais DISTINTOS atuando como Aplicador ABA na agenda do paciente. */
export function quantidadeAplicadores(rows: LinhaGradePdi[]): number {
  return aplicadoresDetalhados(rows).length
}

/** `AAAA-MM-01`..`AAAA-MM-07` do mês SEGUINTE a `hojeIso`. */
function primeiraSemanaDoMesSeguinte(hojeIso: string): { inicio: string; fim: string } {
  const [ano, mes] = hojeIso.slice(0, 10).split("-").map(Number)
  const mesSeguinte = mes === 12 ? 1 : mes + 1
  const anoDoMesSeguinte = mes === 12 ? ano + 1 : ano
  const prefixo = `${anoDoMesSeguinte}-${String(mesSeguinte).padStart(2, "0")}`
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-07` }
}

/** Um Coordenador de Caso distinto (profissional_id + nome) — ver `coordenadoresDetalhados`. */
export interface CoordenadorPdi {
  profissionalId: number
  nome: string
}

/**
 * Profissionais distintos escalados como "Coordenador de Caso" na primeira
 * semana do mês SEGUINTE a `hojeIso`, com nome — mesma janela/filtro de
 * `coordenadorDoCaso` (que agora reaproveita esta função, mesmo padrão de
 * `quantidadeAplicadores`/`aplicadoresDetalhados`), devolvendo também
 * `profissional_nome` (pedido do "PDI - Painel por Analista": precisa do
 * NOME do coordenador, não só do ID). `nome` cai pro `Profissional ${id}`
 * quando a linha não tem `profissional_nome` — mesmo fallback de
 * `aplicadoresDetalhados`. NUNCA agrupa por nome, só por `profissional_id` —
 * mesmo motivo de `coordenadorDoCaso` (grafias variantes do mesmo
 * profissional na agenda).
 */
export function coordenadoresDetalhados(rows: LinhaGradePdi[], hojeIso: string): CoordenadorPdi[] {
  const { inicio, fim } = primeiraSemanaDoMesSeguinte(hojeIso)
  const porId = new Map<number, string>()
  for (const r of rows) {
    if (r.terapia_nome !== "Coordenador de Caso") continue
    if (!r.data || r.data < inicio || r.data > fim) continue
    if (r.profissional_id === null) continue
    if (!porId.has(r.profissional_id)) {
      porId.set(r.profissional_id, r.profissional_nome?.trim() || `Profissional ${r.profissional_id}`)
    }
  }
  return [...porId.entries()].map(([profissionalId, nome]) => ({ profissionalId, nome }))
}

/**
 * Profissionais distintos escalados como "Coordenador de Caso" na primeira
 * semana do mês SEGUINTE a `hojeIso` — a agenda de coordenação é lançada com
 * antecedência, então olhar o mês corrente já seria tarde demais para agir.
 *
 * Devolve a lista de `profissional_id` distintos: comprimento 0 = coordenador
 * ausente, 1 = ok, >1 = duplicado (nomeação em disputa). NUNCA agrupa por
 * nome — a agenda tem grafias variantes do mesmo profissional (ver o
 * comentário de `ProfissionalId` em types/cronograma.ts).
 */
export function coordenadorDoCaso(rows: LinhaGradePdi[], hojeIso: string): number[] {
  return coordenadoresDetalhados(rows, hojeIso).map((c) => c.profissionalId)
}

/**
 * Existe QUALQUER sessão (de qualquer terapia, não só ABA) na primeira semana
 * do mês SEGUINTE a `hojeIso` — critério de "paciente ativo" pedido pelo
 * usuário (05/09/2026) para o "PDI - Painel por Analista": "como saber se ele
 * é ativo? se ele tem no mínimo uma sessão agendada (mesmo que não seja de
 * Psicologia ABA) no csv_grade_profissionais na primeira semana do mês
 * subsequente". Mesma janela de `coordenadoresDetalhados`/`coordenadorDoCaso`
 * (a agenda do mês seguinte já lançada, olhar o mês corrente seria tarde
 * demais) — mas SEM filtrar terapia, e DISTINTO de `temAgendamentoFuturo`
 * (que olha a janela inteira já buscada pelo chamador, ~45 dias a partir de
 * hoje, e é o sinal de "Ativo" da tela de Controle de Prazos/`ativoNaGrade`).
 * Os dois critérios de atividade convivem: cada tela usa o que faz sentido
 * para ela.
 */
export function temAgendamentoPrimeiraSemanaMesSeguinte(rows: LinhaGradePdi[], hojeIso: string): boolean {
  const { inicio, fim } = primeiraSemanaDoMesSeguinte(hojeIso)
  return rows.some((r) => r.data !== null && r.data >= inicio && r.data <= fim)
}
