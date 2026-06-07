'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="px-3 py-2">
      <div className="flex items-center rounded-lg p-0.5 bg-sidebar-accent/50 border border-sidebar-border">
        <button
          onClick={() => setTheme('light')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer
            ${theme === 'light'
              ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
            }`}
        >
          <Sun size={13} />
          <span>Light</span>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer
            ${theme === 'dark'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
            }`}
        >
          <Moon size={13} />
          <span>Dark</span>
        </button>
      </div>
    </div>
  )
}
