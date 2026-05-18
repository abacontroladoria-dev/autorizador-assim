'use client'

import { AdminUser } from './AdminPageShell'
import CreateUserModal from './CreateUserModal'


const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'terapeutico', label: 'Terapêutico' },
  { value: 'faturamento', label: 'Faturamento' },
]

export default function AdminUsersTable({
  users,
  onToggleActive,
  onChangeRole,
  loadingId,
}: {
  users: AdminUser[]
  onToggleActive: (userId: string, active: boolean) => Promise<void>
  onChangeRole: (userId: string, role: string) => Promise<void>
  loadingId: string | null
}) {
  return (
<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">


{/*  CABEÇALHO */}
<div className="flex items-start justify-between gap-3">
  <div>
    <h2 className="text-xl font-semibold tracking-tight text-slate-900">
      Usuários
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Gerencie perfis, status e permissões da plataforma.
    </p>
  </div>

  <CreateUserModal />
</div>

{/*FILTROS*/}
<div className="mt-4 grid gap-3 md:grid-cols-3">
  <input
    placeholder="Buscar usuário..."
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  />

  <select
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  >
    <option>Todas as funções</option>
  </select>

  <input
    placeholder="Buscar máquina..."
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  />
</div>


      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
				<th className="w-[28%] px-5 py-4">Nome</th>

				<th className="w-[18%] px-5 py-4 text-center">
				  Função
				</th>

				<th className="w-[12%] px-5 py-4 text-center">
				  Status
				</th>

				<th className="w-[28%] px-5 py-4">Email</th>

				<th className="w-[14%] px-5 py-4 text-center">
				  Ações
				</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isLoading = loadingId === user.id
                return (
                  <tr key={user.id} className="border-b border-slate-100">
                    {/* NOME */}
					<td className="px-5 py-4">
					  <div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
						  {(user.nome || user.email || '?')
							.charAt(0)
							.toUpperCase()}
						</div>

						<div>
						  <p className="font-medium text-slate-900">
							{user.nome || user.email || 'Sem nome'}
						  </p>
						</div>
					  </div>
					</td>

					{/* FUNÇÃO */}
					<td className="px-5 py-4 text-center">
					  <select
						value={user.role || ''}
						onChange={(event) =>
						  onChangeRole(user.id, event.target.value)
						}
						disabled={isLoading}
						className="w-[180px] rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
					  >
						{roleOptions.map((option) => (
						  <option key={option.value} value={option.value}>
							{option.label}
						  </option>
						))}
					  </select>
					</td>

					{/* STATUS */}
					<td className="px-5 py-4">
					  <div className="flex justify-center">
						<span
						  className={`inline-flex rounded-xl px-3 py-1 text-xs font-semibold ${
							user.ativo
							  ? 'bg-emerald-100 text-emerald-700'
							  : 'bg-rose-100 text-rose-700'
						  }`}
						>
						  {user.ativo ? 'Ativo' : 'Inativo'}
						</span>
					  </div>
					</td>

					{/* EMAIL */}
					<td className="px-5 py-4 text-slate-500">
					  {user.email || '-'}
					</td>

					{/* AÇÕES */}
					<td className="px-5 py-4 text-center">
					  <button
						onClick={() => onToggleActive(user.id, !!user.ativo)}
						disabled={isLoading}
						className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
					  >
						{isLoading
						  ? 'Atualizando...'
						  : user.ativo
						  ? 'Desativar'
						  : 'Ativar'}
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
