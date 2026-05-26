import {
  CONTRATOS_ANTIGOS, DEFAULT_CC_LIM, PROFS_IGNORAR,
} from "./constants";
import {
  getCalendario, timeToMin, minToH, getSlotCap,
  isFakePatient, isEtaAdminPatient, isSim, isCancelado,
  cleanTxt, normKey, parseDateBR, mesAnoDeLinhas,
} from "./helpers";
import type {
  CsvRow, NormalizedSession, CalculatorConfig,
  ProfData, TerapiaDetail, RealProfData, AnaliseResult, ResumoReal,
} from "./types";

// ─── Cálculo da Análise Futura ────────────────────────────────────────────────
export function calcularAnalise(rows: CsvRow[], config: CalculatorConfig): AnaliseResult {
  if (!rows.length) return { dadosPorProf: [], feriadosMes: [], allTerps: [] };

  const { taxasPA, diarias, etaBonus, antigos, limites, presenca, ccPA, ccPME, extraHols } = config;
  const datas = rows.map(r => r["Data"]).filter(Boolean).sort() as string[];
  const [yr, mo] = (datas[0] || "2026-06-01").split("-").map(Number);
  const cal = getCalendario(yr, mo, extraHols);
  const pct = presenca / 100;

  // Mapeia slots por profissional para cálculo de horas e taxa de ocupação
  const allSlots: Record<string, {
    diasInfo: Record<string, { dow: number; inicioMin: number; fimMin: number; ag: number; liv: number; pacIvs: [number,number][]; slotMap: Record<string,number> }>;
    terpDays: Record<string, Record<string, number>>;
  }> = {};

  rows.forEach(r => {
    const prof   = r["Profissional"]?.trim();
    const terp   = r["Terapia"]?.trim();
    const date   = r["Data"]?.trim();
    const status = r["Status do Agendamento"];
    const hIni   = r["Hora Inicial"]?.trim();
    const hFim   = r["Hora Final"]?.trim();
    if (!prof || !date) return;
    if (!terp) return; // slot sem especialidade: ignora apenas
    const dow = new Date(date + "T12:00:00").getDay();
    if (dow < 1 || dow > 5) return;
    if (!allSlots[prof]) allSlots[prof] = { diasInfo: {}, terpDays: {} };
    if (!allSlots[prof].diasInfo[date]) allSlots[prof].diasInfo[date] = { dow, inicioMin: 9999, fimMin: 0, ag: 0, liv: 0, pacIvs: [], slotMap: {} };
    const di = allSlots[prof].diasInfo[date];
    const ini = timeToMin(hIni), fim = timeToMin(hFim);
    if (ini !== null && ini < di.inicioMin) di.inicioMin = ini;
    if (fim !== null && fim > di.fimMin) di.fimMin = fim;
    if (status === "Agendado") {
      di.ag++;
      if (ini !== null && fim !== null) {
        di.pacIvs.push([ini, fim]);
        const sk = `${terp || ""}:${ini}`;
        di.slotMap[sk] = (di.slotMap[sk] || 0) + 1;
      }
    } else di.liv++;
    if (!allSlots[prof].terpDays[terp]) allSlots[prof].terpDays[terp] = {};
    allSlots[prof].terpDays[terp][date] = dow;
  });

  const mapa: Record<string, {
    prof: string;
    terapias: Record<string, { terp: string; sessoes: number; sessByDow: Record<number,number>; pacsSet: Set<string>; etaSessoes: number; etaSessByDow: Record<number,number> }>;
    pacCC: Set<string>;
  }> = {};

  rows.filter(r => r["Status do Agendamento"] === "Agendado")
    .forEach(r => {
      const prof = r["Profissional"]?.trim() || "";
      const terp = r["Terapia"]?.trim() || "";
      const date = r["Data"]?.trim() || "";
      const pac  = r["Nome Favorecido"]?.trim() || "";
      if (!prof || !terp || !date) return;
      const dow = new Date(date + "T12:00:00").getDay();
      if (dow < 1 || dow > 5) return;
      if (!mapa[prof]) mapa[prof] = { prof, terapias: {}, pacCC: new Set() };
      if (!mapa[prof].terapias[terp]) mapa[prof].terapias[terp] = { terp, sessoes: 0, sessByDow: {}, pacsSet: new Set(), etaSessoes: 0, etaSessByDow: {} };
      const td = mapa[prof].terapias[terp];
      // ETA admin: separa para cômputo do bônus semanal (não conta como sessão com paciente)
      const isEtaAdminSlot = terp === "Especialista Técnico de Área" && isEtaAdminPatient(pac);
      if (isEtaAdminSlot) {
        td.etaSessoes++;
        td.etaSessByDow[dow] = (td.etaSessByDow[dow] || 0) + 1;
      } else {
        // Sem blacklist: todos os horários agendados contam para pagamento
        td.sessoes++;
        td.sessByDow[dow] = (td.sessByDow[dow] || 0) + 1;
      }
      if (pac) { td.pacsSet.add(pac); if (terp === "Coordenador de Caso") mapa[prof].pacCC.add(pac); }
    });

  const profs: ProfData[] = Object.values(mapa).map(d => {
    const slotData = allSlots[d.prof] || { diasInfo: {}, terpDays: {} };
    let horasSemanaTotal = 0, horasAbertas = 0, horasComPac = 0;
    Object.values(slotData.diasInfo).forEach(di => {
      let fim = di.fimMin;
      if (fim >= 17 * 60 + 40 && fim < 18 * 60) fim = 18 * 60;
      let span = fim > di.inicioMin ? minToH(fim - di.inicioMin) : 0;
      if (di.inicioMin < 12 * 60 && fim > 13 * 60) span -= 1;
      if (span < 0) span = 0;
      horasSemanaTotal += span;
      horasAbertas     += di.liv * 40 / 60;
      horasComPac      += di.ag * 40 / 60;
    });

    let slotOcup = 0, slotLiv = 0;
    Object.values(allSlots[d.prof]?.diasInfo || {}).forEach(di => {
      Object.entries(di.slotMap || {}).forEach(([sk, cnt]) => {
        const cap = getSlotCap(d.prof, sk.split(":")[0]);
        slotOcup += Math.min(cnt / cap, 1);
      });
      slotLiv += di.liv || 0;
    });
    const taxaOcupacao = (slotOcup + slotLiv) > 0 ? slotOcup / (slotOcup + slotLiv) : null;

    const pacCC = d.pacCC.size, hasCC = "Coordenador de Caso" in d.terapias;
    const limCC = limites[d.prof] ?? DEFAULT_CC_LIM;
    const alertCC = hasCC && pacCC > limCC;
    let total100 = 0, totalX = 0;

    const terapiaDetails: TerapiaDetail[] = Object.values(d.terapias).map(td => {
      const isCC  = td.terp === "Coordenador de Caso";
      const isETA = td.terp === "Especialista Técnico de Área";
      const pa   = isCC ? ccPA : (taxasPA[td.terp] || 0);
      const diar = isCC ? 0    : (diarias[td.terp] || 0);
      const tDays = slotData.terpDays[td.terp] || {};
      const dowsPresent = new Set(Object.values(tDays));
      let mensalDiaria = 0;
      dowsPresent.forEach(dow => { mensalDiaria += diar * (cal.counts[dow] || 0); });
      let mensalPA100 = 0;
      const dowBreak: TerapiaDetail["dowBreak"] = [];
      Object.entries(td.sessByDow).forEach(([dow, cnt]) => {
        const occ = cal.counts[parseInt(dow)] || 0;
        const mensal = cnt * occ;
        mensalPA100 += mensal * pa;
        const fHols = cal.feriadosAtivos.filter(f => f.dow === parseInt(dow));
        dowBreak.push({ dow: parseInt(dow), cnt, occ, mensal, feriados: fHols });
      });
      const mensalPAX = mensalPA100 * pct;

      let mensalETA100 = 0, etaWeeks = 0;
      const etaDownBreak: TerapiaDetail["etaDownBreak"] = [];
      if (isETA) {
        const adminDOWs = Object.keys(td.etaSessByDow || {}).map(Number);
        etaWeeks = adminDOWs.length > 0 ? Math.max(...adminDOWs.map(dw => cal.counts[dw] || 0)) : 0;
        mensalETA100 = etaWeeks * etaBonus;
        Object.entries(td.etaSessByDow || {}).forEach(([dow, cnt]) => {
          const occ = cal.counts[parseInt(dow)] || 0;
          const fHols = cal.feriadosAtivos.filter(f => f.dow === parseInt(dow));
          etaDownBreak.push({ dow: parseInt(dow), cnt, occ, mensal: occ, feriados: fHols });
        });
      }

      const diariasDetalhe: TerapiaDetail["diariasDetalhe"] = [];
      dowsPresent.forEach(dow => {
        const occ = cal.counts[dow] || 0;
        const fHols = cal.feriadosAtivos.filter(f => f.dow === dow);
        diariasDetalhe.push({ dow, occ, valor: diar * occ, feriados: fHols });
      });

      const monthly100 = isCC ? td.sessoes * ccPA : mensalDiaria + mensalPA100 + mensalETA100;
      const monthlyX   = isCC ? td.sessoes * pct * ccPA : mensalDiaria + mensalPAX + mensalETA100;
      if (!isCC) { total100 += monthly100; totalX += monthlyX; }
      else {
        const ccSess100 = Object.entries(td.sessByDow).reduce((s, [dow, cnt]) => s + cnt * (cal.counts[parseInt(dow)] || 0), 0);
        const ccSessX = ccSess100 * pct;
        const m100cc = ccSess100 * ccPA, mXcc = ccSessX * ccPA;
        total100 += m100cc; totalX += mXcc;
        return {
          ...td, pacientes: td.pacsSet.size, pacientesList: [...td.pacsSet].sort(),
          pa, diar, etaPA: 0, isCC, isETA: false, mensalDiaria: 0,
          mensalPA100: m100cc, mensalPAX: mXcc, mensalETA100: 0, etaDownBreak: [],
          monthly100: m100cc, monthlyX: mXcc, dowBreak, diariasDetalhe,
          sessoesMes100: ccSess100, sessoesMesX: Math.round(ccSessX),
          etaSessoesSemana: 0, etaWeeks: 0, etaSessoesMes100: 0,
        } as TerapiaDetail;
      }
      const sessoesMes100 = Object.entries(td.sessByDow).reduce((s, [dow, cnt]) => s + cnt * (cal.counts[parseInt(dow)] || 0), 0);
      const etaSessoesMes100 = Object.entries(td.etaSessByDow || {}).reduce((s, [dow, cnt]) => s + cnt * (cal.counts[parseInt(dow)] || 0), 0);
      return {
        ...td, pacientes: td.pacsSet.size, pacientesList: [...td.pacsSet].sort(),
        pa, diar, isCC, isETA, mensalDiaria, mensalPA100, mensalPAX,
        mensalETA100, etaDownBreak, etaWeeks,
        monthly100, monthlyX, dowBreak, diariasDetalhe,
        sessoesMes100, sessoesMesX: 0,
        etaSessoesSemana: td.etaSessoes, etaSessoesMes100,
      } as TerapiaDetail;
    }).sort((a, b) => a.isCC ? -1 : b.isCC ? 1 : a.terp.localeCompare(b.terp));

    const pme = hasCC ? pacCC * ccPME : 0;
    total100 += pme; totalX += pme;

    const cBase = CONTRATOS_ANTIGOS[d.prof] || {};
    const cOver = antigos[d.prof] || {};
    const cF = { ...cBase, ...cOver };
    const salA = cF.salario ?? null, temA = salA !== null && salA > 0;
    const d100 = temA ? ((total100 - salA!) / salA!) * 100 : null;
    const dX   = temA ? ((totalX - salA!) / salA!) * 100 : null;
    const terpN = terapiaDetails.map(t => t.terp);
    return {
      prof: d.prof, terapiaDetails, hasCC, pacCC, pme,
      total100, totalX,
      salAntigo: salA, contrato: cF.contrato || null, chSemanal: cF.chSemanal ?? null,
      temAntigo: temA, delta100: d100, deltaX: dX,
      limiteCC: limCC, alertaCC: alertCC,
      hasAE: terpN.some(t => t.includes("Aplicador ABA")),
      hasTA: terpN.includes("Terapia Alimentar"),
      allPacs: [...new Set(terapiaDetails.flatMap(t => t.pacientesList))].sort(),
      horasSemanaTotal, horasAbertas, horasComPac, taxaOcupacao,
    };
  }).sort((a, b) => a.prof.localeCompare(b.prof));

  const allT = [...new Set(profs.flatMap(d => d.terapiaDetails.map(t => t.terp)))].sort();
  return { dadosPorProf: profs, feriadosMes: cal.feriadosAtivos, allTerps: allT };
}

