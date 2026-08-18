// Resto do módulo /agenda, removido em 2026-08-17 junto com as páginas
// agenda/pacientes, agenda/terapeutas e agenda/salas. Sobrou só o que o
// AlocarSessaoModal (cronograma de salas) consome via buscarOpcoesFiltro.
export interface AgendaFilterOptions {
  unidades: string[]
  terapeutas: string[]
  terapias: string[]
  salas: string[]
  pacientes: string[]
}
