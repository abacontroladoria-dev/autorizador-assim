'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHeader } from '@/contexts/HeaderContext'
import AdminSummaryCards from './AdminSummaryCards'
import AdminUsersTable from './AdminUsersTable'
import AdminMachinesTable from './AdminMachinesTable'
import CreateUserModal from './CreateUserModal'
import {
  changeUserRole,
  toggleUserActive,
  updateMachineStatus,
} from '@/services/admin.service'

export type AdminUser = {
  id: string
  nome?: string
  email?: string
  role?: string
  ativo?: boolean
  created_at?: string
}

export type AdminMachine = {
  id: string
  nome?: string
  status?: string
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

  useEffect(() => {
    setHeader(
      'Painel Administrativo',
      'Gestão de usuários, máquinas e regras do sistema'
    )
  }, [setHeader])

  const totals = useMemo(() => {
    const activeUsers = users.filter((user) => user.ativo).length
    const inactiveUsers = users.length - activeUsers
    const onlineMachines = machines.filter(
      (machine) => machine.status === 'online'
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
      setErrorMessage('Não foi possível alterar a função do usuário.')
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

  async function handleMachineStatus(machineId: string, status: string) {
    setBusyId(machineId)
    setErrorMessage('')

    const updated = await updateMachineStatus(machineId, status)

    if (!updated) {
      setErrorMessage('Não foi possível atualizar o status da máquina.')
      setBusyId(null)
      return
    }

    setMachines((current) =>
      current.map((machine) =>
        machine.id === machineId ? { ...machine, status } : machine
      )
    )
    setBusyId(null)
  }

  return (
    <div className="bg-[#f7f9fc] rounded-2xl p-6">
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
              loadingId={busyId}
            />

            <AdminMachinesTable
              machines={filteredMachines}
              onUpdateStatus={handleMachineStatus}
              loadingId={busyId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
