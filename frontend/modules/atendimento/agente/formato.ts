// Formatação compartilhada entre as ferramentas do agente.
//
// Separado de components/connect/agenda/tipos.ts de propósito: aquele arquivo é
// 'use client' e carrega vocabulário de UI (classes de cor). As ferramentas
// rodam no servidor e em Edge Functions, onde nada disso existe.

// 'HH:MM:SS' → 'HH:MM'.
// O agente conversa em horas e minutos; mandar segundos para o modelo só
// aumenta a chance de ele repetir "08:00:00" na mensagem ao paciente.
export function horaCurta(hora: string | null): string | null {
  if (!hora) return null
  return hora.slice(0, 5)
}
