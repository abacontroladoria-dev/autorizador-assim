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

/** Resumo por paciente, para a LISTAGEM saber quem respondeu sem abrir a ficha. */
export type ResumoEscolar = {
  /** Envio mais recente. */
  criado_em: string
  escola_nome: string
  /** Quantos envios existem — >1 significa que a escola mudou no caminho. */
  envios: number
}

/**
 * Um resumo por paciente que TEM dados escolares, para a lista de cadastro.
 *
 * Quem não respondeu simplesmente não aparece no Map — a ausência da chave é a
 * resposta "não preencheu", porque é exatamente assim que o dado existe: não há
 * flag em `pacientes`, só a existência (ou não) de linha aqui.
 *
 * Traz `paciente_id, criado_em, escola_nome` da tabela inteira e agrupa no
 * cliente, em vez de uma RPC agregada. São ~1 linha por paciente respondente
 * (poucos milhares no pior caso), o índice (paciente_id, criado_em desc) já
 * serve a ordenação, e evita uma migration nova só para alimentar um contador.
 * Se um dia a tabela crescer a ponto de doer, aí vale um `group by` no banco.
 */
export async function getResumoEscolarPorPaciente(): Promise<Map<number, ResumoEscolar>> {
  const porPaciente = new Map<number, ResumoEscolar>()
  // Página a página: o PostgREST corta QUALQUER resposta em max_rows (1000) sem
  // erro, então sem paginar o Map nasceria incompleto em silêncio — e paciente
  // que respondeu apareceria como "não preencheu".
  const TAMANHO = 1000
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await supabase
      .from("pacientes_dados_escolares")
      .select("paciente_id, criado_em, escola_nome")
      // Ordenação TOTAL (criado_em pode repetir; id desempata) para o range não
      // pular nem repetir linha entre páginas.
      .order("paciente_id", { ascending: true })
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .range(de, de + TAMANHO - 1)

    if (error) throw error

    const linhas = (data ?? []) as unknown as {
      paciente_id: number
      criado_em: string
      escola_nome: string
    }[]

    for (const linha of linhas) {
      const atual = porPaciente.get(linha.paciente_id)
      // A ordenação garante que a PRIMEIRA linha vista de cada paciente é a mais
      // recente; as seguintes só incrementam a contagem.
      if (atual) atual.envios += 1
      else
        porPaciente.set(linha.paciente_id, {
          criado_em: linha.criado_em,
          escola_nome: linha.escola_nome,
          envios: 1,
        })
    }

    if (linhas.length < TAMANHO) break
  }

  return porPaciente
}

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
