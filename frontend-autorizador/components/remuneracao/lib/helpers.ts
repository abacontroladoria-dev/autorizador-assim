import {
  STORAGE_KEY, FERIADOS_BR, NOMES_FALSOS, NOMES_FALSOS_PREFIXOS,
  ETA_ADMIN_NOMES, SLOT_CAP_PROF, SLOT_CAP_ESP,
} from "./constants";
import type { CalculatorConfig, FeriadoExtra, NormalizedSession } from "./types";

// ─── Formatação ───────────────────────────────────────────────────────────────
export const fmt    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
export const fmtH   = (h: number) => `${Math.floor(h)}h${Math.round((h % 1) * 60).toString().padStart(2, "0")}`;

// ─── Tempo ────────────────────────────────────────────────────────────────────
export function timeToMin(t: string | undefined | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function minToH(m: number): number { return m / 60; }

// ─── Persistência localStorage ────────────────────────────────────────────────
export function loadStore(): Partial<CalculatorConfig> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
export function saveStore(o: Partial<CalculatorConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
}

// ─── Calendário ───────────────────────────────────────────────────────────────
export function getCalendario(year: number, month: number, extraHols: FeriadoExtra[] = []) {
  const allH: Record<string, string> = { ...FERIADOS_BR };
  extraHols.forEach(h => { if (h.date && h.nome) allH[h.date] = h.nome; });
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const feriadosAtivos: Array<{ date: string; nome: string; dow: number }> = [];
  const dim = new Date(year, month, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(year, month - 1, d), dow = dt.getDay();
    if (dow < 1 || dow > 5) continue;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    allH[iso] ? feriadosAtivos.push({ date: iso, nome: allH[iso], dow }) : counts[dow]++;
  }
  return { counts, feriadosAtivos };
}

// ─── String helpers ───────────────────────────────────────────────────────────
export const cleanTxt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
export const normKey  = (v: unknown) => cleanTxt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const isSim    = (v: unknown) => ["sim", "1", "true", "realizado", "evoluido"].includes(normKey(v));
export const isCancelado = (v: unknown) => normKey(v).includes("cancel");

// ─── Intervalo de tempo ───────────────────────────────────────────────────────
export function mergeIntervals(ivs: [number, number][]): number {
  if (!ivs || !ivs.length) return 0;
  const s = [...ivs].sort((a, b) => a[0] - b[0]);
  let tot = 0, cs = s[0][0], ce = s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] < ce) ce = Math.max(ce, s[i][1]);
    else { tot += ce - cs; cs = s[i][0]; ce = s[i][1]; }
  }
  return (tot + (ce - cs)) / 60;
}

// ─── Pacientes fictícios ──────────────────────────────────────────────────────
export function isFakePatient(nome: string | undefined | null): boolean {
  if (!nome) return false;
  const n = String(nome).replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (NOMES_FALSOS.some(f => n.includes(f))) return true;
  if (ETA_ADMIN_NOMES.some(f => n.includes(f))) return true;
  if (NOMES_FALSOS_PREFIXOS.some(p => n.startsWith(p))) return true;
  return false;
}

export function isEtaAdminPatient(nome: string | undefined | null): boolean {
  if (!nome) return false;
  return ETA_ADMIN_NOMES.some(f => String(nome).includes(f));
}

// ─── Datas ────────────────────────────────────────────────────────────────────
export function parseDateBR(v: unknown): Date | null {
  const t = cleanTxt(v);
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const [y, m, d] = t.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const match = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!match) return null;
  let [, dd, mm, yy] = match;
  if (yy.length === 2) yy = "20" + yy;
  return new Date(Number(yy), Number(mm) - 1, Number(dd));
}

