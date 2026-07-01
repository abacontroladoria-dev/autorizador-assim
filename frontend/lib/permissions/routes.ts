// Fonte única de verdade para permissões → rotas.
// IMPORTANTE: este módulo é puro (sem import do supabase) para poder ser
// importado tanto no client (Sidebar) quanto no proxy server-side.

// Permissões padrão por setor (role). O role `cronograma` é um setor novo
// que ainda não tem módulos próprios — por ora recebe apenas o dashboard.
// `disponibilidade_terapeuta` não entra aqui: tem fluxo dedicado e rota pública.
export const roleDefaults: Record<string, string[]> = {
  admin: [
    'dashboard', 'atendimentos', 'gestao', 'cronograma',
    'escala_terapeutica', 'agenda_terapeutica', 'salas',
    'guias_digitais', 'auditoria_assim', 'usuarios', 'permissoes', 'cco',
    'autorizacoes', 'preauditoria', 'outros_convenios',
    'cronograma_solicitacoes', 'ocupacao_clinica', 'ocupacao_profissionais',
  ],
  diretoria: [
    'dashboard', 'atendimentos', 'gestao',
    'escala_terapeutica', 'auditoria_assim',
    'preauditoria', 'outros_convenios',
    'cronograma_solicitacoes', 'ocupacao_clinica', 'ocupacao_profissionais',
  ],
  recepcao: [
    'dashboard', 'atendimentos', 'gestao', 'auditoria_assim',
    'autorizacoes', 'outros_convenios',
  ],
  autorizacao: [
    'dashboard', 'auditoria_assim',
    'autorizacoes', 'preauditoria',
  ],
  terapeutico: ['dashboard', 'escala_terapeutica'],
  faturamento: ['dashboard'],
  rp: ['dashboard', 'escala_terapeutica'],
  cronograma: ['dashboard', 'cronograma_solicitacoes', 'ocupacao_clinica', 'ocupacao_profissionais'],
}

export function getRoleDefaultPermissions(role: string): string[] {
  return roleDefaults[role] ?? []
}

// Mapeamento código de permissão → rota(s) da aplicação.
export const CODIGO_PARA_ROTAS: Record<string, string[]> = {
  dashboard: ['/'],
  atendimentos: ['/solicitar'],
  gestao: ['/central-pacientes'],
  cronograma: ['/agenda/pacientes'],
  escala_terapeutica: ['/central-terapeutas'],
  agenda_terapeutica: ['/agenda/terapeutas'],
  salas: ['/agenda/salas'],
  guias_digitais: ['/guias-digitais'],
  auditoria_assim: ['/auditoria-assim'],
  usuarios: ['/admin'],
  permissoes: ['/admin/permissoes'],
  cco: ['/cco'],
  autorizacoes: ['/autorizacoes'],
  preauditoria: ['/preauditoria'],
  outros_convenios: ['/outros-convenios'],
  cronograma_solicitacoes: ['/cronograma/solicitacoes'],
  ocupacao_clinica: ['/cronograma/ocupacao'],
  ocupacao_profissionais: ['/cronograma/indicadores'],
}

// Converte um conjunto de códigos de permissão em rotas permitidas,
// garantindo que '/' esteja sempre presente.
export function codigosToRotas(codigos: Iterable<string>): string[] {
  const rotas = [...codigos].flatMap((c) => CODIGO_PARA_ROTAS[c] ?? [])
  if (!rotas.includes('/')) rotas.unshift('/')
  return rotas
}
