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
    'cronograma_solicitacoes', 'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'ocupacao_clinica', 'ocupacao_profissionais', 'reposicao_faltas',
    'analise_tratativas',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual', 'relacionamento_prestador_config',
    'relacionamento_prestador_historico', 'relacionamento_prestador_legenda',
  ],
  diretoria: [
    'dashboard', 'atendimentos', 'gestao',
    'escala_terapeutica', 'auditoria_assim',
    'preauditoria', 'outros_convenios',
    'cronograma_solicitacoes', 'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'ocupacao_clinica', 'ocupacao_profissionais', 'reposicao_faltas',
    'analise_tratativas',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual', 'relacionamento_prestador_config',
    'relacionamento_prestador_historico', 'relacionamento_prestador_legenda',
  ],
  recepcao: [
    'dashboard', 'atendimentos', 'gestao', 'auditoria_assim',
    'autorizacoes', 'outros_convenios',
  ],
  autorizacao: [
    'dashboard', 'auditoria_assim',
    'autorizacoes', 'preauditoria',
  ],
  terapeutico: ['dashboard', 'escala_terapeutica', 'analise_tratativas'],
  faturamento: ['dashboard'],
  rp: [
    'dashboard', 'escala_terapeutica',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual', 'relacionamento_prestador_config',
    'relacionamento_prestador_historico', 'relacionamento_prestador_legenda',
  ],
  cronograma: [
    'dashboard', 'cronograma_solicitacoes',
    'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'ocupacao_clinica', 'reposicao_faltas',
  ],
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
  cronograma_saida_profissional: ['/cronograma/saida-profissional'],
  cronograma_ocupacao_paciente: ['/cronograma/ocupacao-paciente'],
  ocupacao_clinica: ['/cronograma/ocupacao'],
  ocupacao_profissionais: ['/cronograma/indicadores'],
  reposicao_faltas: ['/cronograma/reposicao'],
  analise_tratativas: ['/analise-tratativas'],
  relacionamento_prestador_analise: ['/relacionamento-prestador/analise'],
  relacionamento_prestador_rp: ['/relacionamento-prestador/rp'],
  relacionamento_prestador_individual: ['/relacionamento-prestador/individual'],
  relacionamento_prestador_config: ['/relacionamento-prestador/config'],
  relacionamento_prestador_historico: ['/relacionamento-prestador/historico'],
  relacionamento_prestador_legenda: ['/relacionamento-prestador/legenda'],
}

// Converte um conjunto de códigos de permissão em rotas permitidas,
// garantindo que '/' esteja sempre presente.
export function codigosToRotas(codigos: Iterable<string>): string[] {
  const rotas = [...codigos].flatMap((c) => CODIGO_PARA_ROTAS[c] ?? [])
  if (!rotas.includes('/')) rotas.unshift('/')
  return rotas
}
