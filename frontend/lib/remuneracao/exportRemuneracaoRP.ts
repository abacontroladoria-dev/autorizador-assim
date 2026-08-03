// XLSX da aba Remuneração — RP — porte de
// calculadora-remuneracao/src/views/RemuneracaoRP/exportarRemuneracao.js.

import * as XLSX from "xlsx"
import { formatDateBR } from "./datas"
import type { ModalidadeAnalise, ProfRemunReal } from "./calculo"
import type { SessaoReal } from "./relatorio"

const MODALIDADE_LABEL: Record<ModalidadeAnalise, string> = {
  atendimento: "Por atendimento",
  banco_horas: "Banco de horas",
  hibrido: "Banco de horas + atendimento",
}

export type ExportarRemuneracaoRPOpts = {
  resultado: ProfRemunReal[]
  evoRows: SessaoReal[]
  csvName?: string | null
}

function fmtDateObj(d: Date | null | undefined): string {
  if (!d) return ""
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

export function exportarRemuneracaoRPXlsx(opts: ExportarRemuneracaoRPOpts): void {
  const { resultado, evoRows, csvName } = opts
  if (!evoRows.length || !resultado.length) {
    alert("Importe primeiro o relatório csv_grade_profissionais.")
    return
  }

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.map(p => ({
    Profissional: p.prof, Contrato: p.contrato,
    Sessoes_Agendadas: p.agendadas, Evolucoes_Proprias: p.evoluidasProprias,
    Substituicoes_Realizadas: p.substituicoesRealizadas,
    Total_Sessoes_Remuneraveis: p.evoluidasProprias + p.substituicoesRealizadas,
    Substituido_por_Outro: p.substituidoPorOutro, Registros_Nao_Realizados: p.pendentes + p.naoEvoluidas,
    Canceladas: p.canceladas, Inconsistencias: p.inconsistencias,
    Pacientes_Unicos: p.pacientesQtd, Pacientes_CC: p.pacientesCCQtd,
    PE_CC: p.pe, PE_Regra: p.peProporcionalAtivo ? "Regras PE 2026: faixas, evolução e conferências" : "Valor cheio por paciente único",
    PE_Em_Aberto: p.peEmAberto || 0,
    PE_Aguarda_Diretoria: p.peAguardaDiretoria || 0,
    PE_Periodo_Relatorio: p.peRelatorioPeriodo || "",
    Contrato_Antigo_Salario: p.salAntigo,
    Tem_Contrato_Antigo: p.temAntigo ? "Sim" : "Não",
    Remuneracao_Confirmada: p.valorConfirmado,
    Potencial_Apos_Regularizacao: p.valorPotencial,
    // Modelo de faturamento do contrato vigente. Remuneracao_Confirmada continua
    // sendo só a apuração variável (PA/PPD/PE/ETA) — quem soma a folha usa
    // Total_A_Pagar, que é a coluna que inclui o valor fixo do banco de horas.
    Modalidade: MODALIDADE_LABEL[p.modalidade],
    Contratos_Banco_Horas: p.numerosBancoHoras.join(" / "),
    Banco_Horas_Valor_Fixo: p.valorFixoBancoHoras,
    Total_A_Pagar: p.valorTotalAPagar,
  }))), "Resumo por profissional")

  const peDetalhe = resultado.flatMap(p => (p.peDetalhe || []).map(x => ({
    Profissional: p.prof,
    Paciente: x.paciente,
    Id_Favorecido: x.idFavorecido || "",
    Inicio: fmtDateObj(x.inicio),
    Fim: fmtDateObj(x.fim),
    Fim_Usado: fmtDateObj(x.fimUsado),
    Dias_Corridos: x.dias ?? "",
    Dias_Efetivos: x.diasEfetivos ?? x.dias ?? "",
    Dias_Mes: x.diasMes ?? "",
    Valor_PE: x.valor ?? 0,
    Situacao: x.situacao || "",
    Tem_Evolucao: x.temEvolucao ? "Sim" : "Não",
    Sessoes_Evoluidas: x.nSessoesEvoluidas || 0,
    Arredondou_Fim_Mes: x.arredondouFimMes ? "Sim" : "Não",
    Troca_Coordenador: x.trocaCoordenador ? "Sim" : "Não",
    Conflito_Semana: x.conflitoSemana ? "Sim" : "Não",
    Regra: x.observacao || "(dias efetivos / dias do mês) x PE",
  })))
  if (peDetalhe.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peDetalhe), "PE proporcional")

  const sessoesRecebe = resultado.flatMap(p => p.sessoes
    .filter(s => s.papel === "Substituição realizada" || (s.papel === "Agenda" && s.classificacao === "Evolução normal"))
    .map(s => ({
      Profissional: p.prof,
      Tipo: s.papel === "Substituição realizada" ? "Substituição realizada" : "Evolução própria",
      Data: formatDateBR(s.data), Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
      Profissional_Agenda: s.profAgenda, Profissional_Evolucao: s.profCsv,
      Valor_PA: s.valorPATexto ?? s.valorPA ?? 0,
      Funcao_PA: s.funcaoPA || "",
      Regra_PA: s.explicacaoPA || "",
      Status_Financeiro: "Recebe",
    })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesRecebe), "Sessoes que pagam")

  const sessoesPend = resultado.flatMap(p => p.sessoes
    .filter(s => s.papel !== "Substituição realizada" && (s.classificacao === "Pendente retroativa" || s.classificacao === "Não evoluído"))
    .map(s => ({
      Profissional: p.prof, Data: formatDateBR(s.data), Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
      Profissional_Agenda: s.profAgenda, Presenca_Recepcao: s.presencaOrbita, Possui_Tratativa: s.possuiTratativa,
      Valor_PA_Potencial: s.valorPATexto ?? s.valorPA ?? 0,
      Acao: "Regularizar evolução retroativa",
    })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesPend), "Registros pendentes")

  const sessoesPerdidas = resultado.flatMap(p => p.sessoes
    .filter(s => s.papel !== "Substituição realizada" && s.classificacao === "Substituição")
    .map(s => ({
      Profissional_Agenda: s.profAgenda, Profissional_Que_Evoluiu: s.profCsv,
      Data: formatDateBR(s.data), Hora: s.hora, Paciente: s.paciente, Especialidade: s.especialidade,
      Status_Financeiro: "Não recebe: outro profissional evoluiu",
    })))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesPerdidas), "Perdidas para substituicao")

  const sessoesInc = evoRows.filter(r => ["Evolução sem presença", "Cancelado evoluído", "Evolução sem agendamento"].includes(r.classificacao))
    .map(r => ({
      Data: formatDateBR(r.data), Hora: r.hora, Paciente: r.paciente, Especialidade: r.especialidade,
      Profissional_Agenda: r.profAgenda, Profissional_Evolucao: r.profCsv,
      Tipo_Inconsistencia: r.classificacao,
    }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesInc), "Inconsistencias")

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    resultado.filter(p => !p.temAntigo).map(p => ({ Profissional: p.prof, Contrato: p.contrato || "", Remuneracao_Confirmada: p.valorConfirmado }))
  ), "Contratos pendentes")

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evoRows.map(r => ({
    ID: r.id, Data: formatDateBR(r.data), Hora: r.hora, Paciente: r.paciente, Especialidade: r.especialidade,
    Profissional_Agenda: r.profAgenda, Profissional_Evolucao: r.profCsv,
    Presenca_Recepcao: r.presencaOrbita, Possui_Tratativa: r.possuiTratativa,
    Status_CSV: r.statusCsv, Status_Final: r.statusFinal,
    Classificacao: r.classificacao, Motivo: r.motivo,
  }))), "Base auditavel completa")

  const sufixo = (csvName || "relatorio").replace(/\.[^.]+$/, "").replace(/\s+/g, "_")
  XLSX.writeFile(wb, `Remuneracao_real_${sufixo}.xlsx`)
}
