'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SidebarContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider')
  }
  return context
}

interface SidebarProps {
  children: ReactNode
  className?: string
}

export function Sidebar({ children, className }: SidebarProps) {
  const [open, setOpen] = useState(true)

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <aside
        className={cn(
          'h-full bg-sidebar text-sidebar-foreground transition-all duration-300',
          open ? 'w-64' : 'w-20',
          className
        )}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  )
}

interface SidebarBodyProps {
  children: ReactNode
  className?: string
}

export function SidebarBody({ children, className }: SidebarBodyProps) {
  return <div className={cn('flex flex-col h-full', className)}>{children}</div>
}

interface SidebarLinkProps {
  href: string
  icon: React.ReactNode
  label: string
  isActive?: boolean
  onClick?: () => void
}

export function SidebarLink({ href, icon, label, isActive, onClick }: SidebarLinkProps) {
  const { open } = useSidebar()

  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent'
      )}
    >
      {icon}
      {open && <span>{label}</span>}
    </a>
  )
}
