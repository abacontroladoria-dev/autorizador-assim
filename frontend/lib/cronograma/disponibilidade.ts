import type { DispRow } from "@/types/cronograma"

// Parser do relatório de disponibilidade exportado pelo Órbita (disponibilidades_*.csv).
// Formato: delimitado por ";", UTF-8 com BOM, alguns campos entre aspas (ex.: "ASSIM
// Saúde"). Dias sem janela vêm como "—" (traço) — mantidos como estão; buildNewCronograma
// já os ignora via pm() → null. Os cabeçalhos batem exatamente com as chaves de DispRow
// ("Nome Paciente", "Seg Início", "Seg Fim", …, "Escola Início/Fim").

// Divisor de CSV/DSV tolerante a aspas e a quebras de linha dentro de campos citados.
function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // "" → aspa literal
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === sep) {
      row.push(field); field = ""
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""
    } else if (c !== "\r") {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

/**
 * Converte o texto do CSV de disponibilidade em DispRow[]. Ignora linhas sem
 * "Nome Paciente". Retorna [] se o arquivo não tiver linhas de dados.
 */
export function parseDisponibilidadeCSV(text: string): DispRow[] {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text // remove BOM (file.text() decodifica em 1 char U+FEFF)
  const rows = parseDelimited(clean, ";")
  if (rows.length < 2) return []

  const header = rows[0].map(h => h.trim())
  const out: DispRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    if (cells.every(c => c.trim() === "")) continue
    const obj: Record<string, string> = {}
    header.forEach((h, j) => { obj[h] = (cells[j] ?? "").trim() })
    if (!(obj["Nome Paciente"] || "").trim()) continue
    out.push(obj as DispRow)
  }
  return out
}
