import type { Tone } from "@/hooks/useToneColor"
import type { CategoriaCompra, Prioridade, StatusSolicitacaoCompra } from "./tipos"

// Rótulos em português e vocabulário de cor do módulo de insumos.
// Porta lib/statusFlow.ts (labels) e lib/comprasCatalogos.ts do AXIUM.

export const STATUS_LABEL: Record<StatusSolicitacaoCompra, string> = {
  SOLICITACAO_CRIADA: "Solicitação criada",
  COTACAO_EM_ANDAMENTO: "Cotação em andamento",
  COTACAO_FINALIZADA: "Cotação finalizada",
  REVISAO_MANUAL: "Revisão manual",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  COMPRA_REALIZADA: "Compra realizada",
  AGUARDANDO_ENTREGA: "Aguardando entrega",
  ENTREGUE: "Entregue",
  PAUSADA: "Pausada",
  CANCELADA: "Cancelada",
}

// ─────────────────────────────────────────────────────────────────────────────
// Cor por status: 12 status, 6 tons
// ─────────────────────────────────────────────────────────────────────────────
// O AXIUM tinha 12 pares de hex cravados, um por status (VISUAL_STATUS em
// components/compras/StatusBadge.tsx) — inclusive dois verdes-água quase iguais
// para APROVADA e COMPRA_REALIZADA. Aqui vale a disciplina do projeto:
// **um tom = um significado** (components/ui/tones.tsx), e a paleta tem 6 tons.
//
// Então o tom não codifica QUAL status é — isso é trabalho do rótulo, que está
// escrito ao lado. O tom codifica a CATEGORIA do status:
//
//   gray   inerte: ainda não andou, ou encerrou sem efeito
//   blue   andando por conta do sistema (o worker está cotando)
//   purple precisa de gente: caiu para revisão manual
//   amber  esperando alguém agir (aprovar, entregar) ou pausado de propósito
//   green  avançou / concluiu
//   red    barrado
//
// Consequência aceita de propósito: APROVADA, COMPRA_REALIZADA e ENTREGUE têm o
// mesmo tom. São três marcos de sucesso, e quem lê a linha lê o rótulo junto.
export const TONE_POR_STATUS: Record<StatusSolicitacaoCompra, Tone> = {
  SOLICITACAO_CRIADA: "gray",
  CANCELADA: "gray",

  COTACAO_EM_ANDAMENTO: "blue",
  COTACAO_FINALIZADA: "blue",

  REVISAO_MANUAL: "purple",

  AGUARDANDO_APROVACAO: "amber",
  AGUARDANDO_ENTREGA: "amber",
  PAUSADA: "amber",

  APROVADA: "green",
  COMPRA_REALIZADA: "green",
  ENTREGUE: "green",

  REPROVADA: "red",
}

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  BAIXA: "Baixa",
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
}

/**
 * Prioridade é escala, não categoria — aqui o tom carrega significado próprio e
 * a leitura é "quanto mais quente, mais urgente". `gray` para BAIXA e não para
 * NORMAL porque NORMAL é o padrão do formulário: a maioria das linhas é NORMAL,
 * e tingir a maioria de azul faria ruído. NORMAL fica sem chip (ver
 * PrioridadeChip).
 */
export const TONE_POR_PRIORIDADE: Record<Prioridade, Tone> = {
  BAIXA: "gray",
  NORMAL: "gray",
  ALTA: "amber",
  URGENTE: "red",
}

/**
 * Ordem de exibição, do mais para o menos urgente. A ordem de declaração do enum
 * (BAIXA→URGENTE) não é a que faz sentido para quem escolhe numa lista.
 */
export const ORDEM_PRIORIDADE_EXIBICAO: Prioridade[] = ["URGENTE", "ALTA", "NORMAL", "BAIXA"]

