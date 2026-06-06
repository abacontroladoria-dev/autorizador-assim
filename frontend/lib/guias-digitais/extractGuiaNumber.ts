export function extractGuiaNumber(text: string): string | null {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/\r|\n/g, " ")
    .toLowerCase()

  const patterns = [
    /guia\s*[:\-]?\s*(\d{5,})/i,
    /n\.?\s*guia\s*[:\-]?\s*(\d{5,})/i,
    /protocolo\s*[:\-]?\s*(\d{5,})/i,
    /cobertura\s*[:\-]?\s*(\d{5,})/i,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(normalized)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  const fallback = normalized.match(/(\d{6,12})/)
  return fallback ? fallback[1] : null
}

export function extractGuiaNumberFromPage(pageBytes: Uint8Array): string | null {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(pageBytes)
  return extractGuiaNumber(decoded)
}
