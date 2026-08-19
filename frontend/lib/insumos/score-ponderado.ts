import { arredondarMetadeParaCima } from './precificacao';
import type { FormaPagamentoDecisaoCalculo } from './precificacao';

export interface CandidatoParaScorePonderado {
  scoreCompatibilidade: number;
  valorTotalComFrete: number;
  valorUnitarioEfetivo: number;
  /** Fração (0.25 = 25%), não 0-100. */
  percentualExcedente: number;
  formaPagamentoDecisao: FormaPagamentoDecisaoCalculo;
  prazoEntregaOrdemDias: number;
  lojaOficial: boolean;
  vendas: number;
}

export interface BreakdownScorePonderado {
  scorePonderadoAderencia: number;
  scorePonderadoValorReal: number;
  scorePonderadoUnitarioEfetivo: number;
  scorePonderadoExcedente: number;
  scorePonderadoParcelamento: number;
  scorePonderadoPrazo: number;
  scorePonderadoReputacao: number;
  /** Soma ponderada dos 7 sub-scores — puramente informativo, nunca decide o ranking (isso é `valorDecisao`). */
  scorePonderado: number;
}

const PESOS = {
  aderencia: 30,
  valorReal: 25,
  unitarioEfetivo: 15,
  excedente: 10,
  parcelamento: 8,
  prazo: 7,
  reputacao: 5,
} as const;

const PONTOS_PARCELAMENTO: Record<FormaPagamentoDecisaoCalculo, number> = {
  PARCELADO_SEM_JUROS: 100,
  AVISTA: 70,
  PARCELADO_COM_JUROS: 40,
};

/** Menor valor = melhor = 100. Sem isso, `max === min` (candidato único ou empate) daria divisão por zero. */
function normalizarInvertido(valores: number[]): number[] {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (max === min) return valores.map(() => 100);
  return valores.map((valor) => ((max - valor) / (max - min)) * 100);
}

/** Maior valor = melhor = 100. */
function normalizarDireto(valores: number[]): number[] {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (max === min) return valores.map(() => 100);
  return valores.map((valor) => ((valor - min) / (max - min)) * 100);
}

/**
 * 7 critérios, 3 estratégias de normalização diferentes:
 * - Aderência usa `scoreCompatibilidade` direto (já é uma escala absoluta 0-100).
 * - Valor real, unitário efetivo, excedente e prazo são min-max invertido
 *   sobre os candidatos do mesmo lote (menor = melhor).
 * - Parcelamento é categórico (mapeamento fixo, não é contínuo).
 * - Reputação combina vendas (min-max direto) com loja oficial (binário).
 *
 * Precisa do lote inteiro pra normalizar — não dá pra calcular candidato a
 * candidato isoladamente. Puramente informativo: não influencia o ranking
 * (`valorDecisao`) nem o gate de revisão manual.
 */
export function calcularScorePonderadoEmLote(candidatos: CandidatoParaScorePonderado[]): BreakdownScorePonderado[] {
  if (candidatos.length === 0) return [];

  const valorRealNormalizado = normalizarInvertido(candidatos.map((c) => c.valorTotalComFrete));
  const unitarioNormalizado = normalizarInvertido(candidatos.map((c) => c.valorUnitarioEfetivo));
  const excedenteNormalizado = normalizarInvertido(candidatos.map((c) => c.percentualExcedente));
  const prazoNormalizado = normalizarInvertido(candidatos.map((c) => c.prazoEntregaOrdemDias));
  const vendasNormalizado = normalizarDireto(candidatos.map((c) => c.vendas));

  return candidatos.map((candidato, indice) => {
    const scorePonderadoAderencia = candidato.scoreCompatibilidade;
    const scorePonderadoValorReal = valorRealNormalizado[indice]!;
    const scorePonderadoUnitarioEfetivo = unitarioNormalizado[indice]!;
    const scorePonderadoExcedente = excedenteNormalizado[indice]!;
    const scorePonderadoParcelamento = PONTOS_PARCELAMENTO[candidato.formaPagamentoDecisao];
    const scorePonderadoPrazo = prazoNormalizado[indice]!;
    const scorePonderadoReputacao = 0.6 * vendasNormalizado[indice]! + 0.4 * (candidato.lojaOficial ? 100 : 0);

    const scorePonderado = arredondarMetadeParaCima(
      (scorePonderadoAderencia * PESOS.aderencia +
        scorePonderadoValorReal * PESOS.valorReal +
        scorePonderadoUnitarioEfetivo * PESOS.unitarioEfetivo +
        scorePonderadoExcedente * PESOS.excedente +
        scorePonderadoParcelamento * PESOS.parcelamento +
        scorePonderadoPrazo * PESOS.prazo +
        scorePonderadoReputacao * PESOS.reputacao) /
        100,
    );

    return {
      scorePonderadoAderencia: arredondarMetadeParaCima(scorePonderadoAderencia),
      scorePonderadoValorReal: arredondarMetadeParaCima(scorePonderadoValorReal),
      scorePonderadoUnitarioEfetivo: arredondarMetadeParaCima(scorePonderadoUnitarioEfetivo),
      scorePonderadoExcedente: arredondarMetadeParaCima(scorePonderadoExcedente),
      scorePonderadoParcelamento,
      scorePonderadoPrazo: arredondarMetadeParaCima(scorePonderadoPrazo),
      scorePonderadoReputacao: arredondarMetadeParaCima(scorePonderadoReputacao),
      scorePonderado,
    };
  });
}
