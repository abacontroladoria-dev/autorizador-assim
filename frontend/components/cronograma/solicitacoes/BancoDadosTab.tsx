"use client"

import { useMemo } from "react"
import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import type { CsvRow, StatusMap, StatusSaida } from "@/types/cronograma"

interface Props {
  cRows: CsvRow[]
  statusMap: StatusMap
  persistStatus: (m: StatusMap) => void
}

type EstadoKey = "sem_csv" | "sem_slot" | "conflito" | "agendado" | "aguardando_ok" | "indefinido"

interface EstadoStyle { bg: string; c: string; label: string }
interface StatusStyle { bg: string; c: string }

const ESTADO_S: Record<EstadoKey, EstadoStyle> = {
  sem_csv:      { bg: "#f3f4f6", c: "#6b7280",  label: "CSV não carregado" },
  sem_slot:     { bg: "#f3f4f6", c: "#6b7280",  label: "Sem sessão definida" },
  conflito:     { bg: "#fef2f2", c: "#dc2626",  label: "Conflito! Vaga dada a outro" },
  agendado:     { bg: B.limeLt,  c: "#4a6e20",  label: "Já agendado no CSV" },
  aguardando_ok:{ bg: B.blueLt,  c: B.blue,     label: "Aguardando, vaga disponível" },
  indefinido:   { bg: "#fff7ed", c: "#c2410c",  label: "Vaga ocupada por desconhecido" },
}

const STATUS_S: Record<string, StatusStyle> = {
  pendente:    { bg: "#f3f4f6", c: "#6b7280" },
  aguardando:  { bg: B.blueLt,  c: B.blue },
  resolvido:   { bg: B.limeLt,  c: "#4a6e20" },
  recusado:    { bg: "#fef2f2", c: "#dc2626" },
  sem_solucao: { bg: "#f3f4f6", c: "#9ca3af" },
}

interface CruzadoItem {
  key: string
  val: StatusMap[string]
  pac: string
  dia: string
  hora: string
  terapia: string
  estado: EstadoKey
  profRes?: string
  diaRes?: string
  horaRes?: string
  csvFirst: string | null
}

