'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AdminUser } from './AdminPageShell'
import CreateUserModal from './CreateUserModal'
import { UNIDADES_DISPONIVEIS } from '@/lib/admin/unidades'
import { getAvatarColor } from '@/lib/admin/avatar-color'

// Cor fixa por unidade — nunca a cor de marca (essa fica reservada a estado/foco).
const UNIDADE_STYLES: Record<string, string> = {
  Realengo: 'bg-blue-700 text-white',
  Fazendinha: 'bg-emerald-700 text-white',
  'Padre Miguel': 'bg-amber-700 text-white',
}

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

// Uma cor por setor — nunca as cores de status (emerald/rose/amber/sky/slate já
// têm significado fixo em Status; setor usa uma paleta própria pra não colidir).
const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'bg-slate-100', text: 'text-slate-700' },
  diretoria: { bg: 'bg-orange-100', text: 'text-orange-700' },
  recepcao: { bg: 'bg-blue-100', text: 'text-blue-700' },
  autorizacao: { bg: 'bg-violet-100', text: 'text-violet-700' },
  terapeutico: { bg: 'bg-teal-100', text: 'text-teal-700' },
  faturamento: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  rp: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  cronograma: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  disponibilidade_terapeuta: { bg: 'bg-pink-100', text: 'text-pink-700' },
}

function roleStyle(role: string) {
  return ROLE_STYLES[role] ?? { bg: 'bg-slate-100', text: 'text-slate-700' }
}

function mesmasUnidades(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((u) => setB.has(u))
}

