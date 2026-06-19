import * as XLSX from "xlsx"
import { splitWaKey } from "./constants"
import type { RecItem, InvItem, WaMap } from "@/types/cronograma"

// ─── XLSX UTILS ───────────────────────────────────────────────────────────────

export function parseHistoricoXlsx(
  file: File,
  cb: (rec: RecItem[], inv: InvItem[], err: string | null, waMap: WaMap) => void
): void {
  const fr = new FileReader()
  fr.onload = (e) => {
    try {
      const wb = XLSX.read(e.target!.result, { type: "array" })
      let recList: RecItem[] = []
      let invList: InvItem[] = []
      const waList: WaMap = {}

      const rSheet = wb.SheetNames.find((n) => n.includes("Recusados"))
      const iSheet = wb.SheetNames.find(
        (n) => n.includes("Inviáveis") || n.includes("Inviavel") || n.includes("Base")
      )
      const wSheet = wb.SheetNames.find((n) => n.includes("Status WA") || n.includes("WA"))

      if (rSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[rSheet], { defval: "" })
        recList = rows
          .filter((r) => r["Paciente"] && r["Tipo"] !== "Inviável")
          .map((r) => ({
            paciente: String(r["Paciente"] || "").trim(),
            profissional: String(r["Profissional"] || "").trim(),
            especialidade: String(r["Especialidade"] || "").trim(),
            unidade: String(r["Unidade"] || "").trim(),
            dia: String(r["Dia"] || "").trim(),
            hora: String(r["Hora Vaga"] || "").trim(),
            registradoEm: String(r["Data"] || "").trim(),
          }))
        // suporte ao formato unificado (inviáveis na mesma aba)
        const invRows = rows.filter((r) => r["Tipo"] === "Inviável")
        invList = invRows.map((r) => ({
          paciente: String(r["Paciente"] || "").trim(),
          motivo: String(r["Motivo"] || "").trim(),
          registradoEm: String(r["Data"] || "").trim(),
        }))
      }

      if (iSheet && !invList.length) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[iSheet], { defval: "" })
        invList = rows
          .filter((r) => r["Paciente"])
          .map((r) => ({
            paciente: String(r["Paciente"] || "").trim(),
            motivo: String(r["Motivo"] || "").trim(),
            registradoEm: String(r["Data_Registro"] || r["Data"] || "").trim(),
          }))
      }

      if (wSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wSheet], { defval: "" })
        for (const r of rows) {
          const st = String(r["Status"] || "").trim()
          if (!st) continue
          const chave =
            String(r["Chave"] || "").trim() ||
            `${String(r["Paciente"] || "").trim()}|||${String(r["Profissional"] || "").trim()}|||${String(r["Dia"] || "").trim()}|||${String(r["Hora"] || "").trim()}`
          if (chave.split("|||").length >= 4) waList[chave] = st
        }
      }

      cb(recList, invList, null, waList)
    } catch (err) {
      cb([], [], (err as Error).message, {})
    }
  }
  fr.readAsArrayBuffer(file)
}

export function exportBase(rec: RecItem[], inv: InvItem[], waMap: WaMap = {}): void {
  const wb = XLSX.utils.book_new()

  // Aba unificada (fácil de editar manualmente)
  const unif: unknown[][] = [
    ["Tipo", "Paciente", "Profissional", "Especialidade", "Unidade", "Dia", "Hora Vaga", "Motivo", "Data"],
    ...rec.map((r) => ["Recusado", r.paciente, r.profissional, r.especialidade, r.unidade, r.dia, r.hora, "", r.registradoEm]),
    ...inv.map((i) => ["Inviável", i.paciente, "", "", "", "", "", i.motivo, i.registradoEm]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(unif), "❌ Recusados")

  // Aba inviáveis separada para compatibilidade de importação
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Paciente", "Motivo", "Data_Registro"],
      ...inv.map((i) => [i.paciente, i.motivo, i.registradoEm]),
    ]),
    "⚠️ Inviáveis"
  )

  const waRows: unknown[][] = [
    ["Chave", "Paciente", "Profissional", "Dia", "Hora", "Status"],
    ...Object.entries(waMap).map(([k, st]) => {
      const x = splitWaKey(k)
      return [k, x?.pac ?? "", x?.prof ?? "", x?.dia ?? "", x?.hora ?? "", st]
    }),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(waRows), "📤 Status WA")

  XLSX.writeFile(wb, "base_recusados_inviáveis.xlsx")
}
