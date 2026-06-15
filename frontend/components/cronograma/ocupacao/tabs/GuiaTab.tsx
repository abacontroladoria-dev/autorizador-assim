"use client"

import { B, REGRAS_LEGENDA } from "@/lib/cronograma/constants"

const card: React.CSSProperties = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }

export function GuiaTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Legenda Regras */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "16px", marginBottom: "4px" }}>📖 Legenda — Como surgiu cada sugestão</div>
        <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "14px" }}>Exibida na coluna "Regra" de cada card em Vagas Agora e Fila de Espera.</div>
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

      {/* Registrar Recusas e Inviáveis */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "16px", marginBottom: "12px" }}>📝 Como Registrar Recusas e Inviáveis</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { icon: "❌", color: "#dc2626", bg: "#fef2f2", bd: "#fca5a5", title: "Recusado", desc: "A família disse que NÃO pode naquele horário específico. Clique em '❌ Recusou' no card e confirme. Na próxima rodada o script não vai reoferecer esse par (paciente + horário + profissional). O registro fica na aba '❌ Recusados'." },
            { icon: "⛔", color: "#6b7280", bg: "#f8fafc", bd: "#e5e7eb", title: "Inviável", desc: "A situação de vida da família torna qualquer encaixe inviável agora — não foi recusa de uma vaga específica. Clique em '⛔ Inviável' e informe o motivo. O script bloqueia o paciente inteiro enquanto ele estiver na lista." },
          ].map(({ icon, color, bg, bd, title, desc }) => (
            <div key={title} style={{ display: "flex", gap: "12px", padding: "12px", background: bg, borderRadius: "10px", border: `1px solid ${bd}` }}>
              <span style={{ fontSize: "22px", flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px", color, marginBottom: "3px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rastreamento WA */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "16px", marginBottom: "12px" }}>📤 Rastreamento WhatsApp</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#374151" }}>
          <div style={{ padding: "10px", background: B.blueLt, borderRadius: "10px" }}><strong style={{ color: B.blue }}>1. Oferecer via WA</strong> — Clique quando enviar a mensagem para a família. O card muda para "⏳ Aguardando WA".</div>
          <div style={{ padding: "10px", background: B.limeLt, borderRadius: "10px" }}><strong style={{ color: "#4a6e20" }}>2. ✅ Aceito</strong> — Quando a família confirmar. O card fica marcado e esmaecido.</div>
          <div style={{ padding: "10px", background: "#fef2f2", borderRadius: "10px" }}><strong style={{ color: "#dc2626" }}>3. ❌ Recusou</strong> — Registra a recusa e bloqueia a combinação nas próximas rodadas.</div>
          <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "10px" }}><strong>Desfazer envio</strong> — Disponível enquanto status é "Aguardando WA". Clique se enviou por engano.</div>
        </div>
      </div>

      {/* Entre Rodadas */}
      <div style={card}>
        <div style={{ fontWeight: 900, color: B.navy, fontSize: "16px", marginBottom: "12px" }}>🔄 Como Usar Entre Rodadas</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#374151" }}>
          <div style={{ padding: "10px", background: B.limeLt, borderRadius: "10px" }}><strong style={{ color: "#4a6e20" }}>Nova rodada:</strong> Carregue o novo CSV de grade e o novo relatório de laudos. Os recusados, inviáveis e status WA <strong>persistem automaticamente</strong> — não precisa recriar. Use "📥 Exportar base" para backup em Excel.</div>
          <div style={{ padding: "10px", background: B.purpleLt, borderRadius: "10px" }}><strong style={{ color: B.purple }}>Garantia de slot único:</strong> Cada horário livre é oferecido para apenas 1 família por vez — o paciente de maior prioridade. Se ele recusar, o slot ficará disponível para o próximo na próxima rodada.</div>
          <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "10px" }}><strong>Exceções às regras:</strong> Registre no documento de regras, Tópico 3. A ferramenta não verifica automaticamente exceções registradas — avalie caso a caso.</div>
        </div>
      </div>

    </div>
  )
}
