'use client'

import { useState } from 'react'
import { AdminUser } from './AdminPageShell'
import CreateUserModal from './CreateUserModal'


const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'autorizacao', label: 'Autorização' },
  { value: 'cronograma', label: 'Cronograma' },
  { value: 'disponibilidade_terapeuta', label: 'Disponib. Terapeuta' },
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'rp', label: 'RP' },
  { value: 'terapeutico', label: 'Terapêutico' },
]

export default function AdminUsersTable({
  users,
  onToggleActive,
  onChangeRole,
  onResendInvite,
  onDeleteUser,
  loadingId,
  searchUser,
  onSearchUserChange,
  roleFilter,
  onRoleFilterChange,
  searchMachine,
  onSearchMachineChange,
}: {
  users: AdminUser[]
  onToggleActive: (userId: string, active: boolean) => Promise<void>
  onChangeRole: (userId: string, role: string) => Promise<void>
  onResendInvite: (userId: string, email: string, nome: string, role: string) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  loadingId: string | null
  searchUser: string
  onSearchUserChange: (value: string) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  searchMachine: string
  onSearchMachineChange: (value: string) => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
    value={searchUser}
    onChange={(e) => onSearchUserChange(e.target.value)}
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  />

  <select
    value={roleFilter}
    onChange={(e) => onRoleFilterChange(e.target.value)}
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  >
    <option value="">Todos os setores</option>
    {roleOptions.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>

  <input
    placeholder="Buscar máquina..."
    value={searchMachine}
    onChange={(e) => onSearchMachineChange(e.target.value)}
    className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
  />
</div>


      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
				<th className="w-[24%] px-5 py-4">Nome</th>

				<th className="w-[16%] px-5 py-4">Usuário</th>

				<th className="w-[16%] px-5 py-4 text-center">
				  Setor
				</th>

				<th className="w-[10%] px-5 py-4 text-center">
				  Status
				</th>

				<th className="w-[22%] px-5 py-4">Email</th>

				<th className="w-[12%] px-5 py-4 text-center">
				  Ações
				</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
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

					{/* USUÁRIO */}
					<td className="px-5 py-4">
					  {user.username ? (
						<span className="font-mono text-sm text-slate-700">
						  @{user.username}
						</span>
					  ) : (
						<span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
						  Convite pendente
						</span>
					  )}
					</td>

					{/* SETOR */}
					<td className="px-5 py-4 text-center">
					  <select
						value={user.role || ''}
						onChange={(event) =>
						  onChangeRole(user.id, event.target.value)
						}
						disabled={isLoading}
						className="w-45 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#3A8FB7] focus:ring-4 focus:ring-[#3A8FB7]/10"
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
					<td className="px-5 py-4">
					  <div className="flex items-center justify-center gap-2">
						{!user.username ? (
						  <button
							onClick={() =>
							  onResendInvite(
								user.id,
								user.email ?? '',
								user.nome ?? '',
								user.role ?? ''
							  )
							}
							disabled={isLoading}
							className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
						  >
							{isLoading ? 'Enviando...' : 'Reenviar convite'}
						  </button>
						) : (
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
						)}

						{confirmDeleteId === user.id ? (
						  <button
							onClick={async () => {
							  setConfirmDeleteId(null)
							  await onDeleteUser(user.id)
							}}
							disabled={isLoading}
							className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
						  >
							Confirmar?
						  </button>
						) : (
						  <button
							onClick={() => setConfirmDeleteId(user.id)}
							disabled={isLoading}
							className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
						  >
							Excluir
						  </button>
						)}
					  </div>
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
