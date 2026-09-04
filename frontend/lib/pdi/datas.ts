// Datas derivadas do Controle de Prazos do PDI: avaliação → relatório (+15d) →
// implementação do PIC (+7d) → fechamento (+6 meses).
//
// Módulo PURO — mesmo estilo de lib/laudos/acompanhamento.ts: datas são
// strings ISO (`AAAA-MM-DD`), manipuladas com `Date.UTC` explícito, nunca
// `new Date(iso)` puro nem `new Date()` do relógio local. `new Date(iso)` sem
// componente de hora é interpretado como UTC pelo motor JS, mas somar dias com
// `setDate`/`getDate` locais teria arrastado o fuso de Brasília (UTC-3) para
// dentro da conta — exatamente o defeito que o cabeçalho de
// lib/laudos/acompanhamento.ts documenta para vigente×vencido.
//
// As três somas (+15d, +7d, +6 meses) são EXATAMENTE as da planilha Excel
// `Controle_Prazos_PDI pronto 2.0` (ver plano) — "Prazo Fechamento(6 meses)" é
// calculado no Excel com `EDATE(data_implementacao, 6)`, que soma meses de
// CALENDÁRIO preservando o dia (e "clampando" para o último dia do mês quando
// o mês de destino é mais curto: 31/01 + 1 mês = 28/02, não 03/03). É esse
// comportamento que `addMesesIso` replica — sem o clamp, `Date.UTC` do
// JavaScript "rola" o excedente para o mês seguinte (31/01 + 1 mês via
// `Date.UTC(y, m+1, 31)` vira 02 ou 03/03), o que divergiria do Excel.

function partesIso(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number)
  return { ano, mes, dia }
}

function isoDeUtc(ms: number): string {
  const d = new Date(ms)
  const ano = d.getUTCFullYear()
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dia = String(d.getUTCDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

/** Soma dias corridos a uma data ISO. `dias` pode ser negativo. */
export function addDiasIso(iso: string, dias: number): string {
  const { ano, mes, dia } = partesIso(iso)
  return isoDeUtc(Date.UTC(ano, mes - 1, dia + dias))
}

/**
 * Soma meses de calendário a uma data ISO, ao estilo `EDATE` do Excel:
 * preserva o dia do mês, e quando o mês de destino é mais curto que esse dia
 * (ex.: 31/01 + 1 mês → fevereiro não tem dia 31), "clampa" para o ÚLTIMO dia
 * do mês de destino em vez de rolar para o mês seguinte.
 */
export function addMesesIso(iso: string, meses: number): string {
  const { ano, mes, dia } = partesIso(iso)
  const indiceMesAlvo = mes - 1 + meses // 0-based, pode passar de 11 ou ficar negativo
  // Dia 0 do mês SEGUINTE ao alvo = último dia do mês alvo.
  const ultimoDiaAlvo = new Date(Date.UTC(ano, indiceMesAlvo + 1, 0)).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDiaAlvo)
  return isoDeUtc(Date.UTC(ano, indiceMesAlvo, diaFinal))
}

/** Prazo para entrega do relatório: 15 dias corridos após a Data da Avaliação. */
export function prazoRelatorio(dataAvaliacaoIso: string): string {
  return addDiasIso(dataAvaliacaoIso, 15)
}

/** Prazo para implementação do PIC: 7 dias corridos após o Prazo do Relatório. */
export function dataImplementacaoPic(prazoRelatorioIso: string): string {
  return addDiasIso(prazoRelatorioIso, 7)
}

/** Prazo de fechamento do ciclo: 6 meses (EDATE) após a Implementação do PIC. */
export function prazoFechamento(dataImplementacaoIso: string): string {
  return addMesesIso(dataImplementacaoIso, 6)
}
