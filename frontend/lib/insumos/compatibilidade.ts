const DIACRITICOS = /[̀-ͯ]/g;

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'ou', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'um', 'uma', 'por',
]);

const UNIDADES_CAPACIDADE = new Set(['l', 'lt', 'lts', 'litro', 'litros', 'ml', 'kg', 'g', 'cm']);

/** Palavras que expressam um limiar de comparação ("mais de 8GB", "256GB ou maior"), não um atributo do produto — nunca aparecem literalmente no título de um anúncio, então só diluiriam a média se entrassem na razão geral. O limiar em si já é avaliado por `ajustePorRequisitoMinimo`. */
const COMPARATIVOS_DE_REQUISITO = new Set(['mais', 'menos', 'maior', 'menor', 'minimo', 'maximo', 'superior', 'inferior', 'acima', 'abaixo']);

function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Termos que carregam significado próprio: sem stopwords, sem números/unidades isolados (a capacidade é tratada como sinal separado). */
function termosSignificativos(tokens: string[]): Set<string> {
  return new Set(
    tokens.filter(
      (token) =>
        !STOPWORDS.has(token) &&
        !COMPARATIVOS_DE_REQUISITO.has(token) &&
        !/^\d+$/.test(token) &&
        !UNIDADES_CAPACIDADE.has(token) &&
        !/^\d+[a-z]{1,4}$/.test(token),
    ),
  );
}

function extrairCapacidade(texto: string): number | null {
  const match = normalizar(texto)
    .join(' ')
    .match(/(\d+)\s*(l|lt|lts|litro|litros)\b/);
  return match ? Number(match[1]) : null;
}

function paraGb(valor: number, unidade: string | undefined): number {
  return unidade?.toLowerCase().startsWith('t') ? valor * 1000 : valor;
}

/**
 * Extrai um valor em GB (aceita GB/TB) associado a uma palavra-chave (ex.: "ram", "ssd"),
 * em qualquer ordem. Tenta primeiro "8GB RAM" (número antes) porque é a convenção real
 * predominante nas specs/títulos; senão, textos com várias capacidades numa frase só
 * ("8GB de RAM, 256GB SSD") fariam a busca "depois da palavra" atravessar a vírgula e
 * pegar o número de um requisito vizinho (o 256 do SSD) em vez do valor certo (o 8 da RAM).
 * A unidade (GB/TB) é obrigatória nos dois sentidos: sem ela, "15.6 HD" (resolução de tela)
 * seria lido como "6" de armazenamento só por "hd" também designar disco/HD.
 */
function extrairValorEmGb(texto: string, palavrasChave: string[]): number | null {
  const t = normalizar(texto).join(' ');
  const chaves = palavrasChave.join('|');

  const numeroAntesDaChave = new RegExp(`(\\d+)\\s*(gb|tb)\\D{0,15}?(?:${chaves})`);
  const numeroDepoisDaChave = new RegExp(`(?:${chaves})\\D{0,15}?(\\d+)\\s*(gb|tb)\\b`);

  const match = t.match(numeroAntesDaChave) ?? t.match(numeroDepoisDaChave);
  if (!match) return null;

  return paraGb(Number(match[1]), match[2]);
}

const PALAVRAS_RAM = ['ram', 'memoria'];
const PALAVRAS_ARMAZENAMENTO = ['ssd', 'hd', 'armazenamento', 'disco'];

/** Dentro de cada grupo as palavras são sinônimos para fins de pontuação: um vendedor escreve "SSD", não "armazenamento" — exigir a palavra exata do solicitante penalizaria por uma diferença de vocabulário, não de compatibilidade real. */
const GRUPOS_SINONIMOS = [PALAVRAS_RAM, PALAVRAS_ARMAZENAMENTO];

/**
 * Requisitos como "+ de 8gb RAM" ou "256GB SSD ou maior" são um piso mínimo,
 * não uma igualdade: atender já é suficiente (sem penalidade), superar é um
 * diferencial real do anúncio (pequeno bônus), e ficar abaixo é penalizado.
 */
