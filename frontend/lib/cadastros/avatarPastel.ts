// Avatar de iniciais em tom pastel, para os cards do Cadastro de Pacientes.
//
// Separado de lib/admin/avatar-color.ts de propósito: aquele devolve nove cores
// SATURADAS, pensadas para pontos pequenos numa tabela de usuários. Aqui o
// círculo é grande e carrega texto dentro, então cada tom precisa de um par —
// fundo claro e uma tinta escura DA MESMA MATIZ.
//
// Cinza sobre superfície colorida é o erro clássico deste componente: some. Por
// isso o texto nunca é neutro, é o próprio tom escurecido.

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
 * Mesmo hash de getAvatarColor: determinístico, para o paciente manter a cor
 * entre sessões e entre telas. Cor que muda a cada render vira ruído.
 */
export function getTomAvatar(chave: string | number): TomAvatar {
  const id = String(chave)
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) >>> 0
  return TONS[h % TONS.length]
}

/** Primeira e última inicial — "Ana Paula Souza" vira "AS". */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}
