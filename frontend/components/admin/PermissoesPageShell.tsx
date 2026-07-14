'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutDashboard,
  Pencil,
  PlusCircle,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useHeader } from '@/contexts/HeaderContext'
import { getSupabaseClient } from '@/lib/supabase/client'
import { changeUserRole, getAdminUsers } from '@/services/admin.service'
import type { AdminUser } from '@/services/admin.service'
import {
  getPermissoes,
  getUsuarioPermissoes,
  restaurarPermissoesDoPerfil,
  salvarPermissoesUsuario,
} from '@/services/permissoes.service'
import type { Permissao } from '@/services/permissoes.service'
import { getRoleDefaultPermissions } from '@/lib/permissions/hasPermission'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const supabase = getSupabaseClient()

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  diretoria: 'Diretoria',
  recepcao: 'Recepção',
  autorizacao: 'Autorização',
  terapeutico: 'Terapêutico',
  faturamento: 'Faturamento',
  rp: 'RP',
}

const ROLES = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

const MODULE_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  atendimentos: PlusCircle,
  gestao: Activity,
  cronograma: CalendarDays,
  escala_terapeutica: UserRound,
  analise_tratativas: ClipboardCheck,
  agenda_terapeutica: CalendarDays,
  salas: Building2,
  auditoria_assim: ClipboardList,
  guias_digitais: FileText,
  usuarios: Users,
  permissoes: KeyRound,
}

const GROUP_ICONS: Record<string, React.ElementType> = {
  Sistema: LayoutDashboard,
  Geral: LayoutDashboard,
  Pacientes: Users,
  Terapêutico: Stethoscope,
  Operações: BriefcaseBusiness,
  Administração: ShieldCheck,
}

const GROUP_ORDER = ['Pacientes', 'Terapêutico', 'Operações', 'Administração', 'Sistema', 'Geral']

const INITIAL_OPEN = new Set(GROUP_ORDER)

