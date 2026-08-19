// Enums do módulo de insumos/compras, portados do AXIUM.
//
// No AXIUM estes eram enums do Prisma (`@prisma/client`). Aqui o banco é o
// Supabase e o client é `createBrowserClient<any>`, então a fonte de verdade
// passa a ser este arquivo + os CHECK constraints da migration
// 20260817200000_insumos_schema.sql. Os dois têm que andar juntos: mexeu aqui,
// mexeu lá.
//
// Cada enum vem em duas formas — o array `const` (para validar em runtime e
// alimentar <select>) e o tipo derivado dele. Assim não há uma segunda lista
// literal para divergir.

export const PRIORIDADES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export const CATEGORIAS_COMPRA = [
  "INSUMOS_TERAPEUTICOS",
  "EQUIPAMENTOS",
  "MOVEIS",
  "TECNOLOGIA_E_ELETRONICOS",
  "HIGIENE_E_LIMPEZA",
  "MANUTENCAO_E_INFRAESTRUTURA",
  "PAPELARIA_E_ESCRITORIO",
  "EPIS_E_SEGURANCA",
  "COPA_E_ALIMENTACAO",
  "SERVICOS",
  "OUTROS",
] as const
export type CategoriaCompra = (typeof CATEGORIAS_COMPRA)[number]

export const STATUS_SOLICITACAO = [
  "SOLICITACAO_CRIADA",
  "COTACAO_EM_ANDAMENTO",
  "COTACAO_FINALIZADA",
  "REVISAO_MANUAL",
  "AGUARDANDO_APROVACAO",
  "APROVADA",
  "REPROVADA",
  "COMPRA_REALIZADA",
  "AGUARDANDO_ENTREGA",
  "ENTREGUE",
  "PAUSADA",
  "CANCELADA",
] as const
export type StatusSolicitacaoCompra = (typeof STATUS_SOLICITACAO)[number]

export const STATUS_COTACAO_ITEM = ["VALIDADA", "DESCARTADA", "REVISAO_MANUAL"] as const
export type StatusCotacaoItem = (typeof STATUS_COTACAO_ITEM)[number]

export const FORMAS_PAGAMENTO_DECISAO = [
  "AVISTA",
  "PARCELADO_SEM_JUROS",
  "PARCELADO_COM_JUROS",
] as const
export type FormaPagamentoDecisao = (typeof FORMAS_PAGAMENTO_DECISAO)[number]

export const ORIGENS_PRODUTO = ["NACIONAL", "INTERNACIONAL"] as const
export type OrigemProduto = (typeof ORIGENS_PRODUTO)[number]

export const CLASSIFICACOES_EXCEDENTE = ["OTIMO", "ACEITAVEL", "ATENCAO", "EVITAR"] as const
export type ClassificacaoExcedente = (typeof CLASSIFICACOES_EXCEDENTE)[number]

export const DECISOES_APROVACAO = ["APROVAR", "SOLICITAR_NOVA_COTACAO", "REPROVAR"] as const
export type DecisaoAprovacaoCompra = (typeof DECISOES_APROVACAO)[number]

export const STATUS_COTACAO_JOB = ["PENDENTE", "PROCESSANDO", "CONCLUIDO", "FALHOU"] as const
export type StatusCotacaoJob = (typeof STATUS_COTACAO_JOB)[number]

/** `clickup_webhook` ficou de fora — integração com ClickUp pausada no AXIUM. */
export const ORIGENS_HISTORICO = ["SISTEMA", "USUARIO"] as const
export type OrigemHistoricoCompra = (typeof ORIGENS_HISTORICO)[number]
