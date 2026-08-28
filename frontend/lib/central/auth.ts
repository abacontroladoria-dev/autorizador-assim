import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { supabaseService } from '@/lib/supabase/service'
import { UnauthenticatedError } from '@/modules/atendimento/types/errors.types'

// ----------------------------------------------------------------------------
// CentralUser — contexto do usuário autenticado para as rotas da Central.
// orgId e centralRole são sempre derivados de fonte confiável (JWT ou banco).
// ----------------------------------------------------------------------------

export type CentralUser = {
  id:          string
  orgId:       string
  centralRole: string
}

export type ExtractUserResult = {
  user:     CentralUser
  supabase: SupabaseClient
}

// Decodifica o payload do JWT sem verificação criptográfica.
// Usado apenas para leitura de claims em tokens já validados por getUser().
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(Buffer.from(part, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------------
// extractUser
//
// JWT path (primário):
//   Lê organization_id e central_role dos claims do access token.
//   Claims injetados por public.custom_access_token_hook (migration M-000b).
//   Ativo após habilitação manual no Supabase Dashboard → Auth → Hooks.
//
// DB fallback:
//   Ativo quando o hook ainda não foi habilitado ou o token está desatualizado
//   (usuário precisará fazer re-login para migrar ao JWT path).
//   Consulta public.usuarios com service role — sem interferência de RLS.
//
// Retorna o supabase client já criado para reuso nas factory functions dos services.
// Nunca criar um segundo client no mesmo handler.
// ----------------------------------------------------------------------------
export async function extractUser(): Promise<ExtractUserResult> {
  const supabase = await createClient()

  // Valida a sessão contra o servidor Supabase Auth (não spoofável via cookie)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new UnauthenticatedError()

  // JWT path — lê claims sem chamada adicional ao banco
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    const claims = decodeJwtPayload(session.access_token)
    const orgId       = claims?.organization_id as string | undefined
    const centralRole = claims?.central_role    as string | undefined

    if (orgId && centralRole) {
      return { user: { id: user.id, orgId, centralRole }, supabase }
    }
  }

  // DB fallback — hook não ativado ou token anterior ao hook
  const { data: dbUser, error: dbErr } = await supabaseService
    .from('usuarios')
    .select('organization_id, central_role, ativo')
    .eq('id', user.id)
    .maybeSingle()

  if (dbErr || !dbUser)           throw new UnauthenticatedError('Usuário não encontrado')
  if (!dbUser.ativo)              throw new UnauthenticatedError('Usuário inativo')
  if (!dbUser.organization_id)   throw new UnauthenticatedError('Usuário sem organização configurada')
  if (!dbUser.central_role)      throw new UnauthenticatedError('Usuário sem acesso à Central de Atendimento')

  return {
    user: {
      id:          user.id,
      orgId:       dbUser.organization_id as string,
      centralRole: dbUser.central_role    as string,
    },
    supabase,
  }
}
