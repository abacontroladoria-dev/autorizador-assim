import { getSupabaseClient } from "@/lib/supabase/client"

// Mesmo padrão de frontend/services/salasAuditoria.service.ts — usado pelos
// serviços de escrita do sistema próprio de agendamentos (reboot_*) para
// preencher id_usuario/nome_usuario_responsavel a cada criação/edição.
export async function getUsuarioAtual(): Promise<{ id: string | null; nome: string | null }> {
  const sb = getSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user?.id) return { id: null, nome: null }
  const { data } = await sb.from("usuarios").select("nome").eq("id", user.id).maybeSingle()
  return { id: user.id, nome: data?.nome ?? null }
}
