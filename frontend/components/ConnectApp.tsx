'use client';

// ConnectApp — Pulsar Connect SPA entry point.
//
// Auth strategy:
//   - Uses Pulsar's authenticated user (already logged in)
//   - PulsarAuthProvider converts Pulsar user to Nina-compatible shape
//   - No extra login/signup needed; no localStorage; no Nina Supabase auth
//   - Session managed server-side by Pulsar
//
// Routing: BrowserRouter(basename="/connect") scopes all paths under /connect.

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/nina/useAuth';
import { CompanySettingsProvider } from '@/hooks/nina/useCompanySettings';

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

// ConnectLayout from local components
import { ConnectLayout } from './ConnectLayout';

// Guards the ConnectLayout: checks Pulsar user is authenticated.
// Must be a descendant of PulsarAuthProvider.
function ProtectedConnectLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
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
  return (
    <BrowserRouter basename="/connect">
      <AuthProvider>
        <CompanySettingsProvider>
          <Routes>
            {/* Public: redirect to home if accessed */}
            <Route path="/auth" element={<Navigate to="/" replace />} />

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