export default function AdminUsersTable({
  users,
  onToggleActive,
  onSaveUser,
  onResendInvite,
  onDeleteUser,
  onResetPassword,
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
  onSaveUser: (userId: string, role: string, unidades: string[]) => Promise<boolean>
  onResendInvite: (userId: string, email: string, nome: string, role: string) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onResetPassword: (userId: string, nome: string, email: string, username: string) => Promise<void>
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
  <label>
    <span className="sr-only">Buscar usuário</span>
    <input
      placeholder="Buscar usuário..."
      value={searchUser}
      onChange={(e) => onSearchUserChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
    />
  </label>

  <label>
    <span className="sr-only">Filtrar por setor</span>
    <select
      value={roleFilter}
      onChange={(e) => onRoleFilterChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
    >
      <option value="">Todos os setores</option>
      {roleOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>

  <label>
    <span className="sr-only">Buscar máquina</span>
    <input
      placeholder="Buscar máquina..."
      value={searchMachine}
      onChange={(e) => onSearchMachineChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
    />
  </label>
</div>


      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
				<th className="w-[19%] px-5 py-4">Nome</th>

				<th className="w-[12%] px-5 py-4">Usuário</th>

				<th className="w-[14%] px-5 py-4 text-center">
				  Setor
				</th>

				<th className="w-[15%] px-5 py-4 text-center">
				  Unidade(s)
				</th>

				<th className="w-[8%] px-5 py-4 text-center">
				  Status
				</th>

				<th className="w-[16%] px-5 py-4">Email</th>

				<th className="w-[16%] px-5 py-4 text-center">
				  Ações
				</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isLoading={loadingId === user.id}
                  onToggleActive={onToggleActive}
                  onSaveUser={onSaveUser}
                  onResendInvite={onResendInvite}
                  onResetPassword={onResetPassword}
                  confirmDelete={confirmDeleteId === user.id}
                  onRequestDelete={() => setConfirmDeleteId(user.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={async () => {
                    setConfirmDeleteId(null)
                    await onDeleteUser(user.id)
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserRow({
  user,
  isLoading,
  onToggleActive,
  onSaveUser,
  onResendInvite,
  onResetPassword,
  confirmDelete,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  user: AdminUser
  isLoading: boolean
  onToggleActive: (userId: string, active: boolean) => Promise<void>
  onSaveUser: (userId: string, role: string, unidades: string[]) => Promise<boolean>
  onResendInvite: (userId: string, email: string, nome: string, role: string) => Promise<void>
  onResetPassword: (userId: string, nome: string, email: string, username: string) => Promise<void>
  confirmDelete: boolean
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => Promise<void>
}) {
  // unidades NULL/vazio = sem restrição no banco, equivalente a "todas marcadas" —
  // exibir como nenhuma marcada seria enganoso (pareceria restrito a zero unidades).
  function unidadesEfetivas(u: AdminUser) {
    return u.unidades && u.unidades.length > 0 ? u.unidades : [...UNIDADES_DISPONIVEIS]
  }

  const [roleDraft, setRoleDraft] = useState(user.role || '')
  const [unidadesDraft, setUnidadesDraft] = useState<string[]>(unidadesEfetivas(user))

  // Ressincroniza o rascunho quando o usuário é atualizado de fora (ex.: após salvar),
  // ajustando o estado durante a renderização em vez de um useEffect (evita um
  // re-render em cascata — ver https://react.dev/learn/you-might-not-need-an-effect).
  const [syncedFrom, setSyncedFrom] = useState({ role: user.role, unidades: user.unidades })
  if (syncedFrom.role !== user.role || syncedFrom.unidades !== user.unidades) {
    setSyncedFrom({ role: user.role, unidades: user.unidades })
    setRoleDraft(user.role || '')
    setUnidadesDraft(unidadesEfetivas(user))
  }

  const dirty =
    roleDraft !== (user.role || '') || !mesmasUnidades(unidadesDraft, unidadesEfetivas(user))
  const disabled = isLoading

  function toggleUnidade(unidade: string) {
    setUnidadesDraft((current) =>
      current.includes(unidade)
        ? current.filter((u) => u !== unidade)
        : [...current, unidade]
    )
  }

  return (
    <tr className="border-b border-slate-100">
      {/* NOME */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: getAvatarColor(user.id) }}
          >
            {(user.nome || user.email || '?').charAt(0).toUpperCase()}
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
          <span className="font-mono text-sm text-slate-700">@{user.username}</span>
        ) : (
          <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            Convite pendente
          </span>
        )}
      </td>

      {/* SETOR */}
      <td className="px-5 py-4 text-center">
        <div className={`relative inline-flex items-center ${roleStyle(roleDraft).text}`}>
          <select
            value={roleDraft}
            onChange={(event) => setRoleDraft(event.target.value)}
            disabled={disabled}
            className={`appearance-none cursor-pointer rounded-full pl-3 pr-6 py-1.5 text-xs font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand/30 ${roleStyle(roleDraft).bg}`}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60"
          />
        </div>
      </td>

      {/* UNIDADE(S) */}
      <td className="px-5 py-4">
        <div className="flex flex-wrap justify-center gap-1">
          {UNIDADES_DISPONIVEIS.map((unidade) => {
            const ativa = unidadesDraft.includes(unidade)
            return (
              <button
                key={unidade}
                type="button"
                disabled={disabled}
                onClick={() => toggleUnidade(unidade)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                  ativa
                    ? UNIDADE_STYLES[unidade]
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {unidade}
              </button>
            )
          })}
        </div>
      </td>

      {/* STATUS */}
      <td className="px-5 py-4">
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              user.ativo ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${user.ativo ? 'bg-emerald-500' : 'bg-rose-500'}`}
              aria-hidden="true"
            />
            {user.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </td>

      {/* EMAIL */}
      <td className="px-5 py-4 text-slate-500">{user.email || '-'}</td>

      {/* AÇÕES */}
      <td className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {dirty && (
            <button
              onClick={() => onSaveUser(user.id, roleDraft, unidadesDraft)}
              disabled={disabled}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {isLoading ? 'Salvando...' : 'Salvar'}
            </button>
          )}

          {!user.username ? (
            <button
              onClick={() =>
                onResendInvite(user.id, user.email ?? '', user.nome ?? '', user.role ?? '')
              }
              disabled={disabled}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {isLoading ? 'Enviando...' : 'Reenviar convite'}
            </button>
          ) : (
            <>
              <button
                onClick={() => onToggleActive(user.id, !!user.ativo)}
                disabled={disabled}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {isLoading ? 'Atualizando...' : user.ativo ? 'Desativar' : 'Ativar'}
              </button>

              <button
                onClick={() =>
                  onResetPassword(
                    user.id,
                    user.nome ?? user.email ?? 'usuário',
                    user.email ?? '',
                    user.username ?? ''
                  )
                }
                disabled={disabled}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Redefinir senha
              </button>
            </>
          )}

          {confirmDelete ? (
            <>
              <button
                onClick={onConfirmDelete}
                disabled={disabled}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                Confirmar exclusão
              </button>
              <button
                onClick={onCancelDelete}
                disabled={disabled}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={onRequestDelete}
              disabled={disabled}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
