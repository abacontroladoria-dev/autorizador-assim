'use client';

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Zap } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/inbox':     'Inbox',
  '/contacts':  'Contatos',
  '/crm':       'CRM',
  '/pipeline':  'Pipeline',
  '/analytics': 'Analytics',
  '/settings':  'Configurações',
};

export function ConnectHeader() {
  const { pathname } = useLocation();
  const segment = '/' + (pathname.split('/')[1] ?? '');
  const page = PAGE_TITLES[pathname] ?? PAGE_TITLES[segment] ?? 'Pulsar Connect';

  return (
    <header className="flex items-center h-14 px-5 bg-card border-b border-border shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">Pulsar Connect</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">{page}</span>
      </div>

      {/* Live indicator */}
      <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-500">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Live
      </div>
    </header>
  );
}
