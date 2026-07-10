"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { useRemuneracaoConfig } from "@/hooks/useRemuneracaoConfig"
import { fmt } from "@/lib/remuneracao/formatacao"
import { B } from "@/lib/cronograma/constants"

const ESP_ETA = "Especialista Técnico de Área"

const ABAS = [
  { k: "analise", nome: "Análise Futura" },
  { k: "ocupacao", nome: "Ocupação de Profissionais" },
  { k: "remunRP", nome: "Remun. — RP" },
  { k: "remunInd", nome: "Remun. Individual" },
  { k: "config", nome: "Config" },
  { k: "hist", nome: "Histórico" },
  { k: "leg", nome: "Legenda" },
]

const CLASSIFICACOES = [
  { label: "✅ Evolução normal", cor: B.green, recebe: "Recebe PA", cond: "Sessão da agenda deste profissional + ele mesmo evoluiu. Condição padrão de remuneração." },
  { label: "🔄 Substituição realizada", cor: B.blue, recebe: "Recebe PA", cond: "Sessão estava na agenda de outro profissional, mas este evoluiu. O PA vai para quem evoluiu." },
  { label: "⏳ Pendente retroativa", cor: B.amber, recebe: "Pode receber", cond: "Paciente presente e sessão sem tratativa. O profissional pode regularizar antes do fechamento." },
  { label: "🔁 Cedida para outro", cor: B.red, recebe: "Não recebe", cond: "Sessão estava na agenda deste profissional, mas outro evoluiu. O PA vai para quem evoluiu." },
  { label: "🚫 Cancelada", cor: B.gray, recebe: "Não recebe", cond: "Status cancelado no sistema e sem tratativa." },
  { label: "⬜ Não evoluída", cor: "#92400e", recebe: "Não recebe", cond: "Paciente ausente e sessão sem tratativa." },
  { label: "⚠️ Evolução sem presença", cor: B.red, recebe: "⚠️ Investigar", cond: "INCONSISTÊNCIA: recepção marcou ausência, mas profissional registrou evolução." },
  { label: "⚠️ Cancelado evoluído", cor: B.red, recebe: "⚠️ Investigar", cond: "INCONSISTÊNCIA: sessão foi cancelada, mas há evolução registrada." },
  { label: "⚠️ Evolução sem agendamento", cor: B.red, recebe: "⚠️ Investigar", cond: "INCONSISTÊNCIA: Possui Tratativa = Sim, mas a linha não tem ID Agendamento (não existe sessão real na grade). Verificar antes de pagar." },
]

function Secao({ titulo, children, accent }: { titulo: string; children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 space-y-4"
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      <h3 className="font-bold text-base text-foreground">{titulo}</h3>
      {children}
    </div>
  )
}

