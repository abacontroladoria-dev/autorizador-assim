'use client';

import React, { type ReactNode } from 'react';
import { ConnectSidebar } from './ConnectSidebar';
import { ConnectHeader } from './ConnectHeader';

export function ConnectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-lg border border-border bg-background">
      <ConnectSidebar />
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <ConnectHeader />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
