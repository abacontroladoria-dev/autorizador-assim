import { getRoleDefaultPermissions } from "./routes"

// Resolução da permissão efetiva de um usuário: defaults do papel, mais as
// concessões e revogações individuais de `usuarios_permissoes`.
//
// Extraído de proxy.ts para ser usado nos dois lugares. O motivo de existir como
// arquivo próprio: o `proxy.ts` só protege PÁGINA — o matcher dele exclui `/api`
// explicitamente. Route handler precisa checar permissão por conta própria, e uma
// segunda implementação dessa mesma regra divergiria com o tempo (é o que já
// aconteceu neste projeto com o CASE do TUSS e com a normalização de nome).
//
// Puro de propósito: recebe os overrides já lidos, não fala com o Supabase. Assim
// serve ao proxy (client do middleware) e à API (client do route handler) sem
// arrastar dependência.

export type OverridePermissao = { permissao_codigo: string; permitido: boolean }

/**
 * Revogação vence: um código revogado sai do conjunto mesmo que o papel o
 * conceda por padrão. Mesma semântica do `UsuarioPermissaoExcecao` do AXIUM.
 */
export function resolverPermissoes(role: string, overrides: OverridePermissao[]): Set<string> {
  const codigos = new Set(getRoleDefaultPermissions(role))

  for (const o of overrides) {
    if (o.permitido) codigos.add(o.permissao_codigo)
    else codigos.delete(o.permissao_codigo)
  }

  return codigos
}

/**
 * `admin` acessa tudo — mesma regra do proxy.ts, que retorna cedo para esse
 * papel. Repetida aqui porque a API não passa pelo proxy.
 */
export function temPermissao(role: string, codigos: Set<string>, codigo: string): boolean {
  return role === "admin" || codigos.has(codigo)
}
