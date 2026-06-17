"use client"

import { B, PBADGE, REGRAS_LEGENDA } from "@/lib/cronograma/constants"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"

const PRIO_INFO = [
  [1, "🔴", "P1 – Liminar + Conv não-ASSIM/LEVE", "Máxima urgência. Judicial + convênio de alto valor."],
  [2, "🟠", "P2 – Outro Convênio · sem judicial", "SulAmérica, Bradesco, Unimed, Amil, Particular etc."],
  [3, "🟡", "P3 – Liminar + ASSIM", "Judicial, mas convênio ASSIM (menor valor)."],
  [4, "🔵", "P4 – ASSIM · sem judicial", "Convênio ASSIM sem marcação judicial."],
  [5, "🟢", "P5 – LEVE · por último", "Elegível AE/HS."],
] as const

const MODULO_TABS = [
  {
    grupo: "Módulo Saída de Profissional",
    cor: B.purple,
    corLt: B.purpleLt,
    icon: "🚪",
    desc: "Gerencia os impactos quando um profissional se desliga ou reduz carga. Sugere substituições e remanejamentos preservando as regras de cronograma (R2.1 mínimo 2 sessões/dia, R5.1 sem gap entre clínicas).",
    abas: [
      { nome: "Saída de Profissional", icon: "🚪", desc: "Lista as sessões afetadas pelo profissional que sai. Para cada uma, o sistema sugere estratégias: E1 (mesmo horário, novo prof), E2 (novo dia/hora), E3 (terapia complementar). Clicar em 'Aceitar (→ Acompanhamento)' registra a proposta na aba de Acompanhamento." },
      { nome: "Simulação de Novo Prestador", icon: "🧪", desc: "Testa um novo profissional hipotético: preenche os horários vagos com candidatos reais do algoritmo, validando R2.1 e R5.1 antes de qualquer decisão real." },
      { nome: "Aumentar Ocupação (Prof.)", icon: "📈", desc: "Foca em maximizar a agenda de um profissional específico: encontra pacientes com gap de autorização que caibam nos horários livres daquele profissional." },
      { nome: "Aumentar Ocupação (Pac.)", icon: "🎯", desc: "Foca em um paciente específico: encontra slots disponíveis com profissionais habilitados para as especialidades com gap de autorização." },
      { nome: "Novo Cronograma", icon: "📋", desc: "Modo completo: constrói um cronograma do zero para novos pacientes ou quando há reorganização ampla da clínica." },
    ],
  },
  {
    grupo: "Módulo Aumentar Ocupação (Clínica)",
    cor: B.blue,
    corLt: B.blueLt,
    icon: "📋",
    desc: "Analisa toda a grade CSV + laudos e identifica automaticamente quais pacientes têm gap de autorização e quais profissionais têm slots livres compatíveis. As sugestões são priorizadas por P1–P5.",
    abas: [
      { nome: "Aumentar Ocupação (Clínica)", icon: "📋", desc: "Lista as vagas a oferecer imediatamente (P1–P3, R1–R3) e a fila de espera (R4 — requer coordenação prévia). Para cada vaga: 'Ver' abre o cronograma do paciente, 'Aceitar (→ Acompanhamento)' envia para acompanhamento." },
      { nome: "Diferença: Laudo e Oferta", icon: "📊", desc: "Tabela com o gap por paciente/especialidade: quantas sessões são autorizadas no laudo vs. quantas estão sendo ofertadas na grade. Útil para priorizar abordagens." },
    ],
  },
  {
    grupo: "Acompanhamento",
    cor: B.orange,
    corLt: B.orangeLt,
    icon: "📬",
    desc: "Central de controle de todas as propostas enviadas para responsáveis — independente de qual módulo originou. Aqui ficam os controles de 'Responsável Confirmou', 'Recusou' e 'Inviável'.",
    abas: [
      { nome: "Aguardando Resposta", icon: "⏳", desc: "Propostas enviadas para o responsável ainda sem resposta. Mostra itens de TODAS as origens (Aumentar Ocupação e Saída de Profissional) com badge de origem. Filtro por origem disponível." },
      { nome: "Recusados", icon: "❌", desc: "Combinações (paciente + horário + profissional) recusadas pela família. O algoritmo não volta a sugerir essas combinações nas próximas rodadas." },
      { nome: "Inviáveis", icon: "⛔", desc: "Pacientes cuja situação torna qualquer encaixe inviável no momento. O algoritmo bloqueia o paciente inteiro enquanto ele estiver nessa lista." },
    ],
  },
]

