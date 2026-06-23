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
    // ── 1. Validate Pulsar session ────────────────────────────────────────
    const pulsarClient = await createPulsarServerClient();
    const { data: { user: pulsarUser }, error: authErr } = await pulsarClient.auth.getUser();

    if (authErr || !pulsarUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = pulsarUser.email;
    const admin = ninaAdmin();

    // ── 2. Find or create user in Nina's Supabase ─────────────────────────
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let ninaUser = listData?.users.find(u => u.email === email);

    if (!ninaUser) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: pulsarUser.user_metadata?.full_name ?? '' },
      });
      if (createErr || !created?.user) {
        return NextResponse.json({ error: 'Failed to create Nina user', detail: createErr?.message }, { status: 500 });
      }
      ninaUser = created.user;

      // Bootstrap Nina configuration for first-time user.
      try {
        await admin.functions.invoke('initialize-system', {
          body: { user_id: ninaUser.id },
        });
      } catch (initErr) {
        // Non-fatal: the user can complete setup via the onboarding wizard.
        console.warn('[connect/session] initialize-system failed:', initErr);
      }
    }

    // ── 3. Create a Nina session for that user ────────────────────────────
    // admin.createSession() is available in @supabase/supabase-js >= 2.30.
    const { data: sessionData, error: sessionErr } =
      await (admin.auth.admin as any).createSession({ user_id: ninaUser.id });

    if (sessionErr || !sessionData?.session) {
      // Fallback: generate a magic-link OTP and return the token for client
      // to exchange via ninaSupabase.auth.verifyOtp().
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (linkErr || !linkData) {
        return NextResponse.json({ error: 'Failed to generate Nina session', detail: linkErr?.message }, { status: 500 });
      }
      return NextResponse.json({
        strategy: 'otp',
        email,
        token: linkData.properties.email_otp,
      });
    }

    return NextResponse.json({
      strategy: 'session',
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
    });
  } catch (err: any) {
    console.error('[connect/session]', err);
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 });
  }
}
