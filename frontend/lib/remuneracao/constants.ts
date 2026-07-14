// Migrado de calculadora-remuneracao/src/constants/{brand,nomes}.js
// Isolado de lib/cronograma (pasta própria, aditiva e reversível).

export const normKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

export const NOMES_FALSOS = [
  "Notificação Prévia", "Horário Bloqueado", "Ainda não selecionado", "Horário Reservado",
]

export const IDS_FAVORECIDOS_FALSOS = [
  "17795", "18565", "19196", "20471", "20472", "20473",
  "20475", "20476", "20477", "20478", "20479",
  "Ainda não selecionado",
]

export const PACIENTES_FICTICIOS_POR_ID: Record<string, string> = {
  "17795": "Notificação Prévia",
  "18565": "Horário Administrativo",
  "19196": "Horário Bloqueado",
  "20471": "Alinhamento Sandra",
  "20472": "Alinhamento Gracielle",
  "20473": "Alinhamento Amanda",
  "20475": "Supervisor Severino Junior",
  "20476": "Supervisora Michelle Brasil",
  "20477": "Supervisora Susane Vitória",
  "20478": "Supervisora Beatriz Paiva",
  "20479": "Supervisora Fernanda Lima",
}

export const NOMES_FALSOS_PREFIXOS = ["Supervisor", "Supervisora", "Alinhamento"]

export const ETA_ADMIN_NOMES = ["Horário Administrativo"]

export const PROFS_IGNORAR = ["Profissional Teste", "Testes Técnicos", "Combinar Consulta"]
