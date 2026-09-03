import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

function getCorsHeaders(requestOrigin: string) {
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin)
  return isAllowed
    ? {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

// Retorna o último dia útil do mês seguinte no fuso de São Paulo.
function getLastBusinessDayOfNextMonth(): string {
  const agora   = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  // Dia 0 do mês (getMonth()+2) = último dia do mês seguinte
  const lastDay = new Date(agora.getFullYear(), agora.getMonth() + 2, 0)
  const dow     = lastDay.getDay()
  if (dow === 0) lastDay.setDate(lastDay.getDate() - 2) // domingo → sexta
  else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1) // sábado → sexta
  return lastDay.toISOString().slice(0, 10)
}

// Retorna todos os dias úteis de hoje até o último dia útil do mês seguinte.
function getBusinessDaysUntilEndOfNextMonth(): string[] {
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const fim   = new Date(getLastBusinessDayOfNextMonth())
  const datas: string[] = []
  const d = new Date(agora.toISOString().slice(0, 10))
  while (d <= fim) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) datas.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return datas
}

function normalizarDataNascimento(valor: unknown): string | null {
  if (!valor) return null
  const texto = String(valor).trim()
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}`).toISOString().slice(0, 10)
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).toISOString().slice(0, 10)
  return null
}

// CPF só com dígitos (a TiTa às vezes devolve formatado "127.251.677-60" e às
// vezes cru "22444646797"). Normalizar evita duplicidade de formato e permite
// comparar valor a valor no refresh de demografia.
function normalizarCpf(valor: unknown): string | null {
  if (!valor) return null
  const digitos = String(valor).replace(/\D/g, "")
  return digitos.length > 0 ? digitos : null
}

// Só os dígitos, para comparar CPF armazenado (possivelmente formatado) com o
// valor cru vindo da TiTa sem disparar update por diferença de formato.
function apenasDigitos(valor: unknown): string | null {
  if (valor == null) return null
  const d = String(valor).replace(/\D/g, "")
  return d.length > 0 ? d : null
}

// Compara data (armazenada como date/string) com ISO YYYY-MM-DD.
function isoData(valor: unknown): string | null {
  if (valor == null) return null
  return String(valor).slice(0, 10)
}

// Compara dois valores anuláveis convertendo para string.
const eq = (a: unknown, b: unknown): boolean => {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}

// Normaliza hora para HH:MM para comparação segura (08:00 == 08:00:00).
const hhMM = (t: unknown): string | null =>
  t != null ? String(t).slice(0, 5) : null

// Parser de linha CSV respeitando campos entre aspas.
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let insideQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else insideQuotes = !insideQuotes
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim()); current = ""
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// Busca dados complementares de um paciente em agenda_orbita, agenda_tita ou autorizacoes_assim
async function buscarDadosPaciente(
  pacienteNome: string,
  pacienteId: number | null,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const dados: Record<string, unknown> = {
    numero_carteirinha: null,
    crm: null,
    nome_medico: null,
  }

  try {
    // Prioridade 1: Buscar em agenda_orbita
    let query = supabase.from("agenda_orbita").select("crm, nome_medico, matricula, empresa, dep")

    if (pacienteId) {
      query = query.eq("paciente_id", String(pacienteId))
    } else {
      query = query.eq("paciente_nome", pacienteNome)
    }

    const { data: orbita } = await query.limit(1).maybeSingle()

    if (orbita) {
      const empresa = (orbita.empresa || "").padEnd(6, "0").slice(0, 6)
      const matricula = (orbita.matricula || "").padEnd(7, "0").slice(0, 7)
      const dep = (orbita.dep || "").padEnd(2, "0").slice(0, 2)
      dados.numero_carteirinha = `${empresa}${matricula}${dep}`
      dados.crm = orbita.crm || null
      dados.nome_medico = orbita.nome_medico || null
      return dados
    }

    // Prioridade 2: Buscar registros anteriores em agenda_tita que já têm numero_carteirinha
    let query2 = supabase.from("agenda_tita").select("numero_carteirinha, crm, nome_medico").eq("ativo", true)

    if (pacienteId) {
      query2 = query2.eq("paciente_id", pacienteId)
    } else {
      query2 = query2.eq("paciente_nome", pacienteNome)
    }

    const { data: registrosAntigos } = await query2.limit(1).maybeSingle()

    if (registrosAntigos?.numero_carteirinha) {
      dados.numero_carteirinha = registrosAntigos.numero_carteirinha
      dados.crm = registrosAntigos.crm || null
      dados.nome_medico = registrosAntigos.nome_medico || null
      return dados
    }

    // Prioridade 3: Buscar em autorizacoes_assim como último recurso
    let query3 = supabase.from("autorizacoes_assim").select("matricula, paciente_id")

    if (pacienteId) {
      query3 = query3.eq("paciente_id", pacienteId)
    } else {
      query3 = query3.eq("paciente_nome", pacienteNome)
    }

    const { data: autorizado } = await query3.limit(1).maybeSingle()

    if (autorizado?.matricula) {
      const matricula = (autorizado.matricula || "").padEnd(7, "0").slice(0, 7)
      dados.numero_carteirinha = `000000${matricula}00`
    }
  } catch (err) {
    console.warn(`[buscarDadosPaciente] Erro ao buscar dados para ${pacienteNome}:`, err)
  }

  return dados
}

// Suplementa o mapa `incoming` com sessões do endpoint csv_grade_profissionais
// que o endpoint JSON não retorna (status "Realizado" já atendidas no dia).
// Restrito a data === hoje para evitar chamadas desnecessárias em datas futuras.
async function enrichIncomingFromCSV(
  data: string,
  hoje: string,
  incoming: Map<number, Record<string, unknown>>,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  if (data > hoje) return 0 // futuro: JSON já cobre tudo

  const res = await fetch(
    "https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
      body: JSON.stringify({ data_inicio: data, data_fim: data, unidade: 280 }),
    },
  )
  if (!res.ok) {
    console.warn(`[sync_tita_agenda] CSV enrichment: API returned ${res.status} for ${data}`)
    return 0
  }

  const csvText = await res.text()
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return 0

  const hdrs = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const col  = (name: string) => hdrs.indexOf(name)

  const iId        = col("id agendamento")
  const iFavId     = col("id favorecido")
  const iFavNome   = col("nome favorecido")
  const iData      = col("data")
  const iHoraIni   = col("hora inicial")
  const iHoraFim   = col("hora final")
  const iProfId    = col("id profissional")
  const iProfNome  = col("profissional")
  const iProfCpf   = col("cpf do profissional")
  const iTerapId   = col("id terapia")
  const iTerapNome = col("terapia")
  const iTerapExId = col("id terapia exibição")
  const iTerapExNm = col("terapia exibição")
  const iSalaId    = col("id sala")
  const iSalaNome  = col("sala")
  const iSalaObs   = col("observações da sala")
  const iCliId     = col("id unidade")
  const iCliNome   = col("nome unidade")
  const iConvenio  = col("convênio")
  const iStatus    = col("status")

  if (iId < 0 || iFavNome < 0 || iStatus < 0) return 0

  const v = (vals: string[], i: number) => (i >= 0 ? vals[i]?.trim() ?? "" : "")
  const n = (vals: string[], i: number) => { const s = v(vals, i); return s ? parseInt(s) : null }

  let enriched = 0

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    const agIdStr = v(vals, iId)
    if (!agIdStr) continue

    const agId = parseInt(agIdStr)
    if (!agId || incoming.has(agId)) continue

    // Apenas sessões já atendidas (Realizado) que o JSON não retorna.
    // Cancelado (Falta do Paciente) e Livre (vago) são ignorados.
    const status = v(vals, iStatus)
    if (status !== "Realizado" && status !== "Em Conflito") continue

    const pacienteNome = v(vals, iFavNome)
    if (!pacienteNome) continue

    const dataAtend = v(vals, iData) || data
    const pacienteId = n(vals, iFavId)

    // Busca dados complementares (numero_carteirinha, crm, nome_medico)
    const dadosPaciente = await buscarDadosPaciente(pacienteNome, pacienteId, supabase)

    const r: Record<string, unknown> = {
      tita_agendamento_id:   agId,
      origem:                "tita_csv",
      data_atendimento:      dataAtend,
      hora_inicial:          v(vals, iHoraIni) || null,
      hora_final:            v(vals, iHoraFim) || null,
      paciente_id:           pacienteId,
      paciente_nome:         pacienteNome,
      cpf:                   null,
      data_nascimento:       null,
      profissional_id:       n(vals, iProfId),
      profissional_nome:     v(vals, iProfNome) || null,
      profissional_cpf:      v(vals, iProfCpf) || null,
      terapia_id:            n(vals, iTerapId),
      terapia_nome:          v(vals, iTerapNome) || null,
      terapia_exibicao_id:   n(vals, iTerapExId),
      terapia_exibicao_nome: v(vals, iTerapExNm) || null,
      sala_id:               n(vals, iSalaId),
      sala_nome:             v(vals, iSalaNome) || null,
      sala_observacoes:      v(vals, iSalaObs) || null,
      clinica_id:            n(vals, iCliId),
      clinica_nome:          v(vals, iCliNome) || null,
      convenio_id:           null,
      convenio_nome:         v(vals, iConvenio) || null,
      numero_carteirinha:    dadosPaciente.numero_carteirinha,
      responsavel_nome:      null,
      responsavel_telefone:  null,
      responsavel_email:     null,
      atividade:             null,
      ativo:                 true,
      motivo_inativacao:     null,
      raw_json:              { source: "csv_grade_profissionais", status_csv: status },
      updated_at:            new Date().toISOString(),
      crm:                   dadosPaciente.crm,
      nome_medico:           dadosPaciente.nome_medico,
    }

    incoming.set(agId, r)
    enriched++
    const cartInfo = dadosPaciente.numero_carteirinha ? "✅" : "❌"
    console.log(`[sync_tita_agenda] CSV+: ${agId} ${pacienteNome} ${v(vals, iHoraIni)} [${status}] ${cartInfo}`)
  }

  return enriched
}

async function sincronizarData(
  data: string,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const response = await fetch(
    `https://apiv2.apptita.com.br/api/integracao/agendamento?date=${data}&unidade=280`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRACAO-TOKEN": TITA_TOKEN,
      },
    },
  )

  if (!response.ok) {
    const erro = await response.text()
    throw new Error(`TITA API error for ${data}: ${erro}`)
  }

  const rawData = await response.json()
  const agendas = (rawData as any[]).flatMap((grupo: any) => grupo.agenda_favorecido || [])


  // Monta mapa dos registros vindos do TiTa: tita_agendamento_id → registro
  const incoming = new Map<number, Record<string, unknown>>()
  for (const a of agendas) {
    const familiar = a.favorecido?.familiares?.[0]
    const vinculo  = a.favorecido?.vinc_fav_clinica?.[0]
    const r: Record<string, unknown> = {
      tita_agendamento_id:   a.id,
      origem:                a.origem,
      data_atendimento:      a.data?.split("/")?.reverse()?.join("-"),
      hora_inicial:          a.hora_inicial,
      hora_final:            a.hora_final,
      paciente_id:           a.favorecido?.id           ?? null,
      paciente_nome:         a.favorecido?.nome         ?? null,
      cpf:                   normalizarCpf(a.favorecido?.cpf),
      data_nascimento:       normalizarDataNascimento(a.favorecido?.data_nascimento),
      profissional_id:       a.profissional?.id         ?? null,
      profissional_nome:     a.profissional?.name       ?? null,
      profissional_cpf:      a.profissional?.cpf        ?? null,
      terapia_id:            a.terapia?.id              ?? null,
      terapia_nome:          a.terapia?.nome            ?? null,
      terapia_exibicao_id:   a.terapiaExibicao?.id      ?? null,
      terapia_exibicao_nome: a.terapiaExibicao?.nome    ?? null,
      sala_id:               a.sala?.id                 ?? null,
      sala_nome:             a.sala?.nome_sala          ?? null,
      sala_observacoes:      a.sala?.observacoes        ?? null,
      clinica_id:            a.clinica?.id              ?? null,
      clinica_nome:          a.clinica?.nome            ?? null,
      convenio_id:           vinculo?.plano?.id         ?? null,
      convenio_nome:         vinculo?.plano?.nome       ?? null,
      numero_carteirinha:    vinculo?.numero_carteirinha ?? null,
      responsavel_nome:      familiar?.nome             ?? null,
      responsavel_telefone:  familiar?.celular          ?? null,
      responsavel_email:     familiar?.email            ?? null,
      atividade:             a.atividade                ?? null,
      ativo:                 true,
      motivo_inativacao:     null,
      raw_json:              a,
      updated_at:            new Date().toISOString(),
    }
    if (r.tita_agendamento_id != null) {
      incoming.set(r.tita_agendamento_id as number, r)
    }
  }

  // Enriquece incoming com sessões "Realizado" do CSV que o JSON omite
  const hojeParaCSV = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    .toISOString().slice(0, 10)
  const enriched = await enrichIncomingFromCSV(data, hojeParaCSV, incoming, supabase)
  if (enriched > 0) {
    console.log(`[sync_tita_agenda] CSV enrichment: +${enriched} sessões adicionadas para ${data}`)
  }

  // Busca registros ativos existentes para esta data
  const { data: existentes, error: fetchError } = await supabase
    .from("agenda_tita")
    .select("id, tita_agendamento_id, paciente_id, profissional_id, terapia_id, sala_id, hora_inicial, hora_final, cpf, data_nascimento, numero_carteirinha, convenio_id, convenio_nome")
    .eq("data_atendimento", data)
    .eq("ativo", true)

  if (fetchError) throw fetchError

  const existenteMap = new Map<number, any>(
    (existentes || []).map((e: any) => [e.tita_agendamento_id as number, e]),
  )

  const novos: Record<string, unknown>[] = []
  const inutilizarAlterado: number[] = []
  const inutilizarExcluido: number[] = []
  const atualizarComDadosFaltantes: Array<{ id: number; paciente_nome: string; paciente_id: number | null }> = []
  const atualizarDemografia: Array<{
    id: number
    cpf?: string | null
    data_nascimento?: string | null
    convenio_id?: number | null
    convenio_nome?: string | null
    raw_json: unknown
  }> = []

  // Processa registros vindos do TiTa
  for (const [titaId, reg] of incoming) {
    const existente = existenteMap.get(titaId)

    if (!existente) {
      novos.push(reg)
    } else {
      const mudou =
        !eq(existente.paciente_id,    reg.paciente_id)    ||
        !eq(existente.profissional_id, reg.profissional_id) ||
        !eq(existente.terapia_id,     reg.terapia_id)     ||
        !eq(existente.sala_id,        reg.sala_id)        ||
        hhMM(existente.hora_inicial) !== hhMM(reg.hora_inicial) ||
        hhMM(existente.hora_final)   !== hhMM(reg.hora_final)

      if (mudou) {
        inutilizarAlterado.push(existente.id)
        novos.push(reg)
      } else {
        // Sem mudança estrutural: NÃO reinsere. Mas refresca o cadastro se a
        // TiTa trouxe valor não-nulo diferente do armazenado — ele pode ter sido
        // corrigido na origem depois da 1ª captura (CPF trocado, nascimento
        // ajustado, plano de saúde alterado). Sem isso, linhas antigas ficam
        // congeladas para sempre com o valor velho/nulo e o /solicitar mostra
        // dado divergente.
        const cpfNovo  = reg.cpf as string | null            // já normalizado (só dígitos)
        const nascNovo = reg.data_nascimento as string | null // ISO YYYY-MM-DD
        const precisaCpf  = cpfNovo  != null && cpfNovo  !== apenasDigitos(existente.cpf)
        const precisaNasc = nascNovo != null && nascNovo !== isoData(existente.data_nascimento)

        // O convênio segue a MESMA regra, e pelo mesmo motivo: ele não entra no
        // `mudou` acima (que só olha campos estruturais — paciente, profissional,
        // terapia, sala, horário), então uma troca de plano no cadastro do TiTa
        // não reinseria a linha e não era refrescada por ninguém. A linha ficava
        // congelada com o plano antigo até ser reagendada por outro motivo.
        //
        // CASO REAL (2026-09-02): BENÍCIO CALHEIROS DE OLIVEIRA BRITO (11542)
        // mudou de ASSIM Saúde para LEVE SAUDE a partir de setembro. O TiTa foi
        // atualizado em 27/08 (o MESMO vínculo 19714 editado no lugar, plano 930
        // -> 932, carteirinha inalterada), mas as 23 sessões de setembro já
        // existentes seguiam "ASSIM Saúde" no Pulsar — só outubro, criado depois
        // da troca, nasceu com LEVE. Medidos no mesmo dia: 4 pacientes e 36
        // sessões com plano divergente nos 12 dias úteis seguintes.
        //
        // Por que isso é grave e não cosmético: `convenio_nome ILIKE '%assim%'`
        // é o filtro de entrada da auditoria ASSIM e da fila de autorização.
        // Plano velho = sessão de outro convênio entrando na régua da ASSIM,
        // pedindo autorização que não existe e contando glosa que não é dela.
        const convIdNovo   = reg.convenio_id   as number | null
        const convNomeNovo = reg.convenio_nome as string | null
        // `!= null` nas duas pontas: nunca troca plano bom por nulo. A ausência
        // do vínculo no payload é lacuna de leitura, não desligamento de plano —
        // mesma cautela que o CPF/nascimento acima já tomam.
        const precisaConvNome = convNomeNovo != null && convNomeNovo !== existente.convenio_nome
        const precisaConvId   = convIdNovo   != null && convIdNovo   !== existente.convenio_id

        if (precisaCpf || precisaNasc || precisaConvNome || precisaConvId) {
          atualizarDemografia.push({
            id: existente.id,
            cpf: precisaCpf ? cpfNovo : undefined,
            data_nascimento: precisaNasc ? nascNovo : undefined,
            convenio_id: precisaConvId ? convIdNovo : undefined,
            convenio_nome: precisaConvNome ? convNomeNovo : undefined,
            raw_json: reg.raw_json,
          })
        }

        if (!existente.numero_carteirinha) {
          // Registro sem mudança estrutural, mas com dados faltantes (numero_carteirinha = NULL)
          // Tenta buscar dados complementares para preenchimento
          atualizarComDadosFaltantes.push({
            id: existente.id,
            paciente_nome: reg.paciente_nome as string,
            paciente_id: reg.paciente_id as number | null,
          })
        }
      }
      // Sem mudança e com dados completos: ignora (não regrava o registro)
    }
  }

  // Registros ativos no banco que não voltaram do TiTa → foram excluídos.
  // Só aplica para hoje ou datas futuras: o TiTa não garante retornar
  // sessões passadas completas, o que causaria inativações incorretas.
  //
  // Para hoje especificamente: o TiTa deixa de retornar sessões assim que
  // elas são atendidas (horário já passou). Sem esse guarda, o sync marcaria
  // como "excluido" sessões que foram normalmente realizadas, fazendo-as
  // desaparecer do Controle de Pacientes. Portanto, só marcamos excluido
  // sessões de hoje cujo hora_inicial ainda não passou.
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    .toISOString().slice(0, 10)
  if (data >= hoje) {
    const agoraBRT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    const horaAtual = `${String(agoraBRT.getHours()).padStart(2, "0")}:${String(agoraBRT.getMinutes()).padStart(2, "0")}`
    for (const existente of (existentes || [])) {
      if (!incoming.has(existente.tita_agendamento_id)) {
        // Para datas futuras: excluir sempre.
        // Para hoje: só excluir se a sessão ainda não começou (hora_inicial > agora).
        const sessaoJaComeçou = data === hoje && (hhMM(existente.hora_inicial) ?? "") <= horaAtual
        if (!sessaoJaComeçou) {
          inutilizarExcluido.push(existente.id)
        }
      }
    }
  }

  const agora = new Date().toISOString()

  if (inutilizarAlterado.length > 0) {
    const { error } = await supabase
      .from("agenda_tita")
      .update({ ativo: false, motivo_inativacao: "alterado", updated_at: agora })
      .in("id", inutilizarAlterado)
    if (error) throw error
  }

  if (inutilizarExcluido.length > 0) {
    const { error } = await supabase
      .from("agenda_tita")
      .update({ ativo: false, motivo_inativacao: "excluido", updated_at: agora })
      .in("id", inutilizarExcluido)
    if (error) throw error
  }

  for (let i = 0; i < novos.length; i += 100) {
    const { error } = await supabase
      .from("agenda_tita")
      .insert(novos.slice(i, i + 100))
    if (error) throw error
  }

  // Atualiza registros existentes que têm dados faltantes (numero_carteirinha = NULL)
  // NÃO grava crm/nome_medico: essas colunas NÃO existem em agenda_tita — o
  // crm/nome_medico são resolvidos na view agenda_tita_autorizacao via LATERAL
  // em agenda_orbita. Escrevê-los aqui gerava PGRST204 ("column 'crm' not found")
  // em todo sync, abortando o backfill de numero_carteirinha junto.
  for (const item of atualizarComDadosFaltantes) {
    const dadosPaciente = await buscarDadosPaciente(item.paciente_nome, item.paciente_id, supabase)
    if (dadosPaciente.numero_carteirinha) {
      const { error } = await supabase
        .from("agenda_tita")
        .update({
          numero_carteirinha: dadosPaciente.numero_carteirinha,
          updated_at: agora,
        })
        .eq("id", item.id)
      if (error) {
        console.warn(`[sync_tita_agenda] Erro ao atualizar dados faltantes para ID ${item.id}:`, error)
      } else {
        console.log(`[sync_tita_agenda] ✅ Preenchidos dados faltantes: ${item.paciente_nome} (ID: ${item.id})`)
      }
    }
  }

  // Refresca CPF/nascimento/convênio de linhas existentes cujo valor na TiTa
  // mudou. Só grava o que realmente diferiu (nunca sobrescreve valor bom com
  // nulo) e reatualiza o raw_json para o próximo diff ser fiel.
  let convenioRefrescado = 0
  for (const item of atualizarDemografia) {
    const upd: Record<string, unknown> = { updated_at: agora, raw_json: item.raw_json }
    if (item.cpf !== undefined)             upd.cpf = item.cpf
    if (item.data_nascimento !== undefined) upd.data_nascimento = item.data_nascimento
    if (item.convenio_id !== undefined)     upd.convenio_id = item.convenio_id
    if (item.convenio_nome !== undefined)   upd.convenio_nome = item.convenio_nome
    const { error } = await supabase
      .from("agenda_tita")
      .update(upd)
      .eq("id", item.id)
    if (error) {
      console.warn(`[sync_tita_agenda] Erro ao refrescar demografia ID ${item.id}:`, error)
    } else if (item.convenio_nome !== undefined) {
      // Troca de plano é evento de faturamento: fica no log com o valor novo,
      // para o dia em que alguém perguntar quando a linha virou.
      convenioRefrescado++
      console.log(`[sync_tita_agenda] 🔁 Convênio atualizado (ID ${item.id}): -> ${item.convenio_nome}`)
    }
  }
  if (atualizarDemografia.length > 0) {
    console.log(
      `[sync_tita_agenda] 🔄 Demografia atualizada: ${atualizarDemografia.length} linha(s) para ${data}` +
        (convenioRefrescado > 0 ? ` (${convenioRefrescado} com troca de convênio)` : ""),
    )
  }

  return incoming.size
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST")    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    // body: {} → sincroniza hoje até o último dia útil do mês seguinte
    // body: { "data": "YYYY-MM-DD" } → sincroniza só aquela data
    const body = await req.json().catch(() => ({})) as { data?: string }
    const datas: string[] = body.data ? [body.data] : getBusinessDaysUntilEndOfNextMonth()

    const resultados: Record<string, number> = {}
    for (const data of datas) {
      resultados[data] = await sincronizarData(data, supabase)
      console.log(`[sync_tita_agenda] ${data}: ${resultados[data]} registros`)
    }

    console.log("[sync_tita_agenda] Concluído:", resultados)
    return jsonResponse({ ok: true, datas, resultados }, 200, corsHeaders)
  } catch (err) {
    let errMsg = "Unknown error"
    let errStack = "N/A"
    try {
      if (err instanceof Error) {
        errMsg = err.message
        errStack = err.stack || "N/A"
      } else {
        errMsg = JSON.stringify(err) || String(err)
      }
    } catch {
      errMsg = "Error serialization failed"
    }
    console.error("[sync_tita_agenda] Erro:", errMsg)
    console.error("[sync_tita_agenda] Stack:", errStack)
    return jsonResponse({ error: errMsg, stack: errStack }, 500, corsHeaders)
  }
})
