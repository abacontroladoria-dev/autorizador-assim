'use client'

import { AdminMachine } from './AdminPageShell'
import MachineStatusBadge from './MachineStatusBadge'

export default function AdminMachinesTable({
  machines,
  onUpdateStatus,
  loadingId,
}: {
  machines: AdminMachine[]
  onUpdateStatus: (machineId: string, status: string) => Promise<void>
  loadingId: string | null
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Máquinas</h2>
          <p className="text-sm text-slate-500">Controle o estado de cada máquina registrada.</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3">Máquina</th>
              <th className="px-4 py-3">Usuário vinculado</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {machines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Nenhuma máquina registrada.
                </td>
              </tr>
            ) : (
              machines.map((machine) => {
                const isLoading = loadingId === machine.id
                const status = machine.status || 'offline'
                const nextStatus = status === 'online' ? 'offline' : 'online'

                return (
                  <tr key={machine.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-900">{machine.nome || 'Máquina sem nome'}</td>
                    <td className="px-4 py-3 text-slate-500">{machine.user_id || 'Sem usuário'}</td>
                    <td className="px-4 py-3">
                      <MachineStatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onUpdateStatus(machine.id, nextStatus)}
                        disabled={isLoading}
                        className="rounded-xl bg-[#3A8FB7] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#357fa1] disabled:opacity-50"
                      >
                        {isLoading ? 'Atualizando...' : nextStatus === 'online' ? 'Conectar' : 'Desconectar'}
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
