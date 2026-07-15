import type { ReposicaoStorage } from "@/types/reposicao"

const SK = "reposicao_v1"

export function loadAceites(): ReposicaoStorage {
  if (typeof window === "undefined") return {}
  try { return JSON.parse(localStorage.getItem(SK) ?? "{}") }
  catch { return {} }
}

export function saveAceites(data: ReposicaoStorage): void {
  try { localStorage.setItem(SK, JSON.stringify(data)) }
  catch { /* storage indisponível */ }
}
