import { defineConfig } from "vitest/config"
import path from "path"

// Escopado a lib/remuneracao/** — aditivo, não roda contra o resto do Pulsar
// (que hoje não tem suíte de testes).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["lib/remuneracao/**/*.test.ts"],
  },
})