const AVATAR_COLORS = [
  '#3A8FB7', '#7C6AEA', '#22C55E', '#F59E0B',
  '#EF4444', '#14B8A6', '#F97316', '#8B5CF6', '#EC4899',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function computeEffectivePerms(
  overrideMap: Record<string, boolean>,
  role: string,
  allPermissoes: Permissao[]
): Record<string, boolean> {
  const defaults = getRoleDefaultPermissions(role)
  const effective: Record<string, boolean> = {}
  for (const p of allPermissoes) {
    effective[p.codigo] =
      p.codigo in overrideMap ? overrideMap[p.codigo] : defaults.includes(p.codigo)
  }
  return effective
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Avatar({ name, userId, size = 'md' }: {
  name?: string
  userId: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const color = getAvatarColor(userId)
  const initial = (name || '?').charAt(0).toUpperCase()
  const cls = size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-base'
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

function Checkbox({ checked, indeterminate, onChange }: {
  checked: boolean
  indeterminate?: boolean
  onChange?: (value: boolean) => void
}) {
  const isActive = checked || (indeterminate ?? false)
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all duration-150 ${
        isActive
          ? 'bg-[#3A8FB7] border-[#3A8FB7]'
          : 'bg-white border-slate-300 hover:border-[#3A8FB7]/60'
      }`}
    >
      {indeterminate && !checked ? (
        <svg viewBox="0 0 10 2" className="w-2.5 h-1" fill="none">
          <line x1="1" y1="1" x2="9" y2="1" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : checked ? (
        <svg viewBox="0 0 12 10" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1,5 4.5,8.5 11,1" />
        </svg>
      ) : null}
    </button>
  )
}

function GroupCard({ grupo, items, perms, isOpen, onToggleOpen, onToggle }: {
  grupo: string
  items: Permissao[]
  perms: Record<string, boolean>
  isOpen: boolean
  onToggleOpen: () => void
  onToggle: (codigo: string, value: boolean) => void
}) {
  const checkedCount = items.filter(p => perms[p.codigo] ?? false).length
  const allChecked = checkedCount === items.length && items.length > 0
  const someChecked = checkedCount > 0 && !allChecked

  const GroupIcon = GROUP_ICONS[grupo] || ShieldCheck

  function handleGroupCheck() {
    const newValue = !allChecked
    for (const p of items) onToggle(p.codigo, newValue)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors duration-150 select-none"
        onClick={onToggleOpen}
      >
        <div onClick={e => e.stopPropagation()}>
          <Checkbox checked={allChecked} indeterminate={someChecked} onChange={handleGroupCheck} />
        </div>

        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <GroupIcon size={14} className="text-slate-500" />
        </div>

        <span className="flex-1 text-sm font-semibold text-slate-700">{grupo}</span>

        <span className="text-xs text-slate-400">
          {checkedCount}/{items.length}
        </span>

        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 ml-1 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Itens */}
      {isOpen && (
        <div className="border-t border-slate-100">
          {items.map((p, idx) => {
            const Icon = MODULE_ICONS[p.codigo] || ShieldCheck
            const permitted = perms[p.codigo] ?? false
            return (
              <div
                key={p.codigo}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors duration-100 cursor-pointer ${
                  idx > 0 ? 'border-t border-slate-50' : ''
                }`}
                onClick={() => onToggle(p.codigo, !permitted)}
              >
                <div onClick={e => e.stopPropagation()}>
                  <Checkbox checked={permitted} onChange={val => onToggle(p.codigo, val)} />
                </div>
                <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon size={12} className="text-slate-500" />
                </div>
                <span className={`text-sm transition-colors ${permitted ? 'text-slate-700' : 'text-slate-400'}`}>
                  {p.nome}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PermissoesPageShell() {
  const { setHeader } = useHeader()

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [originalPerms, setOriginalPerms] = useState<Record<string, boolean>>({})
  const [loadingUser, setLoadingUser] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [showEditRole, setShowEditRole] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [savingRole, setSavingRole] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(INITIAL_OPEN)

  useEffect(() => {
    setHeader('Permissões', 'Gerencie as permissões de acesso dos usuários aos módulos do sistema.')
  }, [setHeader])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setIsAdmin(false); return }
      const { data: perfil } = await supabase
        .from('usuarios').select('role').eq('id', data.user.id).single()
      const role = perfil?.role ?? ''
      // Mesma fonte de verdade do Sidebar/proxy (routes.ts): defaults do role +
      // override individual — não um `role === 'admin'` fixo. Isso é o que
      // permite liberar esta tela para outro role (ex.: diretoria) via
      // routes.ts sem precisar editar este componente de novo.
      if (role === 'admin') { setIsAdmin(true); return }
      const defaults = getRoleDefaultPermissions(role)
      const overrides = await getUsuarioPermissoes(data.user.id)
      const override = overrides.find(o => o.permissao_codigo === 'permissoes')
      setIsAdmin(override ? override.permitido : defaults.includes('permissoes'))
    })
  }, [])

  useEffect(() => {
    if (isAdmin !== true) return
    Promise.all([getAdminUsers(), getPermissoes()]).then(([u, p]) => {
      setUsers(u)
      setPermissoes(p)
    })
  }, [isAdmin])

  // ─── Computados ──────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(u => (u.nome || u.email || '').toLowerCase().includes(q))
  }, [users, search])

  const isDirty = useMemo(
    () => JSON.stringify(perms) !== JSON.stringify(originalPerms),
    [perms, originalPerms]
  )

  const liberadosCount = useMemo(
    () => permissoes.filter(p => perms[p.codigo] === true).length,
    [perms, permissoes]
  )

  const sortedGroups = useMemo<[string, Permissao[]][]>(() => {
    const map = new Map<string, Permissao[]>()
    for (const p of permissoes) {
      const g = p.grupo || 'Outros'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    const ordered = GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => [g, map.get(g)!] as [string, Permissao[]])
    const rest = Array.from(map.entries()).filter(([g]) => !GROUP_ORDER.includes(g))
    return [...ordered, ...rest]
  }, [permissoes])

  // ─── Handlers (lógica de negócio inalterada) ─────────────────────────────

  async function handleSelectUser(user: AdminUser) {
    setSelectedUser(user)
    setLoadingUser(true)
    const overrides = await getUsuarioPermissoes(user.id)
    const overrideMap = Object.fromEntries(overrides.map(o => [o.permissao_codigo, o.permitido]))
    const effective = computeEffectivePerms(overrideMap, user.role || '', permissoes)
    setPerms(effective)
    setOriginalPerms({ ...effective })
    setLoadingUser(false)
  }

  async function handleSave() {
    if (!selectedUser) return
    setSaving(true)
    const ok = await salvarPermissoesUsuario(selectedUser.id, perms)
    if (ok) {
      setOriginalPerms({ ...perms })
      toast.success('Permissões salvas com sucesso')
    } else {
      toast.error('Erro ao salvar permissões')
    }
    setSaving(false)
  }

  async function handleRestore() {
    if (!selectedUser) return
    setRestoring(true)
    const ok = await restaurarPermissoesDoPerfil(selectedUser.id)
    if (ok) {
      const effective = computeEffectivePerms({}, selectedUser.role || '', permissoes)
      setPerms(effective)
      setOriginalPerms({ ...effective })
      toast.success('Permissões restauradas para o perfil padrão')
    } else {
      toast.error('Erro ao restaurar permissões')
    }
    setRestoring(false)
  }

  async function handleSaveRole() {
    if (!selectedUser || !newRole) return
    setSavingRole(true)
    const ok = await changeUserRole(selectedUser.id, newRole)
    if (ok) {
      const updated = { ...selectedUser, role: newRole }
      setSelectedUser(updated)
      setUsers(prev => prev.map(u => (u.id === selectedUser.id ? updated : u)))
      const overrides = await getUsuarioPermissoes(selectedUser.id)
      const overrideMap = Object.fromEntries(overrides.map(o => [o.permissao_codigo, o.permitido]))
      const effective = computeEffectivePerms(overrideMap, newRole, permissoes)
      setPerms(effective)
      setOriginalPerms({ ...effective })
      toast.success('Perfil atualizado com sucesso')
      setShowEditRole(false)
    } else {
      toast.error('Erro ao atualizar perfil')
    }
    setSavingRole(false)
  }

  function handleToggle(codigo: string, value: boolean) {
    setPerms(prev => ({ ...prev, [codigo]: value }))
  }

  function toggleGroup(grupo: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(grupo)) next.delete(grupo)
      else next.add(grupo)
      return next
    })
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#3A8FB7] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={28} className="text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Acesso não autorizado</h2>
          <p className="text-sm text-slate-500">
            Seu perfil não tem permissão para gerenciar permissões.
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex gap-4 items-start">

        {/* ── Lista de usuários ── */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 px-1">Usuários</h2>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar usuário..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/10"
              />
            </div>

            <div className="space-y-0.5 max-h-[calc(100vh-300px)] overflow-y-auto">
              {filteredUsers.map(user => {
                const active = selectedUser?.id === user.id
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150 ${
                      active
                        ? 'bg-[#3A8FB7]/10 border border-[#3A8FB7]/20'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <Avatar name={user.nome} userId={user.id} size="sm" />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate leading-tight ${active ? 'text-[#3A8FB7]' : 'text-slate-700'}`}>
                        {user.nome || user.email}
                      </p>
                      <p className="text-xs text-slate-400 truncate leading-tight mt-0.5">
                        {ROLE_LABELS[user.role || ''] || user.role || '—'}
                      </p>
                    </div>
                  </button>
                )
              })}
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-6">Nenhum usuário encontrado</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Painel principal ── */}
        <div className="flex-1 space-y-4 min-w-0">

          {!selectedUser ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center min-h-96">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                <KeyRound size={26} className="text-slate-300" />
              </div>
              <p className="text-slate-400 text-sm">
                Selecione um usuário para visualizar as permissões.
              </p>
            </div>
          ) : (
            <>
              {/* ── Card: dados do usuário ── */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Usuário selecionado
                </p>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Avatar name={selectedUser.nome} userId={selectedUser.id} size="lg" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-800">
                          {selectedUser.nome || selectedUser.email}
                        </h2>
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#3A8FB7]/10 text-[#3A8FB7]">
                          {ROLE_LABELS[selectedUser.role || ''] || selectedUser.role}
                        </span>
                      </div>
                      {selectedUser.email && (
                        <p className="text-sm text-slate-400 mt-0.5">E-mail: {selectedUser.email}</p>
                      )}
                      <p className="text-sm text-slate-400 mt-1">
                        Perfil padrão:{' '}
                        <button
                          onClick={() => { setNewRole(selectedUser.role || ''); setShowEditRole(true) }}
                          className="text-[#3A8FB7] font-medium hover:underline"
                        >
                          {ROLE_LABELS[selectedUser.role || ''] || selectedUser.role}
                        </button>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setNewRole(selectedUser.role || ''); setShowEditRole(true) }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 shrink-0"
                  >
                    <Pencil size={13} />
                    Editar perfil
                  </button>
                </div>
              </div>

              {/* ── Seção: permissões por módulo ── */}
              {loadingUser ? (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-14 gap-3">
                  <div className="w-5 h-5 border-2 border-[#3A8FB7] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">Carregando permissões...</span>
                </div>
              ) : (
                <>
                  {/* Título + resumo */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Permissões por módulo</h3>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#3A8FB7]/10 text-[#3A8FB7]">
                      {liberadosCount} de {permissoes.length} módulos liberados
                    </span>
                  </div>

                  {/* Grid de grupos */}
                  {sortedGroups.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
                      <p className="text-sm text-slate-400">Nenhum módulo encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sortedGroups.map(([grupo, items]) => (
                        <GroupCard
                          key={grupo}
                          grupo={grupo}
                          items={items}
                          perms={perms}
                          isOpen={openGroups.has(grupo)}
                          onToggleOpen={() => toggleGroup(grupo)}
                          onToggle={handleToggle}
                        />
                      ))}
                    </div>
                  )}

                  {/* Barra de ações */}
                  <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3.5">
                    <span className="text-xs text-slate-400">
                      {permissoes.length} módulo{permissoes.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleRestore}
                        disabled={restoring}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all duration-150 disabled:opacity-50"
                      >
                        <RotateCcw size={13} className={restoring ? 'animate-spin' : ''} />
                        {restoring ? 'Restaurando...' : 'Restaurar padrão do perfil'}
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !isDirty}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#3A8FB7] rounded-2xl hover:bg-[#3380a8] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save size={13} />
                        {saving ? 'Salvando...' : 'Salvar alterações'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modal: Editar perfil ── */}
      {selectedUser && (
        <Dialog open={showEditRole} onOpenChange={setShowEditRole}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Editar perfil</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Alterar o perfil de{' '}
                <strong className="text-slate-700">{selectedUser.nome || selectedUser.email}</strong>
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Perfil</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#3A8FB7] focus:ring-2 focus:ring-[#3A8FB7]/10"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowEditRole(false)}
                  className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveRole}
                  disabled={savingRole || newRole === selectedUser.role}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-[#3A8FB7] rounded-2xl hover:bg-[#3380a8] transition-colors disabled:opacity-50"
                >
                  {savingRole ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
