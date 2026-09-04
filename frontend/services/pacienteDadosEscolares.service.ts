import { getSupabaseClient } from "@/lib/supabase/client"

// Leitura dos dados escolares declarados pelo responsável em /ficha-escolar.
//
// Somente leitura de propósito: a única escrita acontece no formulário público,
// pelo route handler /api/ficha-escolar/enviar. A equipe não edita o que a
// família declarou — se estiver errado, o caminho é um novo envio, e o histórico
// preserva os dois. Por isso não existe `upsert...` aqui.

const supabase = getSupabaseClient()

export type DadosEscolares = {
  id: number
  paciente_id: number
  escola_nome: string
  escola_endereco: string | null
  escola_telefone: string | null
  escola_email: string | null
  coordenador_nome: string | null
  turma: string | null
  turno: string | null
  preenchido_por_nome: string
  preenchido_por_parentesco: string | null
  preenchido_por_telefone: string | null
  telefone_confere: boolean | null
  criado_em: string
}

const COLUNAS =
  "id, paciente_id, escola_nome, escola_endereco, escola_telefone, escola_email, " +
  "coordenador_nome, turma, turno, preenchido_por_nome, preenchido_por_parentesco, " +
  "preenchido_por_telefone, telefone_confere, criado_em"

/**
 * Todos os envios do paciente, do mais recente para o mais antigo.
 *
 * A lista inteira, e não só o último: a criança troca de escola no meio do
 * acompanhamento, e a mudança é justamente o que a equipe precisa enxergar. A
 * tela destaca o primeiro item e recolhe o resto como histórico.
 */
export async function listarDadosEscolares(pacienteId: number): Promise<DadosEscolares[]> {
  const { data, error } = await supabase
    .from("pacientes_dados_escolares")
    .select(COLUNAS)
    .eq("paciente_id", pacienteId)
    .order("criado_em", { ascending: false })

  if (error) throw error

  // `as unknown as` como no resto dos serviços: os tipos gerados do Supabase não
  // acompanham migrations novas, e sem a ponte o TS reclama do shape da linha.
  return (data ?? []) as unknown as DadosEscolares[]
}
