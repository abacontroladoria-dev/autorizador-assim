'use client';

// ConnectApp — Pulsar Connect SPA entry point.
//
// Auth strategy (no service-role key required):
//   - Nina's own AuthProvider manages session via localStorage.
//   - Unauthenticated users are routed to /auth (Nina's login page).
//   - After login, Nina navigates to /dashboard → we redirect that to /inbox.
//   - Session persists across page loads; first-time users sign up once.
//
// Routing: BrowserRouter(basename="/connect") scopes all paths under /connect.

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ConnectLayout } from './ConnectLayout';

// Nina context providers — resolved via webpack @nina alias
// @ts-ignore
import { AuthProvider, useAuth } from '@nina/hooks/useAuth';
// @ts-ignore
import { CompanySettingsProvider } from '@nina/hooks/useCompanySettings';

// Nina page components
// @ts-ignore
import ChatInterface from '@nina/components/ChatInterface';
// @ts-ignore
import Dashboard from '@nina/components/Dashboard';
// @ts-ignore
import Kanban from '@nina/components/Kanban';
// @ts-ignore
import Contacts from '@nina/components/Contacts';
// @ts-ignore
import Scheduling from '@nina/components/Scheduling';
// @ts-ignore
import Settings from '@nina/components/Settings';
// @ts-ignore
import { OnboardingWizard } from '@nina/components/OnboardingWizard';
// @ts-ignore
import Auth from '@nina/pages/Auth';

// Guards the ConnectLayout: unauthenticated users go to /auth.
// Must be a descendant of AuthProvider.
function ProtectedConnectLayout() {
  const { user, loading } = useAuth();

  // DEBUG: Log auth state
  console.log('[ConnectApp/ProtectedConnectLayout]', {
    user: user ? { id: user.id, email: user.email } : null,
    loading,
    redirecting: !user && !loading,
  });

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    console.log('[ConnectApp] ⚠️ REDIRECTING TO /auth because user is null');
    return <Navigate to="/auth" replace />;
  }

  return (
    <ConnectLayout>
      <Outlet />
    </ConnectLayout>
  );
}

// Provides the OutletContext that Dashboard and Settings require
// ({showOnboarding, setShowOnboarding}).
function NinaOutletWrapper() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  return (
    <>
      <Outlet context={{ showOnboarding, setShowOnboarding }} />
      <OnboardingWizard isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </>
  );
}

export function ConnectApp() {
  console.log('[ConnectApp] 🔴 ConnectApp SPA is rendering (React Router)');

  return (
    <BrowserRouter basename="/connect">
      <AuthProvider>
        <CompanySettingsProvider>
          <Routes>
            {/* Public: Nina login / sign-up */}
            <Route path="/auth" element={<Auth />} />

            {/* Protected: ConnectLayout guards unauthenticated access */}
            <Route element={<ProtectedConnectLayout />}>
              <Route path="/" element={<Navigate to="/inbox" replace />} />
              {/* Post-login, Nina redirects to /dashboard — map it to /inbox */}
              <Route path="/dashboard" element={<Navigate to="/inbox" replace />} />
              <Route element={<NinaOutletWrapper />}>
                <Route path="/inbox"     element={<ChatInterface />} />
                <Route path="/contacts"  element={<Contacts />} />
                <Route path="/crm"       element={<Dashboard />} />
                <Route path="/pipeline"  element={<Kanban />} />
                <Route path="/analytics" element={<Scheduling />} />
                <Route path="/settings"  element={<Settings />} />
              </Route>
            </Route>
          </Routes>
          <Toaster position="top-right" richColors theme="dark" />
        </CompanySettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