export function mesAnoDeLinhas(linhas: NormalizedSession[]): string {
  const d = linhas.map(r => parseDateBR(r.data ?? (r as any).Data)).find(Boolean);
  if (!d) return "Sem mês";
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${d.getFullYear()}`;
}

// ─── Parse de tabela HTML ─────────────────────────────────────────────────────
export function parseHtmlTable(text: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];
  const trs = [...table.querySelectorAll("tr")];
  if (!trs.length) return [];
  const headers = [...trs[0].querySelectorAll("th,td")].map(c => cleanTxt(c.textContent));
  return trs.slice(1).map(tr => {
    const cells = [...tr.querySelectorAll("td,th")].map(c => cleanTxt(c.textContent));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = cells[i] ?? "");
    return obj;
  }).filter(o => Object.values(o).some(Boolean));
}

// ─── Busca de colunas flexível ────────────────────────────────────────────────
export function getCol(row: Record<string, string>, names: string[]): string {
  for (const n of names) { if (row[n] !== undefined) return row[n]; }
  const keys = Object.keys(row);
  for (const n of names) {
    const nk = normKey(n);
    const k = keys.find(x => normKey(x) === nk);
    if (k) return row[k];
  }
  return "";
}

// ─── Classificação de sessão ──────────────────────────────────────────────────
export function classificarSessaoReal(r: Partial<NormalizedSession>): string {
  const agenda = cleanTxt(r.profAgenda);
  const csv    = cleanTxt(r.profCsv);
  const possui = isSim(r.possuiTratativa);
  const presenca = isSim(r.presencaOrbita);
  const cancelado = isCancelado(r.statusFinal) || isCancelado(r.statusCsv);
  if (cancelado && possui) return "Cancelado evoluído";
  if (!presenca && possui) return "Evolução sem presença";
  if (possui && agenda && csv && normKey(agenda) !== normKey(csv)) return "Substituição";
  if (possui) return "Evolução normal";
  if (presenca && !possui && !cancelado) return "Pendente retroativa";
  if (cancelado) return "Cancelado";
  return "Não evoluído";
}

// ─── Normalização do relatório de evolução ────────────────────────────────────
export function normalizarRelatorioEvolucao(rows: Record<string, string>[]): NormalizedSession[] {
  return rows.map((r, idx) => {
    const obj = {
      id: cleanTxt(getCol(r, ["ID", "Id", "id"])),
      data: cleanTxt(getCol(r, ["Data", "DATA"])),
      hora: cleanTxt(getCol(r, ["Hora", "Hora Inicial", "HORÁRIO", "Horario"])),
      profAgenda: cleanTxt(getCol(r, ["Profissional Agenda", "Profissional", "profissional"])),
      paciente: cleanTxt(getCol(r, ["Paciente", "Nome Favorecido", "Favorecido"])),
      convenio: cleanTxt(getCol(r, ["Convênio", "Convenio"])),
      unidade: cleanTxt(getCol(r, ["Unidade"])),
      especialidade: cleanTxt(getCol(r, ["Especialidade", "Terapia"])),
      presencaOrbita: cleanTxt(getCol(r, ["Presença Órbita", "Presenca Orbita", "compareceu"])),
      profCsv: cleanTxt(getCol(r, ["Profissional CSV", "nome_profissional_tratativa_csv", "Profissional Tratativa"])),
      substituicao: cleanTxt(getCol(r, ["Substituição", "Substituicao"])),
      possuiTratativa: cleanTxt(getCol(r, ["Possui Tratativa", "possui_tratativa_csv"])),
      statusCsv: cleanTxt(getCol(r, ["Status CSV", "status_csv"])),
      statusFinal: cleanTxt(getCol(r, ["Status Final", "Status do Agendamento"])),
      motivo: cleanTxt(getCol(r, ["Motivo da Classificação", "Motivo da Classificacao", "motivo"])),
      _idx: idx + 1,
      classificacao: "",
    } as NormalizedSession;
    obj.classificacao = classificarSessaoReal(obj);
    return obj;
  }).filter(r => r.profAgenda || r.profCsv || r.paciente);
}

// ─── Capacidade de slots ──────────────────────────────────────────────────────
export function getSlotCap(prof: string, esp: string): number {
  const pk = String(prof || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (pk in SLOT_CAP_PROF) return SLOT_CAP_PROF[pk];
  return SLOT_CAP_ESP[String(esp || "").toLowerCase()] ?? 1;
}
