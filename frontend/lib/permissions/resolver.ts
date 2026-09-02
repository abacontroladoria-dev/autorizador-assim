import { codigosToRotas, getRoleDefaultPermissions, hasRouteAccess } from "./routes"

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
 * `admin` acessa tudo. Ponto único da regra: o proxy.ts, o Sidebar e as rotas de
 * API a consultam daqui, em vez de cada um repetir `role === "admin"`.
 */
export function isSuperRole(role: string): boolean {
  return role === "admin"
}

/**
 * Um código de permissão específico (usado pela API, que raciocina em código e
 * não em rota — ex: PERMISSAO_INSUMOS).
 */
export function temPermissao(role: string, codigos: Set<string>, codigo: string): boolean {
  return isSuperRole(role) || codigos.has(codigo)
}

/**
 * Uma ROTA está liberada? Resposta única para o gate de navegação (proxy.ts) e
 * para o menu (Sidebar).
 *
 * Existe porque os dois já divergiram na prática: o proxy retornava cedo para
 * `admin` e o `canAccess` do Sidebar não, então um admin abria
 * /autorizacoes-avulsas pelo link e não via o item no menu — o código só está no
 * roleDefaults de `admin` e `recepcao`. Menu e navegação discordando é sempre
 * bug: ou a tela é inalcançável, ou aparece um item que a navegação recusa.
 *
 * `search` importa: há permissões por aba (ex:
 * /cronograma/indicadores?tab=previsao-receitas), e é `routeMatches` quem sabe
 * comparar rota+querystring.
 */
export function podeAcessarRota(
  role: string,
  codigos: Set<string>,
  pathname: string,
  search = ""
): boolean {
  if (isSuperRole(role)) return true
  return hasRouteAccess(pathname, search, codigosToRotas(codigos))
}
