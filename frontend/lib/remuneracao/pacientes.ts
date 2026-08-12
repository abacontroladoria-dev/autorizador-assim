// Migrado de calculadora-remuneracao/src/utils/pacientes.ts

import { normKey, NOMES_FALSOS, IDS_FAVORECIDOS_FALSOS, NOMES_FALSOS_PREFIXOS, ETA_ADMIN_NOMES, PACIENTES_FICTICIOS_POR_ID } from "./constants"

export type TimeInterval = [number, number]

const PARTICULAS_NOME = new Set(["de", "da", "do", "das", "dos", "e"])
const NOMES_COMPOSTOS_INICIO = new Set(["ana", "joao", "jose", "maria", "davi", "luis", "luiz", "eric", "helena", "cesar", "jhony"])
const NOMES_COMPOSTOS_SEGUNDO = new Set(["beatriz", "gabriel", "augusto", "lucas", "valentina", "lucca", "pedro", "pietro", "vitor", "victor", "miguel", "clara"])

export function abreviarNomePaciente(nome: string | null | undefined): string | null | undefined {
  if (!nome) return nome
  const partesOrig = String(nome).trim().split(/\s+/).filter(Boolean)
  if (partesOrig.length <= 2) return partesOrig.join(" ")
  const partes = partesOrig.filter(p => !PARTICULAS_NOME.has(normKey(p)))
  if (partes.length <= 2) return partes.join(" ")
  const firstKey = normKey(partes[0])
  const secondKey = normKey(partes[1])
  const manterDois = NOMES_COMPOSTOS_INICIO.has(firstKey) || NOMES_COMPOSTOS_SEGUNDO.has(secondKey)
  const nManter = manterDois ? 2 : 1
  const mantidos = partes.slice(0, nManter)
  const abreviados = partes.slice(nManter).map(p => p.charAt(0).toUpperCase() + ".")
  return [...mantidos, ...abreviados].join(" ")
}

export function mergeIntervals(ivs: TimeInterval[]): number {
  if (!ivs || !ivs.length) return 0
  const s = [...ivs].sort((a, b) => a[0] - b[0])
  let tot = 0, cs = s[0][0], ce = s[0][1]
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] < ce) ce = Math.max(ce, s[i][1])
    else { tot += ce - cs; cs = s[i][0]; ce = s[i][1] }
  }
  return (tot + (ce - cs)) / 60
}

export function isFakePatient(nome: string | null | undefined, idFavorecido?: string | null): boolean {
  const id = String(idFavorecido ?? "").replace(/\s+/g, " ").trim()
  if (id && (IDS_FAVORECIDOS_FALSOS.some(f => id === f) || Object.prototype.hasOwnProperty.call(PACIENTES_FICTICIOS_POR_ID, id))) return true
  if (!nome) return false
  const n = String(nome).replace(/\s+/g, " ").trim()
  if (!n) return false
  if (NOMES_FALSOS.some(f => n.includes(f))) return true
  if (ETA_ADMIN_NOMES.some(f => n.includes(f))) return true
  if (NOMES_FALSOS_PREFIXOS.some(p => n.startsWith(p))) return true
  return false
}

export function isEtaAdminPatient(nome: string | null | undefined, idFavorecido?: string | null): boolean {
  const id = String(idFavorecido ?? "").replace(/\s+/g, " ").trim()
  const nomePorId = id ? PACIENTES_FICTICIOS_POR_ID[id] : ""
  const candidatos = [nome, nomePorId]
    .map(x => String(x || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
  return candidatos.some(n =>
    ETA_ADMIN_NOMES.some(f => n.includes(f))
      || NOMES_FALSOS_PREFIXOS.some(p => n.startsWith(p))
  )
}
