'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useHeader } from '@/contexts/HeaderContext'
import AdminSummaryCards from './AdminSummaryCards'
import AdminUsersTable from './AdminUsersTable'
import AdminMachinesTable, { isMachineOnline } from './AdminMachinesTable'
import {
  changeUserRole,
  deleteUser,
  getAdminMachines,
  getAdminUsers,
  resetUserPassword,
  toggleUserActive,
  updateMachineStatus,
} from '@/services/admin.service'
import ResetPasswordModal from './ResetPasswordModal'
import { getFunctionHeaders, getFunctionUrl } from '@/lib/supabase/functions'

export type AdminUser = {
  id: string
  nome?: string
  email?: string
  role?: string
  ativo?: boolean
  created_at?: string
  username?: string | null
}

export type AdminMachine = {
  id: string
  nome?: string
  ativa?: boolean | null
  last_seen?: string | null
  hostname?: string | null
  sistema_operacional?: string | null
  ip?: string | null
  user_id?: string
}

export default function AdminPageShell({
  initialUsers,
  initialMachines,
}: {
  initialUsers: AdminUser[]
  initialMachines: AdminMachine[]
}) {
  const { setHeader } = useHeader()

  const [users, setUsers] = useState(initialUsers)
  const [machines, setMachines] = useState(initialMachines)
  const [searchUser, setSearchUser] = useState('')
  const [searchMachine, setSearchMachine] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    nome: string
    email: string
    username: string
    password: string
  } | null>(null)

  useEffect(() => {
    setHeader(
      'Painel Administrativo',
      'Gestão de usuários, máquinas e regras do sistema'
    )
  }, [setHeader])

  useEffect(() => {
    async function load() {
      const [loadedUsers, loadedMachines] = await Promise.all([
        getAdminUsers(),
        getAdminMachines(),
      ])
      setUsers(loadedUsers)
      setMachines(loadedMachines)
    }
    load()

    // Atualiza periodicamente para refletir o heartbeat das máquinas (last_seen)
    const interval = setInterval(async () => {
      setMachines(await getAdminMachines())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const totals = useMemo(() => {
    const activeUsers = users.filter((user) => user.ativo).length
    const inactiveUsers = users.length - activeUsers
    const onlineMachines = machines.filter(
      (machine) => isMachineOnline(machine.last_seen)
    ).length
    const offlineMachines = machines.length - onlineMachines

    return {
      totalUsers: users.length,
      activeUsers,
      inactiveUsers,
      totalMachines: machines.length,
      onlineMachines,
      offlineMachines,
    }
  }, [users, machines])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (searchUser) {
        const normalized = searchUser.toLowerCase()
        const name = (user.nome || user.email || '').toLowerCase()
        if (!name.includes(normalized)) {
          return false
        }
      }

      if (roleFilter && user.role !== roleFilter) {
        return false
      }

      return true
    })
  }, [users, roleFilter, searchUser])

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => {
      if (!searchMachine) return true
      return (machine.nome || '').toLowerCase().includes(searchMachine.toLowerCase())
    })
  }, [machines, searchMachine])

  async function handleToggleActive(userId: string, active: boolean) {
    setBusyId(userId)
    setErrorMessage('')

    const updated = await toggleUserActive(userId, !active)

    if (!updated) {
      setErrorMessage('Não foi possível atualizar o usuário. Tente novamente.')
      setBusyId(null)
      return
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId ? { ...user, ativo: !active } : user
      )
    )
    setBusyId(null)
  }

  async function handleRoleChange(userId: string, role: string) {
    setBusyId(userId)
    setErrorMessage('')

    const updated = await changeUserRole(userId, role)

    if (!updated) {
      setErrorMessage('Não foi possível alterar o setor do usuário.')
      setBusyId(null)
      return
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId ? { ...user, role } : user
      )
    )
    setBusyId(null)
  }

  async function handleResendInvite(userId: string, email: string, nome: string, role: string) {
    setBusyId(userId)
    setErrorMessage('')

    const res = await fetch(getFunctionUrl('admin-resend-invite'), {
      method: 'POST',
      headers: await getFunctionHeaders(),
      body: JSON.stringify({ email, nome, role }),
    })

    const json = await res.json()

    if (!res.ok) {
      setErrorMessage(json.error ?? 'Não foi possível reenviar o convite.')
    } else {
      toast.success(`Convite reenviado para ${email}`)
    }

    setBusyId(null)
  }

  async function handleDeleteUser(userId: string) {
    setBusyId(userId)
    setErrorMessage('')

    const result = await deleteUser(userId)

    if (!result.ok) {
      setErrorMessage(result.error ?? 'Não foi possível excluir o usuário.')
      setBusyId(null)
      return
    }

    toast.success('Usuário excluído com sucesso')
    setUsers((current) => current.filter((u) => u.id !== userId))
    setBusyId(null)
  }

  async function handleResetPassword(userId: string, nome: string, email: string, username: string) {
    setBusyId(userId)
    setErrorMessage('')

    const result = await resetUserPassword(userId)

    if (!result.ok || !result.password) {
      setErrorMessage(result.error ?? 'Não foi possível redefinir a senha do usuário.')
      setBusyId(null)
      return
    }

    setResetPasswordResult({ nome, email, username, password: result.password })
    setBusyId(null)
  }

  async function handleMachineToggle(machineId: string, currentAtiva: boolean) {
    setBusyId(machineId)
    setErrorMessage('')

    const updated = await updateMachineStatus(machineId, !currentAtiva)

    if (!updated) {
      setErrorMessage('Não foi possível atualizar o status da máquina.')
      setBusyId(null)
      return
    }

    setMachines((current) =>
      current.map((machine) =>
        machine.id === machineId ? { ...machine, ativa: !currentAtiva } : machine
      )
    )
    setBusyId(null)
  }

  return (
    <div className="bg-card rounded-2xl p-6">
      <div className="space-y-4">
        <div className="space-y-4">
          <AdminSummaryCards counts={totals} />

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            <AdminUsersTable
              users={filteredUsers}
              onToggleActive={handleToggleActive}
              onChangeRole={handleRoleChange}
              onResendInvite={handleResendInvite}
              onDeleteUser={handleDeleteUser}
              onResetPassword={handleResetPassword}
              loadingId={busyId}
              searchUser={searchUser}
              onSearchUserChange={setSearchUser}
              roleFilter={roleFilter}
              onRoleFilterChange={setRoleFilter}
              searchMachine={searchMachine}
              onSearchMachineChange={setSearchMachine}
            />

            <AdminMachinesTable
              machines={filteredMachines}
              onToggle={handleMachineToggle}
              loadingId={busyId}
            />
          </div>
        </div>
      </div>

      <ResetPasswordModal
        result={resetPasswordResult}
        onClose={() => setResetPasswordResult(null)}
      />
    </div>
  )
}