const FLUXO = [
  { step: "1", icon: "📁", label: "Carregar dados", desc: "Faça upload do CSV de grade (exportado do TitaTherapy) e do relatório de laudos/autorizações. O sistema processa automaticamente." },
  { step: "2", icon: "🔍", label: "Escolher módulo", desc: "Use 'Aumentar Ocupação (Clínica)' para visão geral de gaps, ou os módulos de Saída de Profissional para situações específicas." },
  { step: "3", icon: "✅", label: "Aceitar sugestão", desc: "Clique em 'Aceitar (→ Acompanhamento)'. A vaga fica reservada e aparece na aba Acompanhamento > Aguardando Resposta." },
  { step: "4", icon: "📲", label: "Contatar família", desc: "Envie a mensagem via WhatsApp. O registro já está no Acompanhamento." },
  { step: "5", icon: "📬", label: "Registrar resposta", desc: "Na aba Acompanhamento: 'Responsável Confirmou' (encerra o caso), 'Recusou' (libera a sessão + bloqueia a combinação) ou 'Inviável' (bloqueia o paciente)." },
  { step: "6", icon: "🔄", label: "Nova rodada", desc: "Carregue o CSV atualizado. Recusados e Inviáveis persistem automaticamente. A sessão do recusado aparece disponível para o próximo candidato." },
]

interface Props {
  apiFetch: boolean
  apiErr: string
  onApiFetch: () => Promise<void>
}

const card: React.CSSProperties = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }

export function GuiaTab({ apiFetch, apiErr, onApiFetch }: Props) {
  const { cfg, sCfg } = useCronogramaData()
  const refWeek = getRefWeek()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Fluxo de trabalho */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "16px", marginBottom: "12px" }}>🗺️ Fluxo de Trabalho</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {FLUXO.map(f => (
            <div key={f.step} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 12px", background: "#fafafa", borderRadius: "10px", border: "1px solid #f0f0f0" }}>
              <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: B.blue, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>
                {f.step}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: B.navy, marginBottom: "2px" }}>{f.icon} {f.label}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.5" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Módulos e abas */}
      {MODULO_TABS.map(m => (
        <div key={m.grupo} style={{ ...card, borderLeft: `4px solid ${m.cor}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "18px" }}>{m.icon}</span>
            <div style={{ fontWeight: 900, color: m.cor, fontSize: "15px" }}>{m.grupo}</div>
          </div>
          <div style={{ fontSize: "12px", color: "#374151", lineHeight: "1.6", marginBottom: "12px", padding: "8px 10px", background: m.corLt, borderRadius: "8px" }}>
            {m.desc}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {m.abas.map(a => (
              <div key={a.nome} style={{ display: "flex", gap: "10px", padding: "10px 12px", background: "#fafafa", borderRadius: "10px", border: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: "16px", flexShrink: 0 }}>{a.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "12px", color: B.navy, marginBottom: "3px" }}>{a.nome}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.5" }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sistema de Prioridade P1–P5 */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: B.navy, marginBottom: "10px", fontSize: "14px" }}>📊 Sistema de Prioridade P1–P5</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {PRIO_INFO.map(([p, ic, lb, d]) => {
            const s = PBADGE[p as number]
            return (
              <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", background: s.bg, borderRadius: "10px", border: `1px solid ${s.border}22` }}>
                <span style={{ fontSize: "18px" }}>{ic}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: s.color }}>{lb}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>{d}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legenda Regras */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "15px", marginBottom: "4px" }}>📖 Como surgiu cada sugestão (Regras)</div>
        <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "12px" }}>Exibida no badge "Regra" de cada card em Aumentar Ocupação (Clínica).</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {REGRAS_LEGENDA.map(({ r, c, title, desc }) => (
            <div key={r} style={{ display: "flex", gap: "12px", padding: "12px", background: "#fafafa", borderRadius: "10px", border: "1px solid #f0f0f0" }}>
              <div style={{ flexShrink: 0, paddingTop: "1px" }}>
                <span style={{ background: c, color: "white", borderRadius: "8px", padding: "3px 9px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" }}>{r}</span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: B.navy, marginBottom: "3px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regras de cronograma críticas */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "15px", marginBottom: "12px" }}>⚠️ Regras Críticas do Cronograma</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { code: "R2.1", color: "#dc2626", bg: "#fef2f2", bd: "#fca5a5", title: "Mínimo 2 sessões clínicas por dia", desc: "Responsáveis não vêm à clínica para uma única sessão. O sistema nunca sugere uma sessão que resultaria em 1 sessão isolada num dia — tanto no dia de origem quanto no dia de destino da mudança. Exceções devem ser registradas manualmente no documento de regras (Tópico 3)." },
            { code: "R5.1", color: "#7c3aed", bg: "#f5f3ff", bd: "#c4b5fd", title: "Nenhum gap entre sessões clínicas", desc: "Sessões consecutivas dentro do mesmo turno têm exatamente 40 min de diferença. Gap entre turnos (ex: 11:20 → 13:00) é normal e não é violação. Horários válidos: manhã 08:00/08:40/09:20/10:00/10:40/11:20 · tarde 13:00/13:40/14:20/15:00/15:40/16:20/17:00." },
            { code: "R5.4", color: "#b45309", bg: "#fff7ed", bd: "#fed7aa", title: "Profissional e paciente — unidade por turno", desc: "Um profissional trabalha numa unidade por turno. Um paciente não pode mudar de unidade dentro do mesmo turno. Exceções existentes devem estar registradas." },
          ].map(({ code, color, bg, bd, title, desc }) => (
            <div key={code} style={{ display: "flex", gap: "12px", padding: "12px", background: bg, borderRadius: "10px", border: `1px solid ${bd}` }}>
              <span style={{ flexShrink: 0, background: color, color: "white", borderRadius: "8px", padding: "3px 8px", fontSize: "11px", fontWeight: 800, height: "fit-content" }}>{code}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color, marginBottom: "3px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Convênios e elegibilidade AE/HS */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "15px", marginBottom: "12px" }}>💳 Convênios e Elegibilidade AE/HS</div>
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6", marginBottom: "10px" }}>
          Alguns convênios permitem Aplicador ABA em Escola/Casa (AE) e Habilidades Sociais (HS) simultaneamente com a sessão clínica. Isso afeta as sugestões complementares (R3).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {[
            { conv: "ASSIM Saúde",    elegivel: false, obs: "Paga 1 sessão por horário. AE/HS só com autorização explícita no laudo." },
            { conv: "Gratuidade",     elegivel: false, obs: "Inelegível para AE e HS." },
            { conv: "Particular",     elegivel: false, obs: "Inelegível para AE e HS." },
            { conv: "SulAmérica, Bradesco, Porto Seguro, Unimed, Amil, Leve Saúde", elegivel: true, obs: "Elegíveis para AE/HS." },
          ].map(({ conv, elegivel, obs }) => (
            <div key={conv} style={{ display: "flex", gap: "10px", padding: "8px 12px", background: elegivel ? B.limeLt : "#f8fafc", borderRadius: "8px", border: `1px solid ${elegivel ? B.lime : "#e5e7eb"}` }}>
              <span style={{ fontSize: "12px", fontWeight: 700, flexShrink: 0, color: elegivel ? "#4a6e20" : "#6b7280" }}>{elegivel ? "✅" : "❌"} {conv}</span>
              <span style={{ fontSize: "11px", color: "#6b7280" }}>{obs}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API TitaTherapy */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: B.navy, marginBottom: "4px", fontSize: "14px" }}>🔌 Token da API TitaTherapy</div>
        <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
          Semana de referência automática: <strong>{refWeek.label}</strong>. CORS pode bloquear chamadas diretas do browser — use upload manual se necessário.
        </div>
        <input
          value={cfg.apiToken || ""}
          onChange={e => sCfg({ ...cfg, apiToken: e.target.value })}
          placeholder="Cole aqui seu X-INTEGRACAO-TOKEN"
          type="password"
          style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", width: "100%", fontFamily: "monospace", boxSizing: "border-box", marginBottom: "10px" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>Próxima referência:</span>
          <span style={{ fontSize: "13px", fontWeight: 800, color: B.blue }}>{refWeek.label}</span>
          <button onClick={onApiFetch} disabled={apiFetch}
            style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "8px", background: B.blue, color: "white", border: "none", cursor: apiFetch ? "default" : "pointer", fontFamily: "inherit", fontWeight: 700, opacity: apiFetch ? 0.7 : 1 }}>
            {apiFetch ? "⏳ Buscando..." : "⬇ Buscar da API"}
          </button>
        </div>
        {apiErr && (
          <div style={{ marginTop: "8px", background: "#fff7ed", border: "1px solid #fed7aa44", borderRadius: "10px", padding: "8px 12px", fontSize: "12px", color: "#c2410c" }}>
            {apiErr}
          </div>
        )}
      </div>

    </div>
  )
}
