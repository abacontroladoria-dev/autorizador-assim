import { describe, expect, it } from 'vitest';
import { calcularValorDecisao } from './precificacao';

describe('calcularValorDecisao', () => {
  it('usa o à vista quando o anúncio não tem nenhuma opção de parcelamento', () => {
    const resultado = calcularValorDecisao({ valorAVista: 80, valorParceladoSemJuros: null, valorParceladoComJuros: null });
    expect(resultado).toEqual({ valorDecisao: 80, formaPagamentoDecisao: 'AVISTA' });
  });

  it('acima de R$100, prioriza o parcelamento sem juros mesmo custando mais que o à vista', () => {
    const resultado = calcularValorDecisao({
      valorAVista: 3222,
      valorParceladoSemJuros: 3465,
      valorParceladoComJuros: null,
    });
    expect(resultado).toEqual({ valorDecisao: 3465, formaPagamentoDecisao: 'PARCELADO_SEM_JUROS' });
  });

  it('até R$100, escolhe o mais barato entre à vista e parcelado sem juros', () => {
    const maisBaratoAVista = calcularValorDecisao({
      valorAVista: 80,
      valorParceladoSemJuros: 90,
      valorParceladoComJuros: null,
    });
    expect(maisBaratoAVista).toEqual({ valorDecisao: 80, formaPagamentoDecisao: 'AVISTA' });

    const maisBaratoParcelado = calcularValorDecisao({
      valorAVista: 90,
      valorParceladoSemJuros: 80,
      valorParceladoComJuros: null,
    });
    expect(maisBaratoParcelado).toEqual({ valorDecisao: 80, formaPagamentoDecisao: 'PARCELADO_SEM_JUROS' });
  });

  it('acima de R$100, sem opção sem juros, usa o parcelamento com juros como valor total (é o que será pago)', () => {
    const resultado = calcularValorDecisao({
      valorAVista: 1000,
      valorParceladoSemJuros: null,
      valorParceladoComJuros: 1180,
    });
    expect(resultado).toEqual({ valorDecisao: 1180, formaPagamentoDecisao: 'PARCELADO_COM_JUROS' });
  });

  it('até R$100, sem opção sem juros, ainda usa o à vista (parcelamento obrigatório só vale acima do limiar)', () => {
    const resultado = calcularValorDecisao({
      valorAVista: 90,
      valorParceladoSemJuros: null,
      valorParceladoComJuros: 110,
    });
    expect(resultado).toEqual({ valorDecisao: 90, formaPagamentoDecisao: 'AVISTA' });
  });
});