// ─── Mês/período do CSV ───────────────────────────────────────────────────────
export function calcularAnalMes(rows: CsvRow[]): string | null {
  if (!rows.length) return null;
  const datas = rows.map(r => r["Data"]).filter(Boolean).sort() as string[];
  const [yr, mo] = (datas[0] || "2026-06-01").split("-").map(Number);
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(yr, mo - 1, 1));
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${yr}`;
}

// ─── Cálculo da Apuração Real ─────────────────────────────────────────────────
export function calcularRemuneracaoReal(
  evoRows: NormalizedSession[],
  config: Pick<CalculatorConfig, "taxasPA" | "diarias" | "antigos" | "ccPA" | "ccPME" | "etaBonus">
): RealProfData[] {
  const { taxasPA, diarias, antigos, ccPA, ccPME, etaBonus } = config;
  const profMap: Record<string, Omit<RealProfData, "pacientesQtd"|"pacientesCCQtd"|"contrato"|"salAntigo"|"temAntigo"|"pme"|"diariaPeriodo"|"diariaDetalhe"|"etaWeeksPeriodo"|"etaBonusPeriodo"|"valorConfirmado"|"valorPotencial">> = {};

  const ensure = (nome: string) => {
    const k = cleanTxt(nome) || "Sem profissional";
    if (!profMap[k]) profMap[k] = {
      prof: k, agendadas: 0, evoluidasProprias: 0, substituicoesRealizadas: 0,
      substituidoPorOutro: 0, pendentes: 0, canceladas: 0, naoEvoluidas: 0,
      inconsistencias: 0,
      pacientes: new Set(), pacientesCC: new Set(),
      diasPorEsp: {}, etaAdminDatas: new Set(),
      sessoes: [], valorRecuperavel: 0,
    };
    return profMap[k] as any;
  };

  evoRows.forEach(r => {
    const agenda = cleanTxt(r.profAgenda);
    const csv    = cleanTxt(r.profCsv);
    const same   = agenda && csv && normKey(agenda) === normKey(csv);
    const possui  = isSim(r.possuiTratativa);
    const presenca = isSim(r.presencaOrbita);
    const cancelado = isCancelado(r.statusFinal) || isCancelado(r.statusCsv);
    const isEtaAdminRow = r.especialidade === "Especialista Técnico de Área" && isEtaAdminPatient(r.paciente);
    if (!isEtaAdminRow && isFakePatient(r.paciente)) return;
    const pa = r.especialidade === "Coordenador de Caso" ? ccPA
             : isEtaAdminRow ? (taxasPA["Especialista Técnico de Área"] ?? 50)
             : (taxasPA[r.especialidade] ?? 0);
    const eInc = ["Evolução sem presença", "Cancelado evoluído"].includes(r.classificacao);

    if (agenda) {
      const a = ensure(agenda);
      a.agendadas++;
      if (r.paciente && !isFakePatient(r.paciente)) {
        a.pacientes.add(r.paciente);
        if (r.especialidade === "Coordenador de Caso") a.pacientesCC.add(r.paciente);
      }
      if (r.especialidade && r.data) {
        if (!a.diasPorEsp[r.especialidade]) a.diasPorEsp[r.especialidade] = new Set();
        a.diasPorEsp[r.especialidade].add(r.data);
      }
      if (isEtaAdminRow && r.data) a.etaAdminDatas.add(r.data);
      a.sessoes.push({ ...r, papel: "Agenda" });
      if (possui && same && !eInc) { a.evoluidasProprias++; a.valorConfirmado = (a.valorConfirmado || 0) + pa; }
      else if (possui && csv && !same) { a.substituidoPorOutro++; }
      else if (presenca && !possui && !cancelado) { a.pendentes++; a.valorRecuperavel += pa; }
      else if (cancelado && !possui) { a.canceladas++; }
      else if (eInc) { a.inconsistencias++; }
      else { a.naoEvoluidas++; }
    }
    if (possui && csv && agenda && !same) {
      const s = ensure(csv);
      s.substituicoesRealizadas++;
      if (r.paciente) s.pacientes.add(r.paciente);
      s.sessoes.push({ ...r, papel: "Substituição realizada" });
      s.valorConfirmado = (s.valorConfirmado || 0) + pa;
      if (eInc) s.inconsistencias++;
    }
  });

  return Object.values(profMap).map((p: any) => {
    const c = { ...(CONTRATOS_ANTIGOS[p.prof] || {}), ...(antigos[p.prof] || {}) };
    const pme = p.pacientesCC.size > 0 ? p.pacientesCC.size * ccPME : 0;

    let diariaPeriodo = 0;
    const diariaDetalhe: RealProfData["diariaDetalhe"] = [];
    Object.entries(p.diasPorEsp as Record<string, Set<string>>).forEach(([esp, datas]) => {
      const rate = diarias[esp] || 0;
      if (rate > 0) { const tot = datas.size * rate; diariaPeriodo += tot; diariaDetalhe.push({ esp, dias: datas.size, rate, total: tot }); }
    });

    let etaWeeksPeriodo = 0, etaBonusPeriodo = 0;
    if ((p.etaAdminDatas as Set<string>).size > 0) {
      const weekSet = new Set<string>();
      (p.etaAdminDatas as Set<string>).forEach(dataStr => {
        const d = parseDateBR(dataStr); if (!d) return;
        const wk = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
        weekSet.add(`${d.getFullYear()}-W${wk}`);
      });
      etaWeeksPeriodo = weekSet.size;
      etaBonusPeriodo = etaWeeksPeriodo * etaBonus;
    }

    const valorConfirmado = (p.valorConfirmado || 0) + pme + diariaPeriodo + etaBonusPeriodo;
    const valorPotencial  = valorConfirmado + p.valorRecuperavel;

    return {
      ...p,
      pacientesQtd: (p.pacientes as Set<string>).size,
      pacientesCCQtd: (p.pacientesCC as Set<string>).size,
      contrato: c.contrato || "",
      salAntigo: c.salario || 0,
      temAntigo: (c.salario || 0) > 0,
      pme, diariaPeriodo, diariaDetalhe, etaWeeksPeriodo, etaBonusPeriodo,
      valorConfirmado, valorPotencial,
    } as RealProfData;
  }).sort((a, b) => b.valorConfirmado - a.valorConfirmado);
}

// ─── Resumo da apuração real ──────────────────────────────────────────────────
export function calcularResumo(evoRows: NormalizedSession[], remuneracaoReal: RealProfData[]): ResumoReal {
  const total = evoRows.length;
  const evoluidos = evoRows.filter(r => isSim(r.possuiTratativa)).length;
  const cancelados = evoRows.filter(r => isCancelado(r.statusFinal) || isCancelado(r.statusCsv)).length;
  const naoEvoluidos = evoRows.filter(r => !isSim(r.possuiTratativa) && !(isCancelado(r.statusFinal) || isCancelado(r.statusCsv))).length;
  const presencaOrb = evoRows.filter(r => isSim(r.presencaOrbita)).length;
  const subs = evoRows.filter(r => isSim(r.possuiTratativa) && r.profAgenda && r.profCsv && normKey(r.profAgenda) !== normKey(r.profCsv)).length;
  const inc  = evoRows.filter(r => ["Evolução sem presença", "Cancelado evoluído"].includes(r.classificacao)).length;
  const pct  = (evoluidos + naoEvoluidos) > 0 ? (evoluidos / (evoluidos + naoEvoluidos)) * 100 : 0;
  const totalAntigo = remuneracaoReal.filter(p => p.temAntigo).reduce((s, p) => s + p.salAntigo, 0);
  const valorConfirmado = remuneracaoReal.reduce((s, p) => s + p.valorConfirmado, 0);
  const valorPotencial  = remuneracaoReal.reduce((s, p) => s + p.valorPotencial, 0);
  const pendContr = remuneracaoReal.filter(p => !p.temAntigo).length;
  const pendContrato = remuneracaoReal.filter(p => !p.temAntigo);
  return { total, evoluidos, cancelados, naoEvoluidos, presencaOrb, subs, inc, pct, totalAntigo, valorConfirmado, valorPotencial, pendContr, pendContrato };
}

// ─── Filtro da análise ────────────────────────────────────────────────────────
export function filtrarDados(dadosPorProf: ProfData[], busca: string, filtrosEsp: string[]): ProfData[] {
  let r = dadosPorProf;
  const q = busca.trim().toLowerCase();
  if (q) r = r.filter(d => d.prof.toLowerCase().includes(q));
  if (filtrosEsp.length > 0 && !filtrosEsp.includes("todos")) {
    r = r.filter(d => filtrosEsp.some(f => {
      if (f === "AE") return d.hasAE;
      if (f === "TA") return d.hasTA;
      if (f === "CC") return d.hasCC;
      return d.terapiaDetails.some(t => t.terp === f);
    }));
  }
  return r;
}

// ─── Período de datas do relatório ───────────────────────────────────────────
export function calcularPeriodo(evoRows: NormalizedSession[]) {
  if (!evoRows.length) return null;
  const fmtBR = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const datas = evoRows.map(r => parseDateBR(r.data)).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()) as Date[];
  if (!datas.length) return null;
  return { inicio: fmtBR(datas[0]), fim: fmtBR(datas[datas.length - 1]) };
}
