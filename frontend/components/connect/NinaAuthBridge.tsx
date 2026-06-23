'use client';

// NinaAuthBridge — sets up a Nina Supabase session from the Pulsar user's
// credentials (no second login), then renders Nina's context providers.
//
// Flow:
//   POST /api/connect/session  →  { access_token, refresh_token }
//   ninaSupabase.auth.setSession()
//   <AuthProvider><CompanySettingsProvider>{children}</CompanySettingsProvider></AuthProvider>

import React, { useState, useEffect, type ReactNode } from 'react';
// @ts-ignore — resolved via webpack @nina alias → nina-api-oficial/src
import { supabase as ninaSupabase } from '@nina/integrations/supabase/client';
// @ts-ignore
import { AuthProvider } from '@nina/hooks/useAuth';
// @ts-ignore
import { CompanySettingsProvider } from '@nina/hooks/useCompanySettings';

type BridgeStatus = 'loading' | 'ready' | 'error';

export function NinaAuthBridge({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BridgeStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch('/api/connect/session', { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();

        if (data.strategy === 'session') {
          const { error } = await ninaSupabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          if (error) throw error;
        } else {
          // OTP fallback: exchange token via verifyOtp
          const { error } = await ninaSupabase.auth.verifyOtp({
            email: data.email,
            token: data.token,
            type: 'magiclink',
          });
          if (error) throw error;
        }

        if (!cancelled) setStatus('ready');
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message ?? 'Erro desconhecido');
          setStatus('error');
        }
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium tracking-wide">Pulsar Connect</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="font-semibold text-destructive">Falha ao conectar</p>
          <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <CompanySettingsProvider>
        {children}
      </CompanySettingsProvider>
    </AuthProvider>
  );
}
