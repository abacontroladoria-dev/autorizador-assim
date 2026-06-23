// POST /api/connect/session
// Validates the current Pulsar session server-side, then provisions a Nina
// Supabase session for that user (creating the Nina account if needed).
// Returns { access_token, refresh_token } so the client can call
// ninaSupabase.auth.setSession() without a second login.
//
// Required env vars (server-side only, no NEXT_PUBLIC_ prefix):
//   NINA_SUPABASE_URL            — Nina project URL
//   NINA_SUPABASE_SERVICE_ROLE_KEY — Nina service role key

import { createClient as createPulsarServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const NINA_URL = process.env.NINA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_NINA_SUPABASE_URL ?? '';
const NINA_SRK = process.env.NINA_SUPABASE_SERVICE_ROLE_KEY ?? '';

function ninaAdmin() {
  if (!NINA_URL || !NINA_SRK) {
    throw new Error('NINA_SUPABASE_URL and NINA_SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  return createClient(NINA_URL, NINA_SRK, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST() {
  try {
    console.log('[connect/session] 🌉 Bootstrapping Nina auth...');

    // ── 1. Validate Pulsar session ────────────────────────────────────────
    const pulsarClient = await createPulsarServerClient();
    const { data: { user: pulsarUser }, error: authErr } = await pulsarClient.auth.getUser();

    if (authErr || !pulsarUser?.email) {
      console.error('[connect/session] ❌ Pulsar auth failed:', authErr?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = pulsarUser.email;
    console.log('[connect/session] ✅ Pulsar user authenticated:', email);

    const admin = ninaAdmin();
    console.log('[connect/session] 🔑 Nina admin client created');

    // ── 2. Find or create user in Nina's Supabase ─────────────────────────
    console.log('[connect/session] 📋 Listing Nina users...');
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });

    if (listErr) {
      console.error('[connect/session] ❌ Failed to list Nina users:', listErr);
      return NextResponse.json({ error: 'Failed to list Nina users', detail: listErr.message }, { status: 500 });
    }

    let ninaUser = listData?.users.find(u => u.email === email);
    console.log('[connect/session] Found Nina user?', ninaUser ? { id: ninaUser.id, email: ninaUser.email } : 'NO - will create');

    if (!ninaUser) {
      console.log('[connect/session] 🆕 Creating Nina user for:', email);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: pulsarUser.user_metadata?.full_name ?? '' },
      });

      if (createErr) {
        console.error('[connect/session] ❌ createUser error:', createErr);
        return NextResponse.json({ error: 'Failed to create Nina user', detail: createErr?.message }, { status: 500 });
      }

      if (!created?.user) {
        console.error('[connect/session] ❌ createUser returned no user');
        return NextResponse.json({ error: 'Failed to create Nina user', detail: 'No user returned' }, { status: 500 });
      }

      ninaUser = created.user;
      console.log('[connect/session] ✅ Nina user created:', { id: ninaUser.id, email: ninaUser.email });

      // Bootstrap Nina configuration for first-time user.
      try {
        console.log('[connect/session] 🔧 Initializing system for new user...');
        await admin.functions.invoke('initialize-system', {
          body: { user_id: ninaUser.id },
        });
        console.log('[connect/session] ✅ System initialized');
      } catch (initErr) {
        // Non-fatal: the user can complete setup via the onboarding wizard.
        console.warn('[connect/session] ⚠️ initialize-system failed (non-fatal):', initErr);
      }
    }

    // ── 3. Create a Nina session for that user ────────────────────────────
    // admin.createSession() is available in @supabase/supabase-js >= 2.30.
    console.log('[connect/session] 🔐 Creating session for Nina user:', ninaUser.id);
    const { data: sessionData, error: sessionErr } =
      await (admin.auth.admin as any).createSession({ user_id: ninaUser.id });

    if (sessionErr) {
      console.error('[connect/session] ❌ createSession error:', sessionErr);
    }
    if (!sessionData?.session) {
      console.warn('[connect/session] ⚠️ createSession returned no session, falling back to OTP');
    }

    if (sessionErr || !sessionData?.session) {
      // Fallback: generate a magic-link OTP and return the token for client
      // to exchange via ninaSupabase.auth.verifyOtp().
      console.log('[connect/session] 📧 Generating magic link OTP for:', email);
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

      if (linkErr) {
        console.error('[connect/session] ❌ generateLink error:', linkErr);
        return NextResponse.json({ error: 'Failed to generate Nina session', detail: linkErr?.message }, { status: 500 });
      }

      if (!linkData) {
        console.error('[connect/session] ❌ generateLink returned no data');
        return NextResponse.json({ error: 'Failed to generate Nina session', detail: 'No link data' }, { status: 500 });
      }

      console.log('[connect/session] ✅ OTP generated');
      return NextResponse.json({
        strategy: 'otp',
        email,
        token: linkData.properties.email_otp,
      });
    }

    console.log('[connect/session] ✅ Session created, returning tokens');
    return NextResponse.json({
      strategy: 'session',
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
    });
  } catch (err: any) {
    console.error('[connect/session] 💥 Unexpected error:', err.message);
    console.error('[connect/session] Stack:', err.stack);
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 });
  }
}
