'use client';

import React, { type ReactNode } from 'react';

export function ConnectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col flex-1 min-w-0 h-full">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
