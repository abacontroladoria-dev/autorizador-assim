// Portado do AXIUM. Única alteração: o enum vinha de `@prisma/client`; aqui
// vem de ./tipos, que espelha os CHECK constraints da migration.
import type { DecisaoAprovacaoCompra, StatusSolicitacaoCompra } from './tipos';

/** Guarda de transição de status — evita pular etapas via chamada direta à API. */
export function garantirStatusPermitido(
  atual: StatusSolicitacaoCompra,
  permitidos: StatusSolicitacaoCompra[],
  acao: string,
): void {
  if (!permitidos.includes(atual)) {
    throw new Error(`Não é possível ${acao} uma solicitação com status "${atual}"`);
  }
}

export interface DecisaoAprovacaoParaValidar {
  decisao: DecisaoAprovacaoCompra;
  cotacaoEscolhidaId?: string | null;
  justificativa?: string | null;
}

/** Validação que precisa rodar ANTES do insert em AprovacaoCompra, não depois. */
export function validarDecisaoAprovacao(decisao: DecisaoAprovacaoParaValidar): void {
  if (decisao.decisao === 'APROVAR' && !decisao.cotacaoEscolhidaId) {
    throw new Error('cotacaoEscolhidaId é obrigatório para aprovar');
  }
  if (decisao.decisao === 'REPROVAR' && !decisao.justificativa) {
    throw new Error('Justificativa é obrigatória para reprovar');
  }
}
