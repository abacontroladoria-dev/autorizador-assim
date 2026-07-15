export const DIA_ABR: Record<string, string> = {
  Segunda: "Seg",
  Terca:   "Ter",
  Quarta:  "Qua",
  Quinta:  "Qui",
  Sexta:   "Sex",
}

export function fmtData(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
