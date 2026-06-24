'use client'

import React, { useState } from 'react'
import { MessageSquare, Users, LayoutDashboard, Kanban, Calendar, Settings as SettingsIcon, LogOut, ArrowLeft, ChevronLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/nina/useAuth'
import Link from 'next/link'
import { toast } from 'sonner'

const menuItems = [
  { id: 'crm',       label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'inbox',     label: 'Inbox',         icon: MessageSquare },
  { id: 'contacts',  label: 'Contatos',      icon: Users },
  { id: 'pipeline',  label: 'Pipeline',      icon: Kanban },
  { id: 'analytics', label: 'Agendamentos',  icon: Calendar },
  { id: 'settings',  label: 'Configurações', icon: SettingsIcon },
]

const SidebarContent = ({ collapsed }: { collapsed: boolean }) => {
  const { user, signOut } = useAuth()
  const pathname = usePathname()
  const currentPath = pathname.replace('/connect/', '')

  const handleLogout = async () => {
    try {
      await signOut()
      toast.success('Logout realizado com sucesso')
      window.location.href = '/auth'
    } catch {
      toast.error('Erro ao fazer logout')
    }
  }

  const getUserInitials = () => {
    if (!user?.email) return 'US'
    return user.email.substring(0, 2).toUpperCase()
  }

  const getDisplayName = () =>
    user?.user_metadata?.full_name || 'Usuário'

  return (
    <>
      {/* Nav items */}
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden px-2">
        <nav className="flex flex-col gap-0.5">
          {menuItems.map((item) => {
            const isActive = currentPath.startsWith(item.id)
            return (
              <Link
                key={item.id}
                href={`/connect/${item.id}`}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Voltar ao Pulsar */}
      <div className="px-2">
        <button
          onClick={() => (window.location.href = '/')}
          title={collapsed ? 'Voltar ao Pulsar' : undefined}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-slate-500 hover:text-slate-100 hover:bg-slate-800/60"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Voltar ao Pulsar</span>
          )}
        </button>
      </div>

      {/* User footer */}
      <div className="border-t border-slate-800 pt-3 px-2">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 border border-slate-600 shrink-0">
            {getUserInitials()}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-slate-100 whitespace-nowrap">
                {getDisplayName()}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email || 'email@example.com'}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-slate-500 hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>
    </>
  )
}

const AppSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`relative h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between gap-6 py-4 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="h-20 flex items-center justify-center px-4 border-b border-slate-800 shrink-0">
        <img
          src="/logo-universo-aba.png"
          className={`object-contain transition-all duration-300 ${collapsed ? 'h-10 w-10' : 'h-20'}`}
        />
      </div>

      <SidebarContent collapsed={collapsed} />

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center hover:bg-slate-800 transition-colors shadow-md z-9999"
        title={collapsed ? 'Expandir menu' : 'Ocultar menu'}
      >
        <ChevronLeft
          className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${
            collapsed ? 'rotate-180' : ''
          }`}
        />
      </button>
    </aside>
  )
}

export default AppSidebar
