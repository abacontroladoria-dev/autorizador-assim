'use client';

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  Users,
  BarChart3,
  Kanban,
  LineChart,
  Settings,
  ChevronLeft,
  Zap,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/inbox',     label: 'Inbox',      Icon: Inbox },
  { path: '/contacts',  label: 'Contatos',   Icon: Users },
  { path: '/crm',       label: 'CRM',        Icon: BarChart3 },
  { path: '/pipeline',  label: 'Pipeline',   Icon: Kanban },
  { path: '/analytics', label: 'Analytics',  Icon: LineChart },
  { path: '/settings',  label: 'Config',     Icon: Settings },
] as const;

export function ConnectSidebar() {
  const { pathname } = useLocation();
  const router = useRouter();

  return (
    <aside className="flex flex-col w-52 shrink-0 bg-card border-r border-border h-full">
      {/* Branding */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Pulsar Connect</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 leading-tight ml-9">
          CRM · Atendimento · Automação
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const active = pathname === path || pathname.startsWith(path + '/');
          return (
            <Link
              key={path}
              to={path}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Back to Pulsar */}
      <div className="px-2 pb-4 border-t border-border pt-3">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          Voltar ao Pulsar
        </button>
      </div>
    </aside>
  );
}
