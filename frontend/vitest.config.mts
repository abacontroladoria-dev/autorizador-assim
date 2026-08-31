// Config mínima do vitest — existe por UM motivo: permitir que teste importe
// módulo do lado servidor.
//
// Até aqui a suíte vivia sem config nenhuma, e por isso todo teste do repo é de
// módulo puro com import relativo (ver o cabeçalho de
// lib/remuneracao/rotulosExecucao.test.ts, que registra a limitação). Dois
// bloqueios impediam testar services/laudos/relatorio.ts:
//
//   • `import "server-only"` — o pacote NÃO existe em node_modules; quem o
//     resolve é o próprio Next, por alias interno, durante o build. Fora do
//     Next o import explode em "Cannot find module". O alias abaixo o manda
//     para um stub vazio, que é exatamente o que ele é em ambiente de servidor.
//   • `@/…` em import de VALOR (`@/lib/supabase/service`). Import só de tipo o
//     esbuild apaga antes de resolver, e é por isso que runAlgorithm e amigos
//     já rodavam em teste; import de valor não.
//
// Nada mais é configurado de propósito: include/exclude/environment seguem o
// padrão do vitest, para a suíte continuar rodando igual a antes.

import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const raiz = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      "@": raiz.replace(/[/\\]$/, ""),
    },
  },
})
