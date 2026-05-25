'use client'

import { AdminMachine } from './AdminPageShell'

function formatLastSeen(lastSeen?: string | null) {
  if (!lastSeen) return '—'
  const diff = Date.now() - new Date(lastSeen).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`
  return new Date(lastSeen).toLocaleDateString('pt-BR')
}

export default function AdminMachinesTable({
  machines,
  onToggle,
  loadingId,
}: {
  machines: AdminMachine[]
  onToggle: (machineId: string, currentAtiva: boolean) => Promise<void>
  loadingId: string | null
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Máquinas</h2>
          <p className="text-sm text-slate-500">
            Controle o estado de cada máquina registrada. Máquinas são cadastradas automaticamente pelo worker RPA ao iniciar.
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3">Máquina</th>
              <th className="px-4 py-3">Hostname</th>
              <th className="px-4 py-3">Sistema</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {machines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma máquina registrada.
                </td>
              </tr>
            ) : (
              machines.map((machine) => {
                const isLoading = loadingId === machine.id
                const ativa = machine.ativa ?? false

                return (
                  <tr key={machine.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {machine.nome || machine.id}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {machine.hostname || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {machine.sistema_operacional || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatLastSeen(machine.last_seen)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-xl px-3 py-1 text-xs font-semibold ${
                          ativa
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onToggle(machine.id, ativa)}
                        disabled={isLoading}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {isLoading ? 'Atualizando...' : ativa ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
