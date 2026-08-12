import { randomInt } from 'crypto'

const SENHA_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function gerarSenhaAleatoria(tamanho = 12) {
  let senha = ''
  for (let i = 0; i < tamanho; i++) {
    senha += SENHA_ALFABETO[randomInt(SENHA_ALFABETO.length)]
  }
  return senha
}
