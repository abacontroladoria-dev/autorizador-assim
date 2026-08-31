import {
  Bird,
  Bug,
  Cat,
  Dog,
  Fish,
  Ghost,
  Panda,
  PawPrint,
  Rabbit,
  Shell,
  Shrimp,
  Snail,
  Squirrel,
  Turtle,
  Worm,
  type LucideIcon,
} from "lucide-react"

// Avatar dos pacientes sem foto, para os cards do Cadastro de Pacientes e de
// Acompanhamento de Laudos.
//
// ÍCONES, e não iniciais — decisão do usuário (28/08/2026): perfil sem foto
// devia ser descontraído, no espírito de quem escolhe o avatar de um perfil no
// Netflix ou no Google, não uma sigla burocrática. Um bichinho também cabe
// melhor num sistema que atende criança em terapia do que duas letras maiúsculas.
//
// Cor e ícone são hashes INDEPENDENTES da mesma chave: sem isso, `TONS.length`
// (5) dividindo `ICONES.length` (15) faria cada tom só encontrar 3 dos 15
// ícones possíveis — a variedade pareceria menor do que é. Salgar a string antes
// de cada hash evita essa correlação.

export type TomAvatar = { bg: string; fg: string }

/** Azul, roxo, coral, verde e rosa — o conjunto pedido para os cards. */
const TONS: TomAvatar[] = [
  { bg: "#CBE5F2", fg: "#1B5570" }, // azul
  { bg: "#DCD2EC", fg: "#4A3573" }, // roxo
  { bg: "#F6C7BB", fg: "#8A3520" }, // coral
  { bg: "#D5E6C2", fg: "#42602A" }, // verde
  { bg: "#F2C6DA", fg: "#853259" }, // rosa
]

/**
 * Quinze bichos e afins — todos já em `lucide-react`, sem asset novo para
 * carregar. Nem toda entrada é um animal de verdade (Fantasma, Casca, Pegada):
 * o critério foi "desenho simples e reconhecível de longe em 24px", não
 * taxonomia.
 *
 * EXPORTADA, e não escondida atrás de uma função que devolve o componente: quem
 * usa faz `ICONES[indiceIconeAvatar(chave)]` — um acesso por índice, não uma
 * chamada de função — porque `react-hooks/static-components` marca como "criado
 * durante o render" qualquer `const Componente = chamadaDeFuncao()` seguido de
 * `<Componente />`, mesmo quando a função sempre devolve uma das mesmas 15
 * referências estáveis. `card.icon` (membro de objeto) passa livre pelo mesmo
 * lint; `getIcone(chave)` (chamada de função) não. O acesso por índice fica do
 * lado seguro dessa distinção.
 */
export const ICONES: LucideIcon[] = [
  Cat,
  Dog,
  Rabbit,
  Bird,
  Fish,
  Panda,
  Turtle,
  Squirrel,
  Snail,
  Bug,
  Shell,
  Shrimp,
  Worm,
  Ghost,
  PawPrint,
]

/** Hash simples e determinístico — mesma base de `getAvatarColor`. */
function hash(texto: string): number {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = ((h << 5) - h + texto.charCodeAt(i)) >>> 0
  return h
}

/**
 * Determinístico: o paciente mantém a cor entre sessões e entre telas. Cor que
 * muda a cada render vira ruído.
 */
export function getTomAvatar(chave: string | number): TomAvatar {
  return TONS[hash(`cor:${chave}`) % TONS.length]
}

/**
 * O ÍNDICE do ícone em `ICONES`, não o componente — ver o comentário de
 * `ICONES` sobre por quê. Determinístico pela mesma razão de `getTomAvatar`, e
 * salgado com um prefixo diferente para não correlacionar com a cor.
 */
export function indiceIconeAvatar(chave: string | number): number {
  return hash(`icone:${chave}`) % ICONES.length
}
