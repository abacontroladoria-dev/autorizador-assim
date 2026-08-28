// Tradução de erro de banco para linguagem de usuário. Estava copiada em
// pacientes.service.ts (`mensagemDeErro`) e em responsaveis.service.ts
// (`mensagemVinculo`, mais um regex inline no modal) — unificado aqui e
// acrescentado o 23503 da FK `pacientes_responsaveis.responsavel_id`
// (`ON DELETE RESTRICT`: excluir um responsável vinculado trava com esse
// código em vez de apagar em cascata).

export function mensagemDeErroBanco(error: { message: string; code?: string }): string {
  const msg = error.message ?? "Erro desconhecido"

  if (error.code === "23503" || /violates foreign key constraint/i.test(msg)) {
    return "Este registro ainda está vinculado a outro cadastro e não pode ser excluído. Use Inativar."
  }
  if (/row-level security/i.test(msg)) {
    return "Você não tem permissão para gravar este cadastro. Peça a permissão 'Cadastro de Pacientes' a um administrador."
  }
  if (/violates check constraint/i.test(msg)) {
    const campo = /\w+?_(\w+?)_check/.exec(msg)?.[1]
    return campo
      ? `O valor informado em "${campo}" não é aceito.`
      : `Algum campo tem valor inválido. Detalhe: ${msg}`
  }
  if (/duplicate key|already exists/i.test(msg)) {
    return "Já existe um registro com esse valor único."
  }
  return msg
}
