'use client';

// /connect/[[...slug]] — Pulsar Connect entry point.
// This catch-all renders the ConnectApp SPA for every /connect/* path,
// so Nina's BrowserRouter(basename="/connect") can do client-side routing
// while hard refreshes still land here.
//
// 'use client' is required: next/dynamic with ssr:false is only allowed
// inside Client Components (Next.js 16 restriction).

import dynamic from 'next/dynamic';

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

export default function ConnectPage() {
  // The page fills the space provided by the (dashboard) layout.
  // ConnectLayout (sidebar + header) replaces Pulsar's chrome for this area.
  return (
    <div className="h-full w-full">
      <ConnectApp />
    </div>
  );
}