export function LegendaTab() {
  const { setHeader } = useHeader()
  const { config, loading, error } = useRemuneracaoConfig()

  useEffect(() => {
    setHeader("Legenda", "Relacionamento Prestador")
    return () => setHeader("", "")
  }, [setHeader])

  const taxasPA = config?.taxas_pa ?? {}
  const diarias = config?.diarias ?? {}
  const ccPE = config?.cc_pe_default ?? 133.34
  const etaBonus = config?.eta_bonus_default ?? 500
  const etaPA = taxasPA[ESP_ETA] ?? 50
  const etaDiaria = diarias[ESP_ETA] ?? 350

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando configuração…</div>
  }
  if (error) {
    return <div className="text-sm text-destructive">{error}</div>
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h2 className="font-bold text-xl mb-1 text-foreground">📖 Legenda Completa — Guia de Referência</h2>
        <p className="text-sm text-muted-foreground">Tudo que você precisa saber para interpretar corretamente os dados desta ferramenta.</p>
      </div>

      <Secao titulo="Abas do módulo">
        <div className="space-y-2">
          {ABAS.map(a => (
            <div key={a.k} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-muted/50">
              <span className="font-bold text-xs text-foreground">{a.nome}</span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Regras de Ocupação de Profissionais">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>O dashboard principal desta aba é por especialidade. Se o filtro de especialidade estiver ativo, os cards mostram somente o recorte filtrado.</p>
          <p>Linhas com terapias compostas também entram quando a especialidade filtrada está contida no texto. Ex.: &quot;Aplicador ABA (PS), Psicopedagogia&quot; aparece tanto em PS quanto em Psicopedagogia.</p>
          <p>Musicoterapia e Aplicador ABA EF usam regras de capacidade por horário; ETA administrativo é tratado como ocupação técnica e não como PA com paciente real.</p>
        </div>
      </Secao>

      <Secao titulo="💡 As Três Modalidades de Pagamento">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg p-3 border-l-[3px] bg-emerald-50 dark:bg-emerald-950/30" style={{ borderLeftColor: B.green }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.green }}>PA – Valor por Atendimento Realizado</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Valor fixo por <strong>sessão de 40 min</strong> efetivamente realizada e com tratativa registrada no sistema.</p>
              <p>Varia por especialidade — ver valores vigentes em Config → PA + PPD.</p>
              <p>Na projeção futura (Análise), é multiplicado pela taxa de presença configurada.</p>
              <p className="italic">Não é pago por sessão cancelada, não evoluída ou cedida a outro profissional.</p>
            </div>
          </div>
          <div className="rounded-lg p-3 border-l-[3px] bg-violet-50 dark:bg-violet-950/30" style={{ borderLeftColor: B.purple }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.purple }}>PE – Valor por Entregas Técnicas</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Exclusivo do <strong>Psicólogo Analista do Comportamento</strong> (antes chamado de Coordenador de Caso).</p>
              <p>Valor fixo por <strong>paciente único</strong>. Atualmente: {fmt(ccPE)}/paciente/mês.</p>
              <p><strong>Não é afetado pela % de presença</strong> — é pago pelo vínculo de acompanhamento.</p>
            </div>
          </div>
          <div className="rounded-lg p-3 border-l-[3px] bg-orange-50 dark:bg-orange-950/30" style={{ borderLeftColor: B.orange }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.orange }}>PPD – Pagamento por Diária</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Valor por <strong>dia de referência/diária</strong>. Os critérios finais do PPD permanecem abertos para ajuste jurídico-operacional.</p>
              <p>Aplica-se, por exemplo, a Fonoaudiologia, Terapia Ocupacional, ETA ({fmt(etaDiaria)}/dia) — ver valores completos em Config → PA + PPD.</p>
            </div>
          </div>
        </div>
      </Secao>

      <Secao titulo="🏷️ Especialista Técnico de Área (ETA) — Modelo de 3 Frentes" accent={B.orange}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg p-3 bg-orange-100 dark:bg-orange-950/40">
            <div className="font-bold text-sm" style={{ color: B.orange }}>① PPD — Disponibilidade</div>
            <div className="text-xs text-foreground mt-1">{fmt(etaDiaria)} por dia escalado.</div>
          </div>
          <div className="rounded-lg p-3 bg-emerald-100 dark:bg-emerald-950/40">
            <div className="font-bold text-sm" style={{ color: B.green }}>② PA — Por Sessão Real</div>
            <div className="text-xs text-foreground mt-1">{fmt(etaPA)} por sessão com paciente real. &quot;Horário Administrativo&quot; não gera PA.</div>
          </div>
          <div className="rounded-lg p-3 bg-orange-100 dark:bg-orange-950/40">
            <div className="font-bold text-sm" style={{ color: B.orange }}>③ Bônus Semanal ETA</div>
            <div className="text-xs text-foreground mt-1">{fmt(etaBonus)} fixo por semana trabalhada como ETA. Não afetado por % de presença.</div>
          </div>
        </div>
      </Secao>

      <Secao titulo="🏷️ Classificação das Sessões (Aba Remuneração)">
        <div className="space-y-2">
          {CLASSIFICACOES.map(x => (
            <div key={x.label} className="rounded-lg p-2 border-l-2" style={{ background: x.cor + "10", borderLeftColor: x.cor }}>
              <div className="flex gap-2 items-center flex-wrap">
                <span className="font-bold text-xs" style={{ color: x.cor }}>{x.label}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: x.recebe.startsWith("Recebe") ? B.green : x.recebe.startsWith("Pode") ? B.amber : x.recebe.startsWith("⚠️") ? B.red : B.gray }}
                >
                  {x.recebe}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{x.cond}</div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="📅 Projeção Mensal — Dias Úteis Reais">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>A ferramenta usa a <strong>grade da semana carregada</strong> como padrão semanal e extrapola para o mês inteiro contando <strong>quantas vezes cada dia da semana ocorre no mês</strong> — nunca um multiplicador fixo de 4,33.</p>
          <p><strong>Feriados nacionais</strong> são descontados automaticamente. Feriados municipais devem ser cadastrados manualmente em Config → Feriados.</p>
          <div className="rounded-lg p-2 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400">
            ⚠️ A aba Análise Futura é uma <em>projeção</em>: assume que o profissional terá a mesma grade durante todo o mês. Afastamentos, inclusões ou remanejamentos no meio do mês não são capturados.
          </div>
        </div>
      </Secao>

      <div className="rounded-xl p-4 text-sm bg-muted text-foreground">
        <strong>Para atualizar PA, PPD, PE ou o bônus ETA:</strong> acesse Config → PA + PPD (ou Config → Geral, para o Psicólogo Analista). Os valores ficam salvos no banco e valem para todos os usuários.
      </div>
    </div>
  )
}
