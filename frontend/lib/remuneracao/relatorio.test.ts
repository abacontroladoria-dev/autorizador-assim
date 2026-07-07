import { describe, expect, it } from "vitest"
import { normalizarGradeParaSessao, validarModeloRelatorio } from "./relatorio"

const GRADE_HEADERS = [
  "Id Unidade", "Nome Unidade", "Id Profissional", "Profissional", "CPF do Profissional",
  "Telefone do Profissional", "CBO do Profissional", "Registro do Profissional",
  "Tipo Registro do Profissional", "UF Registro do Profissional", "Dia da Semana", "Data",
  "Hora Inicial", "Hora Final", "Status do Agendamento", "Id Favorecido", "Nome Favorecido",
  "Convênio", "Id Terapia", "Terapia", "Id Terapia Exibição", "Terapia Exibição", "Id Sala",
  "Sala", "Observações da Sala", "ID Agendamento", "Status", "Justificativa",
  "Data Inicial PDI/ABA", "Data Final PDI/ABA", "Id Criador PDI/ABA", "Nome Criador PDI/ABA",
  "Id Terapia(Atividade) PDI/ABA", "Nome Terapia(Atividade) PDI/ABA", "Possui Tratativa",
  "Id Profissional Tratativa", "Nome Profissional Tratativa", "Criação Tratativa",
  "Origem Tratativa", "Vínculo da Evolução", "Agendamento Criado Em", "Agendamento Excluído Em",
]

describe("validarModeloRelatorio - grade", () => {
  it("aceita o cabeçalho real do csv_grade_profissionais", () => {
    expect(validarModeloRelatorio("grade", GRADE_HEADERS).ok).toBe(true)
  })

  it("aceita o novo modelo de agendamentos_profissionais sem CPF e com Unidade", () => {
    const validacao = validarModeloRelatorio("pe", [{
      "Id Profissional": "9313",
      Profissional: "Profissional A",
      "Dia da Semana": "Segunda",
      "Data do Agendamento": "01/06/2026",
      "Hora Inicial": "08:00",
      "Hora Final": "08:40",
      "Data Criação do Agendamento": "10/12/2025 09:19",
      "Número de Celular do R.F.": "21979980000",
      Favorecido: "Paciente X",
      "Id Favorecido": "12469",
      "Id Convênio": "932",
      Convênio: "LEVE SAUDE",
      "Id Especialidade": "2261",
      Especialidade: "Coordenador de Caso",
      Unidade: "CLÍNICA UNIVERSO ABA",
      Sala: "Unid. Realengo - Sala 19",
    }])

    expect(validacao.ok).toBe(true)
    expect(validacao.ausentes).not.toContain("CPF do Profissional")
    expect(validacao.extras).not.toContain("Unidade")
  })
})

describe("normalizarGradeParaSessao", () => {
  it("descarta horários livres (sem agendamento real)", () => {
    const rows = [{
      "Status do Agendamento": "Livre",
      Profissional: "Amanda Bafica",
      "Nome Favorecido": "Ainda não selecionado",
      "ID Agendamento": "",
    }]
    expect(normalizarGradeParaSessao(rows)).toHaveLength(0)
  })

  it("mapeia uma evolução própria realizada", () => {
    const [sessao] = normalizarGradeParaSessao([{
      "Status do Agendamento": "Agendado",
      "ID Agendamento": "2719002",
      Data: "2026-06-01",
      "Hora Inicial": "08:00:00",
      Profissional: "Ingrid Cristina Mello da Costa Dutra",
      "Nome Favorecido": "Gabriel De Sousa Do Nascimento",
      "Convênio": "ASSIM Saúde",
      "Nome Unidade": "CLÍNICA UNIVERSO ABA",
      Terapia: "Psicopedagogia",
      Status: "Realizado",
      Justificativa: "",
      "Possui Tratativa": "Sim",
      "Nome Profissional Tratativa": "Ingrid Cristina Mello da Costa Dutra",
    }])
    expect(sessao.id).toBe("2719002")
    expect(sessao.profAgenda).toBe("Ingrid Cristina Mello da Costa Dutra")
    expect(sessao.profCsv).toBe("Ingrid Cristina Mello da Costa Dutra")
    expect(sessao.presencaTita).toBe("Sim")
    expect(sessao.classificacao).toBe("Evolução normal")
  })

  it("detecta substituição quando Nome Profissional Tratativa difere do Profissional da agenda", () => {
    const [sessao] = normalizarGradeParaSessao([{
      "Status do Agendamento": "Agendado",
      "ID Agendamento": "3257750",
      Data: "2026-06-01",
      "Hora Inicial": "09:20:00",
      Profissional: "João Gabriel Barbosa De Souza",
      "Nome Favorecido": "Davi Caetano Medeiros",
      Terapia: "Aplicador ABA (AE)",
      Status: "Realizado",
      Justificativa: "",
      "Possui Tratativa": "Sim",
      "Nome Profissional Tratativa": "Amanda Martins Rodrigues",
    }])
    expect(sessao.profCsv).toBe("Amanda Martins Rodrigues")
    expect(sessao.classificacao).toBe("Substituição")
  })

  it("marca presencaTita Não quando cancelado por falta do paciente", () => {
    const [sessao] = normalizarGradeParaSessao([{
      "Status do Agendamento": "Agendado",
      "ID Agendamento": "1933247",
      Data: "2026-06-01",
      "Hora Inicial": "09:20:00",
      Profissional: "Ana Beatriz Virginio Da Silva",
      "Nome Favorecido": "Lucas Domingos Marques",
      Terapia: "Psicopedagogia",
      Status: "Cancelado",
      Justificativa: "Falta do Paciente",
      "Possui Tratativa": "Não",
      "Nome Profissional Tratativa": "",
    }])
    expect(sessao.presencaTita).toBe("Não")
    expect(sessao.classificacao).toBe("Cancelado")
  })

  it("mantém presencaTita Sim quando cancelado por falta do profissional (não é falta do paciente)", () => {
    const [sessao] = normalizarGradeParaSessao([{
      "Status do Agendamento": "Agendado",
      "ID Agendamento": "1961533",
      Data: "2026-06-01",
      "Hora Inicial": "08:00:00",
      Profissional: "INATIVO - Tatiana Batista Gomes da Silva",
      "Nome Favorecido": "Samuel Barzano Lagos Castello Branco",
      Terapia: "Aplicador ABA Escola",
      Status: "Cancelado",
      Justificativa: "Falta do Profissional",
      "Possui Tratativa": "Não",
      "Nome Profissional Tratativa": "",
    }])
    expect(sessao.presencaTita).toBe("Sim")
  })
})
