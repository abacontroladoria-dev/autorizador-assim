'use client';

// /connect/[[...slug]] — Pulsar Connect entry point.
//
// ConnectApp (React Router SPA) uses PulsarAuthProvider which:
// - Gets the Pulsar user (already authenticated)
// - Converts it to Nina-compatible shape
// - No extra auth steps, no Nina Supabase calls
//
// Flow:
//   Pulsar user (server-side authenticated)
//     ↓
//   ConnectApp renders with PulsarAuthProvider
//     ↓
//   useAuth() returns Pulsar user
//     ↓
//   Dashboard renders without redirect

import dynamic from 'next/dynamic';

const ConnectApp = dynamic(
  () => import('@/components/ConnectApp').then(m => ({ default: m.ConnectApp })),
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

export default function ConnectPage() {
  return (
    <div className="h-full w-full">
      <ConnectApp />
    </div>
  );
}