// ─────────────────────────────────────────────────────────────────────────────
// Categorias e setores
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIA_LABEL: Record<CategoriaCompra, string> = {
  INSUMOS_TERAPEUTICOS: "Insumos terapêuticos",
  EQUIPAMENTOS: "Equipamentos",
  MOVEIS: "Móveis",
  TECNOLOGIA_E_ELETRONICOS: "Tecnologia e eletrônicos",
  HIGIENE_E_LIMPEZA: "Higiene e limpeza",
  MANUTENCAO_E_INFRAESTRUTURA: "Manutenção e infraestrutura",
  PAPELARIA_E_ESCRITORIO: "Papelaria e escritório",
  EPIS_E_SEGURANCA: "EPIs e segurança",
  COPA_E_ALIMENTACAO: "Copa e alimentação",
  SERVICOS: "Serviços",
  OUTROS: "Outros",
}

/** Em OUTROS, o texto livre digitado vale mais que o rótulo genérico. */
export function nomeCategoria(categoria: CategoriaCompra, categoriaOutro?: string | null): string {
  return categoria === "OUTROS" && categoriaOutro ? categoriaOutro : CATEGORIA_LABEL[categoria]
}

export const SETORES_COMPRA = [
  "Recepção",
  "Administrativo",
  "Financeiro",
  "Estoque",
  "Terapia",
  "Enfermagem",
  "TI",
  "Manutenção",
] as const

/**
 * Unidades de medida por extenso, para o dropdown do formulário. A coluna no
 * banco (`unidade_medida`) é `text` livre, sem CHECK — igual ao AXIUM — então
 * esta lista é só curadoria de UI, com o mesmo escape hatch "Outro" do setor.
 */
export const UNIDADES_MEDIDA = [
  "Unidade",
  "Caixa",
  "Pacote",
  "Par",
  "Kit",
  "Rolo",
  "Frasco",
  "Litro",
  "Mililitro",
  "Quilograma",
  "Grama",
  "Metro",
  "Resma",
  "Dúzia",
  "Conjunto",
  "Serviço",
] as const

const REGRAS_CATEGORIA: { categoria: CategoriaCompra; termos: string[] }[] = [
  { categoria: "TECNOLOGIA_E_ELETRONICOS", termos: ["notebook", "computador", "monitor", "teclado", "mouse", "impressora", "celular", "tablet", "roteador", "cabo hdmi"] },
  { categoria: "HIGIENE_E_LIMPEZA", termos: ["detergente", "desinfetante", "sabonete", "papel higiênico", "limpeza", "vassoura", "rodo", "lixeira"] },
  { categoria: "PAPELARIA_E_ESCRITORIO", termos: ["papel a4", "caneta", "lápis", "pasta", "grampeador", "toner", "cartucho", "etiqueta"] },
  { categoria: "EPIS_E_SEGURANCA", termos: ["luva", "máscara", "avental", "epi", "protetor", "capacete", "óculos de proteção"] },
  { categoria: "MOVEIS", termos: ["cadeira", "mesa", "armário", "estante", "gaveteiro", "sofá", "móvel"] },
  { categoria: "MANUTENCAO_E_INFRAESTRUTURA", termos: ["ferramenta", "furadeira", "parafuso", "tinta", "lâmpada", "torneira", "manutenção"] },
  { categoria: "COPA_E_ALIMENTACAO", termos: ["café", "açúcar", "copo", "alimento", "biscoito", "água mineral", "guardanapo"] },
  { categoria: "SERVICOS", termos: ["serviço", "instalação", "consultoria", "licença", "assinatura", "reparo"] },
  { categoria: "EQUIPAMENTOS", termos: ["equipamento", "aparelho", "máquina"] },
  { categoria: "INSUMOS_TERAPEUTICOS", termos: ["terapia", "terapêutico", "sensorial", "fono", "fisioterapia", "ocupacional", "clínico"] },
]

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * Palpite de categoria a partir do que a pessoa digitou. É só pré-seleção do
 * formulário — a primeira regra que casa vence, e a ordem de `REGRAS_CATEGORIA`
 * é a regra de negócio (mais específico antes de mais genérico: "notebook" cai
 * em tecnologia, não em equipamentos).
 */
export function sugerirCategoria(...textos: string[]): CategoriaCompra | "" {
  const texto = semAcento(textos.join(" "))
  return (
    REGRAS_CATEGORIA.find((regra) => regra.termos.some((termo) => texto.includes(semAcento(termo))))
      ?.categoria ?? ""
  )
}
