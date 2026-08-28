// Stub de "server-only" para o vitest — ver vitest.config.ts.
//
// O pacote real não está em node_modules: o Next o resolve por alias interno
// durante o build, e seu único efeito é fazer o BUILD falhar se um módulo de
// servidor for importado por um Client Component. Em teste (Node, sem fronteira
// cliente/servidor) o efeito correto é nenhum.
export {}
