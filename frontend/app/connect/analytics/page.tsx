'use client'

import AgendaCentral from '@/components/connect/agenda/AgendaCentral'

// A rota se chama /analytics por herança do Nina (o item do menu já se chama
// "Agendamentos"). Renomear a rota quebraria links salvos por quem usa o painel;
// o rótulo do menu é o que o usuário vê.
export default function AgendamentosPage() {
  return <AgendaCentral />
}
