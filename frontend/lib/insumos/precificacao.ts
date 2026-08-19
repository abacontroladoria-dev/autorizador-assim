// Portado do AXIUM. Única alteração: os dois aliases de tipo abaixo eram
// literais repetidos aqui; agora derivam de ./tipos, que é a lista única. Os
// nomes exportados seguem os mesmos, então nenhum chamador muda.
import type { ClassificacaoExcedente, FormaPagamentoDecisao } from './tipos';

export const LIMIAR_PARCELAMENTO_OBRIGATORIO = 100;

export type FormaPagamentoDecisaoCalculo = FormaPagamentoDecisao;

export interface EntradaValorDecisao {
  valorAVista: number;
  /** Total pago se optar pelas parcelas sem juros; `null` quando o anúncio não oferece essa opção. */
  valorParceladoSemJuros: number | null;
  /** Total pago se optar pelas parcelas com juros; `null` quando o anúncio não oferece essa opção. */
  valorParceladoComJuros: number | null;
}

export interface ResultadoValorDecisao {
  valorDecisao: number;
  formaPagamentoDecisao: FormaPagamentoDecisaoCalculo;
}

/**
 * Regra de compra — o "valor total" sempre reflete o que de fato será pago:
 * - Compra de R$100 ou menos -> compara à vista e parcelado sem juros, fica com o mais barato.
 * - Compra acima de R$100 -> sempre parcelado (nunca se paga à vista):
 *   prioriza o parcelamento sem juros; na falta dele, usa o parcelamento com
 *   juros (é o valor total que será efetivamente pago, mesmo custando mais).
 * - Sem nenhuma opção de parcelamento -> paga à vista.
 */
export function calcularValorDecisao({
  valorAVista,
  valorParceladoSemJuros,
  valorParceladoComJuros,
}: EntradaValorDecisao): ResultadoValorDecisao {
  if (valorParceladoSemJuros !== null) {
    if (valorAVista > LIMIAR_PARCELAMENTO_OBRIGATORIO) {
      return { valorDecisao: valorParceladoSemJuros, formaPagamentoDecisao: 'PARCELADO_SEM_JUROS' };
    }
    return valorParceladoSemJuros < valorAVista
      ? { valorDecisao: valorParceladoSemJuros, formaPagamentoDecisao: 'PARCELADO_SEM_JUROS' }
      : { valorDecisao: valorAVista, formaPagamentoDecisao: 'AVISTA' };
  }

  if (valorParceladoComJuros !== null && valorAVista > LIMIAR_PARCELAMENTO_OBRIGATORIO) {
    return { valorDecisao: valorParceladoComJuros, formaPagamentoDecisao: 'PARCELADO_COM_JUROS' };
  }

  return { valorDecisao: valorAVista, formaPagamentoDecisao: 'AVISTA' };
}

/**
 * Arredonda "metade para cima" (2.675 -> 2.68), evitando o erro clássico de
 * `Math.round(valor*fator)/fator` em ponto flutuante binário (ex.:
 * `1.005*100` vira `100.49999999999999`, arredondando errado para 1.00 em vez
 * de 1.01). `toPrecision(15)` recupera o valor decimal real antes de
 * arredondar — 15 dígitos significativos é o limite confiável de um double.
 * Só serve para valores não-negativos (todo dinheiro/quantidade neste módulo
 * é >= 0; para negativos, `Math.round` arredonda em direção a +Infinito, não
 * "para longe do zero").
 */
export function arredondarMetadeParaCima(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  const semRuidoBinario = Number((valor * fator).toPrecision(15));
  return Math.round(semRuidoBinario) / fator;
}

export type ClassificacaoExcedenteCalculo = ClassificacaoExcedente;

/** Faixas do excedente (fração `quantidadeExcedente / quantidadeSolicitada`). */
export function classificarExcedente(percentualExcedente: number): ClassificacaoExcedenteCalculo {
  if (percentualExcedente <= 0.1) return 'OTIMO';
  if (percentualExcedente <= 0.3) return 'ACEITAVEL';
  if (percentualExcedente <= 0.7) return 'ATENCAO';
  return 'EVITAR';
}

export interface EntradaExcedente {
  /** Quantidade que o solicitante pediu (não a quantidade de embalagens). */
  quantidadeSolicitada: number;
  /** Quantidade total de unidades que essa cotação de fato entrega (embalagens × unidades por embalagem). */
  quantidadeComprada: number;
  valorTotalComFrete: number;
}

export interface ResultadoExcedente {
  quantidadeExcedente: number;
  /** Fração (0.25 = 25%), não 0-100 — a UI decide como formatar. */
  percentualExcedente: number;
  /** Custo real por unidade solicitada (não por unidade comprada) — nunca decide o ranking, é só informativo. */
  valorUnitarioEfetivo: number;
  classificacaoExcedente: ClassificacaoExcedenteCalculo;
}

/**
 * Custo real da compra em relação ao que foi pedido — nunca decide o ranking
 * (isso é `calcularValorDecisao`), só classifica o desperdício de comprar em
 * embalagens fechadas quando a quantidade pedida não é múltiplo exato delas.
 */
export function calcularExcedente({
  quantidadeSolicitada,
  quantidadeComprada,
  valorTotalComFrete,
}: EntradaExcedente): ResultadoExcedente {
  if (quantidadeSolicitada <= 0) throw new Error('quantidadeSolicitada deve ser maior que zero');

  const quantidadeExcedente = quantidadeComprada - quantidadeSolicitada;
  const percentualExcedente = quantidadeExcedente / quantidadeSolicitada;
  const valorUnitarioEfetivo = arredondarMetadeParaCima(valorTotalComFrete / quantidadeSolicitada, 2);

  return {
    quantidadeExcedente,
    percentualExcedente,
    valorUnitarioEfetivo,
    classificacaoExcedente: classificarExcedente(percentualExcedente),
  };
}
