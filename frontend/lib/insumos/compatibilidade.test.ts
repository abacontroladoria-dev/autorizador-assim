import { describe, expect, it } from 'vitest';
import { calcularScoreCompatibilidade, SCORE_MINIMO_COMPATIBILIDADE } from './compatibilidade';

describe('calcularScoreCompatibilidade', () => {
  it('pontua alto um produto com a mesma capacidade e descrição próxima', () => {
    const score = calcularScoreCompatibilidade(
      'Caixa organizadora plastica com tampa 50L',
      'Caixa organizadora plastica 50L com tampa',
    );
    expect(score).toBeGreaterThanOrEqual(SCORE_MINIMO_COMPATIBILIDADE);
  });

  it('pontua baixo um produto claramente diferente do solicitado', () => {
    const score = calcularScoreCompatibilidade(
      'Caixa organizadora plastica com tampa 50L',
      'Kit organizador de gaveta pequeno',
    );
    expect(score).toBeLessThan(SCORE_MINIMO_COMPATIBILIDADE);
  });

  it('penaliza capacidade divergente mesmo com termos parecidos', () => {
    const scoreMesmaCapacidade = calcularScoreCompatibilidade('caixa organizadora 50L', 'caixa organizadora 50L');
    const scoreCapacidadeDiferente = calcularScoreCompatibilidade('caixa organizadora 50L', 'caixa organizadora 5L');

    expect(scoreCapacidadeDiferente).toBeLessThan(scoreMesmaCapacidade);
  });

  it('trata "mais de 8GB RAM" como piso: um anúncio com mais RAM não deve ser penalizado', () => {
    const especificacao = 'Notebook I5, mais de 8GB de RAM, 256GB SSD ou maior';
    const scoreComMais = calcularScoreCompatibilidade(especificacao, 'Notebook I5 16GB RAM 512GB SSD');
    const scoreComMenos = calcularScoreCompatibilidade(especificacao, 'Notebook I5 4GB RAM 128GB SSD');

    expect(scoreComMais).toBeGreaterThan(scoreComMenos);
  });

  it('não penaliza quando o anúncio não menciona RAM/armazenamento (sinal ausente, não contrário)', () => {
    const especificacao = 'Notebook I5, mais de 8GB de RAM, 256GB SSD ou maior';
    const scoreComEspecificacoesAusentes = calcularScoreCompatibilidade(especificacao, 'Notebook I5 Intel Core');
    const scoreAbaixoDoMinimo = calcularScoreCompatibilidade(especificacao, 'Notebook I5 4GB RAM 128GB SSD');

    expect(scoreComEspecificacoesAusentes).toBeGreaterThan(scoreAbaixoDoMinimo);
  });

  it('lê o mínimo de RAM certo mesmo quando outro requisito de capacidade vem logo depois na mesma frase', () => {
    const especificacao = 'Notebook I5, mais de 8GB de RAM, 256GB SSD ou maior';
    const scoreAtendeRam = calcularScoreCompatibilidade(especificacao, 'Notebook I5 8GB RAM 256GB SSD');
    const scoreNaoAtendeRam = calcularScoreCompatibilidade(especificacao, 'Notebook I5 4GB RAM 256GB SSD');

    expect(scoreAtendeRam).toBeGreaterThan(scoreNaoAtendeRam);
  });

  it('credita "armazenamento" na especificação quando o anúncio descreve a capacidade como "SSD" (sinônimos)', () => {
    const especificacao = 'Notebook I5, 8GB de RAM, 256GB de armazenamento';
    const score = calcularScoreCompatibilidade(especificacao, 'Notebook I5 8GB RAM 256GB SSD');

    expect(score).toBeGreaterThanOrEqual(SCORE_MINIMO_COMPATIBILIDADE);
  });

  it('dá um pequeno bônus quando o anúncio supera o mínimo pedido, não só quando o atinge', () => {
    const especificacao = 'Notebook I5 dourado, mais de 8GB de RAM, 256GB SSD ou maior';
    const scoreNoMinimo = calcularScoreCompatibilidade(especificacao, 'Notebook I5 8GB RAM 256GB SSD');
    const scoreAcimaDoMinimo = calcularScoreCompatibilidade(especificacao, 'Notebook I5 16GB RAM 512GB SSD');

    expect(scoreAcimaDoMinimo).toBeGreaterThan(scoreNoMinimo);
  });
});
