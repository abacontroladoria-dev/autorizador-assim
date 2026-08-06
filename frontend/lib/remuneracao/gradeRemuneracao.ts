// Busca a grade para a Análise Futura direto do Supabase, SEM upload. Mesmo
// recorte de frontend/lib/cronograma/gradeService.ts (unidade 280, slots Livre
// inclusive), mapeando para o formato de colunas que a Análise Futura espera
// (ver Apêndice A.3 do plano). A leitura em si vive em lib/grade/fonte.ts.

import { buscarGrade, fixMojibake } from "@/lib/grade/fonte"
import type { CsvRow } from "@/types/cronograma"

// profissional_id é a chave estável do profissional no TiTa: quando alguém é
// desligado o nome vira "INATIVO-<nome>" aqui, mas o id continua o mesmo e o
// agenda_tita ainda guarda o nome limpo sob ele (ver getUltimoAtendimentoAtivo).
const FIELDS = "paciente_id, paciente_nome, dia_semana, hora_inicial, hora_final, profissional_id, profissional_nome, terapia_nome, status_agendamento, sala_nome, data, unidade_nome"

const DIAS_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

function diaSemanaDeData(data: string | null): string {
  if (!data) return ""
  return DIAS_PT[new Date(`${data}T12:00:00`).getDay()] ?? ""
}

export async function buscarGradeParaAnalise(dataInicio: string, dataFim: string): Promise<CsvRow[]> {
  // A view já garante `ativo` — o filtro que aqui é especialmente crítico,
  // porque esta consulta alimenta o cálculo de remuneração e contar a sessão
  // remarcada duas vezes pagaria em dobro.
  const all = await buscarGrade<Record<string, string | number | null>>({
    campos: FIELDS,
    fonte: "base",
    unidade: 280,
    de: dataInicio,
    ate: dataFim,
    ordem: [
      { coluna: "data" },
      { coluna: "hora_inicial" },
      { coluna: "profissional_nome" },
      { coluna: "id" },
    ],
  })

  return all.map(r => {
    const salaNome = fixMojibake(r.sala_nome as string | null)
    return {
      "Id Favorecido": String(r.paciente_id ?? ""),
      "Nome Favorecido": fixMojibake(r.paciente_nome as string | null),
      "Dia da Semana": (r.dia_semana as string) || diaSemanaDeData(r.data as string | null),
      "Hora Inicial": String(r.hora_inicial ?? "").slice(0, 5),
      "Hora Final": String(r.hora_final ?? "").slice(0, 5),
      "Terapia": fixMojibake(r.terapia_nome as string | null),
      "Id Profissional": String(r.profissional_id ?? ""),
      "Profissional": fixMojibake(r.profissional_nome as string | null),
      "Status do Agendamento": (r.status_agendamento as string) ?? "",
      "Sala": salaNome,
      "Data": (r.data as string) ?? "",
      "Unidade": fixMojibake(r.unidade_nome as string | null),
    } as unknown as CsvRow
  })
}
