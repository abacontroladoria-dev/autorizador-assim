import {
  Ban,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Flame,
  PackageCheck,
  PauseCircle,
  Search,
  ShoppingCart,
  Truck,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import type { Prioridade, StatusSolicitacaoCompra } from "./tipos"

// Ícone por status: a metade não-cor do vocabulário visual do módulo.
//
// TONE_POR_STATUS (rotulos.ts) diz a CATEGORIA (gray/blue/purple/amber/green/red)
// e é deliberadamente grosseiro — três desfechos de sucesso dividem o mesmo
// verde. Este mapa cobre o que a cor não cobre: qual é o status EXATO, pela
// forma do ícone, não pelo tom. Os dois juntos leem-se sem legenda: "azul +
// lupa" é sempre cotação rodando, nunca outra coisa.
//
// A ordem de leitura destes doze ícones (documento → lupa → check → pessoa →
// relógio → check → x → carrinho → caminhão → pacote, com pausa/cancelado à
// parte) é a esteira do módulo: criação, cotação, decisão, compra, entrega.
export const ICONE_POR_STATUS: Record<StatusSolicitacaoCompra, LucideIcon> = {
  SOLICITACAO_CRIADA: FileText,
  COTACAO_EM_ANDAMENTO: Search,
  COTACAO_FINALIZADA: FileCheck2,
  REVISAO_MANUAL: UserCheck,
  AGUARDANDO_APROVACAO: Clock3,
  APROVADA: CheckCircle2,
  REPROVADA: XCircle,
  COMPRA_REALIZADA: ShoppingCart,
  AGUARDANDO_ENTREGA: Truck,
  ENTREGUE: PackageCheck,
  PAUSADA: PauseCircle,
  CANCELADA: Ban,
}

/** Só URGENTE ganha ícone — é a única prioridade que precisa saltar aos olhos na tabela. */
export const ICONE_POR_PRIORIDADE: Partial<Record<Prioridade, LucideIcon>> = {
  URGENTE: Flame,
}
