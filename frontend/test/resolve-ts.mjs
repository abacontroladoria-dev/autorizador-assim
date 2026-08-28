// Hook de resolução para rodar módulos .ts puros sob o runner nativo do Node.
//
//   node --import ./test/resolve-ts.mjs --test lib/remuneracao/composicaoRP.test.ts
//
// O Node 24 já apaga os tipos sozinho, mas não resolve especificador relativo
// sem extensão (`import … from "./evolucao"`), que é como o TypeScript escreve.
// Este hook tenta `<especificador>.ts` antes de deixar o padrão falhar.
//
// Só serve para módulos de REGRA — puros, sem import de runtime fora do próprio
// domínio (nada de `@/…`, React ou Next). É essa pureza que torna a camada 1 do
// padrão de detalhamento em modal testável sem instalar nada.

import { registerHooks } from "node:module"

const SEM_EXTENSAO = /\.[mc]?[jt]sx?$/

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador.startsWith(".") && !SEM_EXTENSAO.test(especificador)) {
      try {
        return proximo(`${especificador}.ts`, contexto)
      } catch {
        // Não é um .ts vizinho — segue para a resolução normal, que devolve o
        // erro original (mais útil que o desta tentativa).
      }
    }
    return proximo(especificador, contexto)
  },
})
