import type { AceitePacBundle } from "@/types/acompanhamento"

/**
 * Reativa uma recusa de Ocupação Paciente: remove a sessão recusada do
 * bundle (via status do bundle inteiro OU slotStatus daquele horário) e
 * remove o bundle inteiro se ficar sem sessões. Extraído do que era lógica
 * inline em RecusadosTab.onRemove — usado tanto lá quanto no botão "Reativar"
 * do modal de detalhe em OcupPacMode, pra não duplicar a limpeza de
 * slotStatus em dois lugares.
 */
export function reativarRecusaPaciente(
  pacBundles: AceitePacBundle[],
  item: { paciente: string; profissional: string; dia: string; hora: string },
): AceitePacBundle[] {
  return pacBundles
    .map(b => {
      if (b.pac !== item.paciente) return b
      const chaveSlot = `${item.dia}|||${item.hora}`
      const eraRecusadoNoSlot = b.slotStatus?.[chaveSlot] === "recusado"
      if (b.status !== "recusado" && !eraRecusadoNoSlot) return b
      const sessoes = b.sessoes.filter(s =>
        !(s.prof === item.profissional && s.dia === item.dia && s.hora === item.hora))
      if (sessoes.length === b.sessoes.length) return b
      const slotStatus = { ...(b.slotStatus ?? {}) }
      delete slotStatus[chaveSlot]
      return { ...b, sessoes, slotStatus }
    })
    .filter(b => b.sessoes.length > 0)
}
