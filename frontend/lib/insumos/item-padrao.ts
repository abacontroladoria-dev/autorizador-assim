const DIACRITICOS = /[̀-ͯ]/g;

export function normalizarTermo(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(DIACRITICOS, '').trim();
}

export interface SinonimoItem {
  itemPadraoId: string;
  termo: string;
}

/**
 * Isolado atrás de uma interface de propósito — começa determinístico
 * (string normalizada + sinônimos curados), mas um resolvedor por embedding
 * pode implementar a mesma interface depois sem mudar nenhum chamador.
 * `resolver` já nasce assíncrono por isso, mesmo a implementação de hoje
 * sendo síncrona por dentro.
 */
export interface ResolvedorDeItemPadrao {
  resolver(textoEntrada: string, sinonimos: SinonimoItem[]): Promise<string | null>;
}

/**
 * Item sem nenhum sinônimo cadastrado que bata fica sem item padrão (`null`)
 * — não inventa/auto-cria categoria.
 */
export const resolvedorDeterministico: ResolvedorDeItemPadrao = {
  async resolver(textoEntrada, sinonimos) {
    const textoNormalizado = normalizarTermo(textoEntrada);
    if (!textoNormalizado) return null;

    // Termo mais longo vence quando mais de um bate — evita que um termo
    // curto e genérico "roube" o match de um mais específico.
    const candidatos = sinonimos
      .filter((sinonimo) => textoNormalizado.includes(normalizarTermo(sinonimo.termo)))
      .sort((a, b) => b.termo.length - a.termo.length);

    return candidatos[0]?.itemPadraoId ?? null;
  },
};
