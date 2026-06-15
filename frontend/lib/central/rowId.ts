/**
 * Identidade estável de uma linha do Controle de Pacientes.
 *
 * A RPC `listar_central_pacientes` sempre retorna `id`:
 *  - Parte 1 (passou pela fila): `fila_autorizacoes.id` real.
 *  - Parte 2 (autorizado direto no ASSIM): UUID sintético md5(paciente|data|hora),
 *    que NÃO inclui a terapia. Por isso o discriminador `terapia_exibicao_id`
 *    é anexado para evitar colisão entre terapias no mesmo horário/paciente.
 *
 * Usado para seleção e `key` da lista. Os logs continuam usando `item.id` cru
 * (FK `fila_autorizacoes_logs.fila_id`) — ver SidePanel.
 */
export function getRowId(item: any): string {
  if (!item) return ''

  const base =
    item.id != null
      ? String(item.id)
      : `${item.paciente_id}_${item.data_atendimento}_${item.horario}`

  const terapia = item.terapia_exibicao_id ?? item.classificacao_terapia ?? ''

  return `${base}_${terapia}`
}
