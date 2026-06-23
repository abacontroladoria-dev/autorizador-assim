'use client';

// /connect/[[...slug]] — Pulsar Connect entry point with NinaAuthBridge.
//
// This page:
// 1. Bootstraps the Pulsar user session to Nina's Supabase
// 2. Renders the ConnectApp SPA (React Router) with auth already set up
//
// Flow:
//   Pulsar user (authenticated)
//     ↓
//   NinaAuthBridge (fetches /api/connect/session)
//     ↓
//   ninaSupabase.auth.setSession(tokens)
//     ↓
//   ConnectApp (useAuth() finds user without redirect)

import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';

// @ts-ignore — resolved via webpack @nina alias
import { supabase as ninaSupabase } from '@nina/integrations/supabase/client';

const ConnectApp = dynamic(
  () => import('@/components/connect/ConnectApp').then(m => ({ default: m.ConnectApp })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">Pulsar Connect</span>
        </div>
      </div>
    ),
  }
);

type BridgeStatus = 'loading' | 'ready' | 'error';

function NinaAuthBridge({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BridgeStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        console.log('[NinaAuthBridge] 🌉 Starting bootstrap...');

        // 1. Fetch Pulsar session from server
        console.log('[NinaAuthBridge] 📡 Fetching Pulsar session from /api/connect/session...');
        const res = await fetch('/api/connect/session', { method: 'POST' });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log('[NinaAuthBridge] ✅ Got session from server', {
          strategy: data.strategy,
          hasAccessToken: !!data.access_token,
          hasRefreshToken: !!data.refresh_token,
        });

        // 2. Inject session into Nina's Supabase
        if (data.strategy === 'session') {
          console.log('[NinaAuthBridge] 🔑 Setting session in Nina Supabase...');
          const { error, data: sessionData } = await ninaSupabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });

          if (error) {
            console.error('[NinaAuthBridge] ❌ setSession error:', error);
            throw error;
          }

          // Verify user is now set
          const { data: { user } } = await ninaSupabase.auth.getUser();
          console.log('[NinaAuthBridge] ✅ Session injected, user is now:', user ? { id: user.id, email: user.email } : null);

        } else if (data.strategy === 'otp') {
          console.log('[NinaAuthBridge] 🔑 Verifying OTP in Nina Supabase...');
          const { error } = await ninaSupabase.auth.verifyOtp({
            email: data.email,
            token: data.token,
            type: 'magiclink',
          });

          if (error) {
            console.error('[NinaAuthBridge] ❌ verifyOtp error:', error);
            throw error;
          }

          console.log('[NinaAuthBridge] ✅ OTP verified');
        }

        if (!cancelled) {
          console.log('[NinaAuthBridge] 🚀 Ready to render ConnectApp');
          setStatus('ready');
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message ?? 'Unknown error';
          console.error('[NinaAuthBridge] 💥 Error:', msg);
          setErrorMsg(msg);
          setStatus('error');
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">Pulsar Connect</span>
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

  return children;
}

export default function ConnectPage() {
  // The page fills the space provided by the (dashboard) layout.
  // ConnectLayout (sidebar + header) replaces Pulsar's chrome for this area.
  console.log('[/connect/[[...slug]]/page.tsx] 🔴 Catch-all page is rendering (with NinaAuthBridge)');

  return (
    <div className="h-full w-full">
      <NinaAuthBridge>
        <ConnectApp />
      </NinaAuthBridge>
    </div>
  );
}