function ajustePorRequisitoMinimo(minimoEspecificacao: number | null, valorAnuncio: number | null): number {
  if (minimoEspecificacao === null) return 1;
  if (valorAnuncio === null) return 0.85;
  if (valorAnuncio > minimoEspecificacao) return 1.1;
  return valorAnuncio === minimoEspecificacao ? 1 : 0.5;
}

/** Compartilham um prefixo razoável (cobre variação de gênero/plural: "plastica"/"plastico", "dobravel"/"dobraveis"). */
function combinamPorPrefixo(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  // Prefixo relativo ao menor termo (não um teto fixo): em palavras curtas
  // (ex.: "preta"/"preto", 5 letras) um teto fixo de 5 exigiria a palavra
  // inteira e nunca creditaria a variação de gênero.
  const tamanho = Math.max(3, Math.min(a.length, b.length) - 1);
  return a.slice(0, tamanho) === b.slice(0, tamanho);
}

function creditoDoTermo(termo: string, termosAnuncio: Set<string>): number {
  if (termosAnuncio.has(termo)) return 1;

  const grupo = GRUPOS_SINONIMOS.find((g) => g.includes(termo));
  if (grupo?.some((sinonimo) => termosAnuncio.has(sinonimo))) return 1;

  for (const termoAnuncio of termosAnuncio) {
    if (combinamPorPrefixo(termo, termoAnuncio)) return 0.6;
  }
  return 0;
}

/**
 * Score de compatibilidade: combina a sobreposição de termos descritivos
 * entre a especificação e o anúncio com um sinal dedicado de
 * capacidade/medida (que fica fora da razão geral para não ser penalizado
 * em dobro: uma vez pelo termo não bater, outra pelo multiplicador).
 *
 * Compartilhado entre o worker (cotações automáticas) e o backend (cotações
 * manuais) — a automação avalia a compatibilidade mesmo de um produto
 * incluído manualmente.
 */
export function calcularScoreCompatibilidade(especificacaoTecnica: string, tituloAnuncio: string): number {
  const termosEspecificacao = termosSignificativos(normalizar(especificacaoTecnica));
  const termosAnuncio = termosSignificativos(normalizar(tituloAnuncio));

  if (termosEspecificacao.size === 0) return 0;

  let creditos = 0;
  for (const termo of termosEspecificacao) {
    creditos += creditoDoTermo(termo, termosAnuncio);
  }

  let score = (creditos / termosEspecificacao.size) * 100;

  const capacidadeEspecificacao = extrairCapacidade(especificacaoTecnica);
  const capacidadeAnuncio = extrairCapacidade(tituloAnuncio);

  if (capacidadeEspecificacao && capacidadeAnuncio) {
    const proporcao = Math.min(capacidadeEspecificacao, capacidadeAnuncio) / Math.max(capacidadeEspecificacao, capacidadeAnuncio);
    if (proporcao < 0.7) score *= 0.6;
    else if (proporcao < 1) score *= 0.9;
  }

  score *= ajustePorRequisitoMinimo(
    extrairValorEmGb(especificacaoTecnica, PALAVRAS_RAM),
    extrairValorEmGb(tituloAnuncio, PALAVRAS_RAM),
  );

  score *= ajustePorRequisitoMinimo(
    extrairValorEmGb(especificacaoTecnica, PALAVRAS_ARMAZENAMENTO),
    extrairValorEmGb(tituloAnuncio, PALAVRAS_ARMAZENAMENTO),
  );

  return Math.min(100, Math.round(score * 100) / 100);
}

// Abaixo disso a cotação fica em revisão manual — 50% já é suficiente pra
// avançar sozinho, abaixo disso espera alguém incluir uma cotação manual melhor.
export const SCORE_MINIMO_COMPATIBILIDADE = 50;