export function BancoDadosTab({ cRows, statusMap, persistStatus }: Props) {
  const hasCsv = cRows.length > 0

  const entries = useMemo(
    () =>
      Object.entries(statusMap)
        .filter(([, v]) => v.status && v.status !== "pendente")
        .sort((a, b) => (b[1].atualizadoEm || 0) - (a[1].atualizadoEm || 0)),
    [statusMap],
  )

  const cruzados = useMemo<CruzadoItem[]>(() => {
    const csvFirst = hasCsv
      ? [...new Set(cRows.map(r => r["Data"]).filter(Boolean))].sort()[0]?.substring(0, 10) ?? null
      : null

    return entries.map(([key, val]) => {
      const [pac, dia, hora, terapia] = key.split("|||")

      if (!val.slotReservado) {
        return { key, val, pac, dia, hora, terapia, estado: "sem_slot" as EstadoKey, csvFirst }
      }

      const [profRes, diaRes, horaRes] = val.slotReservado.split("|||")

      if (!hasCsv) {
        return { key, val, pac, dia, hora, terapia, estado: "sem_csv" as EstadoKey, profRes, diaRes, horaRes, csvFirst }
      }

      const hiStr = horaRes
      const conflito = cRows.find(
        r =>
          r["Status do Agendamento"] === "Agendado" &&
          r["Profissional"] === profRes &&
          r["Dia da Semana"] === diaRes &&
          String(r.HI_str || r["HI_str"] || "") === hiStr &&
          String(r["Nome Favorecido"] || "").trim() !== pac &&
          r["Nome Favorecido"] !== "Ainda não selecionado",
      )
      const agendado = cRows.find(
        r =>
          r["Status do Agendamento"] === "Agendado" &&
          String(r["Nome Favorecido"] || "").trim() === pac &&
          r["Profissional"] === profRes &&
          r["Dia da Semana"] === diaRes &&
          String(r.HI_str || r["HI_str"] || "") === hiStr,
      )
      const livreSlot = cRows.find(
        r =>
          r["Status do Agendamento"] === "Livre" &&
          r["Profissional"] === profRes &&
          r["Dia da Semana"] === diaRes &&
          String(r.HI_str || r["HI_str"] || "") === hiStr,
      )

      let estado: EstadoKey
      if (conflito) estado = "conflito"
      else if (agendado) estado = "agendado"
      else if (livreSlot) estado = "aguardando_ok"
      else estado = "indefinido"

      return { key, val, pac, dia, hora, terapia, estado, profRes, diaRes, horaRes, csvFirst }
    })
  }, [entries, cRows, hasCsv])

  const temConflito = cruzados.some(c => c.estado === "conflito")
  const temAgendado = cruzados.some(c => c.estado === "agendado")
  const csvPeriodo = cruzados[0]?.csvFirst ?? null

  function confirmarTodos() {
    const n = { ...statusMap }
    for (const c of cruzados) {
      if (c.estado === "agendado") {
        n[c.key] = { ...c.val, status: "resolvido" as StatusSaida, atualizadoEm: Date.now() }
      }
    }
    persistStatus(n)
  }

  function marcarRecusado(key: string, val: StatusMap[string]) {
    persistStatus({ ...statusMap, [key]: { ...val, status: "recusado" as StatusSaida, slotReservado: null, atualizadoEm: Date.now() } })
  }

  function confirmarItem(key: string, val: StatusMap[string]) {
    persistStatus({ ...statusMap, [key]: { ...val, status: "resolvido" as StatusSaida, slotReservado: null, atualizadoEm: Date.now() } })
  }

  function exportar() {
    const L: string[][] = [["Paciente", "Dia", "Hora", "Terapia", "Status", "Prof Proposto", "Dia Proposto", "Hora Proposta", "Observação", "Atualizado"]]
    for (const [key, val] of entries) {
      const [pac, dia, hora, terapia] = key.split("|||")
      const [profR, diaR, horaR] = (val.slotReservado || "|||").split("|||")
      L.push([
        pac, dia, hora, terapia,
        val.status || "",
        profR || "", diaR || "", horaR || "",
        val.obs || "",
        val.atualizadoEm ? new Date(val.atualizadoEm).toLocaleString("pt-BR") : "",
      ])
    }
    const csv = L.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("﻿" + csv)
    a.download = "aba_saida_backup.csv"
    a.click()
  }

  function limpar() {
    if (window.confirm("Limpar TODOS os registros?")) persistStatus({})
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[14px] border border-border bg-card p-4">
        {/* Cabeçalho */}
        <div className="flex justify-between items-start flex-wrap gap-2 mb-2.5">
          <div>
            <div className="font-extrabold text-[15px]" style={{ color: B.navy }}>
              Em Acompanhamento
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Dados salvos neste navegador. {entries.length} registro(s).
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={exportar}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-[11px] font-semibold cursor-pointer hover:bg-muted transition-colors"
            >
              Exportar CSV
            </button>
            <button
              onClick={limpar}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
              style={{ border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626" }}
            >
              Limpar tudo
            </button>
          </div>
        </div>

        {/* Alertas contextuais */}
        {!hasCsv && (
          <div className="rounded-[9px] px-3 py-2.5 text-[12px] text-amber-800 mb-2.5" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
            Carregue o CSV da grade para cruzar e detectar conflitos ou confirmações automáticas.
          </div>
        )}
        {csvPeriodo && hasCsv && (
          <div className="rounded-[9px] px-3 py-1.5 text-[11px] mb-2.5" style={{ background: B.blueLt, border: `1px solid ${B.blue}33`, color: B.blue }}>
            CSV carregado: semana de <strong>{csvPeriodo}</strong>. Verifique se é o mesmo período dos registros.
          </div>
        )}
        {temConflito && (
          <div className="rounded-[9px] px-3 py-2.5 text-[12px] font-semibold mb-2" style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626" }}>
            ATENÇÃO: há conflitos — vagas reservadas foram agendadas para outro paciente. Revise e marque como Recusado.
          </div>
        )}
        {temAgendado && (
          <div className="flex justify-between items-center rounded-[9px] px-3 py-2.5 text-[12px] mb-2 gap-2" style={{ background: B.limeLt, border: `1px solid ${B.lime}`, color: "#4a6e20" }}>
            <span>Pacientes já agendados no CSV — provavelmente confirmados sem marcar como Resolvido.</span>
            <button
              onClick={confirmarTodos}
              className="shrink-0 px-3 py-1 rounded-lg text-white text-[11px] font-bold cursor-pointer border-none"
              style={{ background: "#16a34a" }}
            >
              Confirmar todos
            </button>
          </div>
        )}

        {/* Lista de registros */}
        {entries.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-[13px]">
            Nenhum registro salvo. Use a aba Saída de Profissional para iniciar.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cruzados.map((c, i) => {
              const eS = ESTADO_S[c.estado] ?? ESTADO_S.sem_csv
              const stS = STATUS_S[c.val.status || "pendente"] ?? STATUS_S.pendente
              const borderColor =
                c.estado === "conflito" ? "#fca5a5"
                  : c.estado === "agendado" ? `${B.lime}88`
                    : "#e5e7eb"

              return (
                <div
                  key={i}
                  className="flex flex-wrap gap-2 items-start px-3 py-2.5 rounded-[10px] bg-card"
                  style={{ border: `1px solid ${borderColor}` }}
                >
                  {/* Paciente + slot original */}
                  <div style={{ flex: "1 1 200px" }}>
                    <div className="font-bold text-[12px] text-foreground">{c.pac}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {c.terapia} · {c.dia} {c.hora}
                    </div>
                  </div>

                  {/* Slot proposto + obs */}
                  <div style={{ flex: "1 1 160px" }}>
                    {c.val.opcao && (
                      <div className="text-[11px] text-foreground">
                        {fmtName(c.val.opcao.prof || c.profRes || "")} · {c.val.opcao.dia || c.diaRes || ""} {c.val.opcao.hora || c.horaRes || ""}
                      </div>
                    )}
                    {c.val.obs && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 italic">"{c.val.obs}"</div>
                    )}
                  </div>

                  {/* Badges + ações */}
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: stS.bg, color: stS.c }}
                    >
                      {c.val.status || "pendente"}
                    </span>
                    {hasCsv && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: eS.bg, color: eS.c }}
                      >
                        {eS.label}
                      </span>
                    )}
                    {c.estado === "conflito" && (
                      <button
                        onClick={() => marcarRecusado(c.key, c.val)}
                        className="px-2 py-0.5 rounded-md text-[10px] cursor-pointer"
                        style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}
                      >
                        Marcar Recusado
                      </button>
                    )}
                    <button
                      onClick={() => confirmarItem(c.key, c.val)}
                      className="px-2 py-0.5 rounded-md text-[10px] cursor-pointer font-semibold"
                      style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
                    >
                      Responsável Confirmou
                    </button>
                    <button
                      onClick={() => marcarRecusado(c.key, c.val)}
                      className="px-2 py-0.5 rounded-md text-[10px] cursor-pointer font-semibold"
                      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}
                    >
                      Recusou
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
