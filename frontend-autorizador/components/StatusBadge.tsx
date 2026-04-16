type Status = 'pendente' | 'executando' | 'concluido' | 'erro'

export function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
	pendente: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
	executando: 'bg-blue-100 text-blue-700 border border-blue-200',
	concluido: 'bg-green-100 text-green-700 border border-green-200',
	erro: 'bg-red-100 text-red-700 border border-red-200',
  }

  const labels: Record<Status, string> = {
    pendente: 'Pendente',
    executando: 'Executando',
    concluido: 'Concluído',
    erro: 'Erro',
  }

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}