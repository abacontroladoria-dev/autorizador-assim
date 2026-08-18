// Fonte única de verdade para permissões → rotas.
// IMPORTANTE: este módulo é puro (sem import do supabase) para poder ser
// importado tanto no client (Sidebar) quanto no proxy server-side.

// Permissões padrão por setor (role). O role `cronograma` é um setor novo
// que ainda não tem módulos próprios — por ora recebe apenas o dashboard.
// `disponibilidade_terapeuta` não entra aqui: tem fluxo dedicado e rota pública.
export const roleDefaults: Record<string, string[]> = {
  admin: [
    'dashboard', 'atendimentos', 'gestao',
    'escala_terapeutica',
    'auditoria_assim', 'usuarios', 'permissoes', 'cco',
    'autorizacoes', 'preauditoria', 'outros_convenios',
    'cronograma_solicitacoes', 'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'cronograma_disponibilidade_interna',
    'ocupacao_clinica', 'ocupacao_clinica_gaps', 'ocupacao_clinica_inconsistencias',
    'ocupacao_profissionais', 'indicadores_ocupacao_unidades',
    'indicadores_pacientes', 'indicadores_previsao_receitas', 'indicadores_historico_receitas',
    'indicadores_comparativo_sessoes',
    'reposicao_faltas', 'cronograma_ocupacao_salas',
    'cronograma_valores_convenio', 'cadastros_feriados', 'cadastros_contratos', 'cadastros_taxas',
    'analise_tratativas',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual',
    'cadastros_pacientes', 'cadastros_profissionais',
    'cronograma_por_paciente', 'cronograma_por_profissional',
  ],
  diretoria: [
    'dashboard', 'atendimentos', 'gestao',
    'escala_terapeutica', 'auditoria_assim',
    'preauditoria', 'outros_convenios',
    'cronograma_solicitacoes', 'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'cronograma_disponibilidade_interna',
    'ocupacao_clinica', 'ocupacao_clinica_gaps', 'ocupacao_clinica_inconsistencias',
    'ocupacao_profissionais', 'indicadores_ocupacao_unidades',
    'indicadores_pacientes', 'indicadores_previsao_receitas', 'indicadores_historico_receitas',
    'indicadores_comparativo_sessoes',
    'reposicao_faltas', 'cronograma_ocupacao_salas',
    'cronograma_valores_convenio', 'cadastros_feriados', 'cadastros_contratos', 'cadastros_taxas',
    'analise_tratativas',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual',
    'cadastros_pacientes', 'cadastros_profissionais',
    'cronograma_por_paciente', 'cronograma_por_profissional',
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
    'cadastros_feriados', 'cadastros_contratos', 'cadastros_taxas',
    'relacionamento_prestador_analise', 'relacionamento_prestador_rp',
    'relacionamento_prestador_individual',
  ],
  // Ocupação de Salas, Cadastro de Valores de Convênio e Reposição de Faltas
  // foram retiradas deste papel em 2026-07-24 a pedido do usuário — ficam
  // restritas a admin/diretoria (a RLS das tabelas por trás também foi
  // restringida junto, ver 20260724200000_restringir_cronograma_role_admin_diretoria.sql).
  cronograma: [
    'dashboard', 'cronograma_solicitacoes',
    'cronograma_saida_profissional', 'cronograma_ocupacao_paciente',
    'cronograma_disponibilidade_interna',
    'ocupacao_clinica', 'ocupacao_clinica_gaps', 'ocupacao_clinica_inconsistencias',
    'cadastros_pacientes', 'cadastros_profissionais',
    'cronograma_por_paciente', 'cronograma_por_profissional',
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
  escala_terapeutica: ['/central-terapeutas'],
  auditoria_assim: ['/auditoria-assim'],
  usuarios: ['/admin'],
  permissoes: ['/admin/permissoes'],
  cco: ['/cco'],
  autorizacoes: ['/autorizacoes'],
  preauditoria: ['/preauditoria'],
  outros_convenios: ['/outros-convenios'],
  cronograma_solicitacoes: ['/relacionamento-prestador/solicitacoes'],
  cronograma_saida_profissional: ['/cronograma/saida-profissional'],
  cronograma_ocupacao_paciente: ['/cronograma/ocupacao-paciente'],
  cronograma_disponibilidade_interna: ['/relacionamento-prestador/ocupar-profissionais-disponiveis'],
  // Mesmo padrão de Indicadores: /cronograma/ocupacao tem 3 abas
  // (Aceites e Recusas, Diferença: Laudo e Oferta, Inconsistências e
  // Exceções), cada uma com seu próprio código de permissão.
  ocupacao_clinica: ['/cronograma/ocupacao?tab=acompanhamento'],
  ocupacao_clinica_gaps: ['/cronograma/ocupacao?tab=gaps'],
  ocupacao_clinica_inconsistencias: ['/cronograma/ocupacao?tab=inconsistencias'],
  // Indicadores: uma rota só (/cronograma/indicadores), abas diferenciadas por
  // ?tab=. Cada aba tem seu próprio código de permissão — ver routeMatches()
  // abaixo, que sabe comparar rota+querystring (não só pathname) pra isso
  // funcionar tanto no Sidebar quanto no proxy.ts (gate real, server-side).
  ocupacao_profissionais: ['/cronograma/indicadores?tab=profissionais'],
  indicadores_ocupacao_unidades: ['/cronograma/indicadores?tab=unidades'],
  indicadores_pacientes: ['/cronograma/indicadores?tab=pacientes'],
  indicadores_previsao_receitas: ['/cronograma/indicadores?tab=previsao-receitas'],
  indicadores_historico_receitas: ['/cronograma/indicadores?tab=historico-receitas'],
  indicadores_comparativo_sessoes: ['/cronograma/indicadores?tab=comparativo-sessoes'],
  reposicao_faltas: ['/cronograma/reposicao'],
  cronograma_ocupacao_salas: ['/relacionamento-prestador/ocupacao-salas'],
  cronograma_valores_convenio: ['/cadastros/cadastro-valores'],
  cadastros_feriados: ['/cadastros/feriados'],
  cadastros_contratos: ['/cadastros/contratos'],
  cadastros_taxas: ['/cadastros/taxas-e-parametros'],
  analise_tratativas: ['/analise-tratativas'],
  relacionamento_prestador_analise: ['/relacionamento-prestador/analise'],
  relacionamento_prestador_rp: ['/relacionamento-prestador/rp'],
  relacionamento_prestador_individual: ['/relacionamento-prestador/individual'],
  relacionamento_prestador_pep: ['/relacionamento-prestador/pep'],
  relacionamento_prestador_pep_historico: ['/relacionamento-prestador/pep-historico'],
  // Sistema próprio de agendamentos/grade (nativo, substituindo gradualmente
  // o TiTa Therapy) — ver supabase/migrations/20260812140000_create_reboot_pacientes.sql.
  cadastros_pacientes: ['/cadastros/pacientes'],
  cadastros_profissionais: ['/cadastros/profissionais'],
  cronograma_por_paciente: ['/cronograma/por-paciente'],
  cronograma_por_profissional: ['/cronograma/por-profissional'],
}

// Converte um conjunto de códigos de permissão em rotas permitidas,
// garantindo que '/' esteja sempre presente.
export function codigosToRotas(codigos: Iterable<string>): string[] {
  const rotas = [...codigos].flatMap((c) => CODIGO_PARA_ROTAS[c] ?? [])
  if (!rotas.includes('/')) rotas.unshift('/')
  return rotas
}

// Compara um pathname+querystring contra uma rota de CODIGO_PARA_ROTAS, que
// pode vir só com pathname ("/x/y") ou com querystring embutida
// ("/x/y?tab=z") — nesse segundo caso, todo par chave=valor da rota precisa
// bater com o search recebido, não só o pathname. Rotas sem "?" continuam
// se comportando exatamente como antes (só pathname importa).
export function routeMatches(pathname: string, search: string, route: string): boolean {
  const [routePath, routeQuery] = route.split('?')
  const pathOk = pathname === routePath || pathname.startsWith(routePath + '/')
  if (!pathOk) return false
  if (!routeQuery) return true

  const params = new URLSearchParams(search)
  const routeParams = new URLSearchParams(routeQuery)
  for (const [key, value] of routeParams) {
    if (params.get(key) !== value) return false
  }
  return true
}

// Mesma checagem, mas contra uma lista de rotas permitidas (basta uma bater).
export function hasRouteAccess(pathname: string, search: string, allowedRoutes: string[]): boolean {
  return allowedRoutes.some((route) => routeMatches(pathname, search, route))
}
