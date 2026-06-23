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

    // 1. Validate Pulsar session
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

    // 2. Create or get user in Nina's Supabase
    console.log('[connect/session] 🆕 Attempting to create Nina user for:', email);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: pulsarUser.user_metadata?.full_name ?? '' },
    });

    let ninaUser = created?.user;

    // If user already exists, that's OK - we'll use OTP fallback
    if (createErr && createErr.message?.includes('already exists')) {
      console.log('[connect/session] ℹ️ Nina user already exists for:', email);
    } else if (createErr) {
      console.error('[connect/session] ❌ createUser error:', createErr);
      return NextResponse.json({ error: 'Failed to create Nina user', detail: createErr?.message }, { status: 500 });
    } else if (created?.user) {
      console.log('[connect/session] ✅ Nina user created:', { id: ninaUser?.id, email: ninaUser?.email });

      // Initialize system for new user (non-fatal if fails)
      try {
        console.log('[connect/session] 🔧 Initializing system for new user...');
        await admin.functions.invoke('initialize-system', {
          body: { user_id: ninaUser.id },
        });
        console.log('[connect/session] ✅ System initialized');
      } catch (initErr) {
        console.warn('[connect/session] ⚠️ initialize-system failed (non-fatal):', initErr);
      }
    }

    // 3. Create session or fallback to OTP
    let sessionData: any = null;
    let sessionErr: any = null;

    if (ninaUser?.id) {
      console.log('[connect/session] 🔐 Creating session for Nina user:', ninaUser.id);
      const result = await (admin.auth.admin as any).createSession({ user_id: ninaUser.id });
      sessionData = result.data;
      sessionErr = result.error;
    } else {
      console.log('[connect/session] ⚠️ No user ID available, skipping createSession');
      sessionErr = new Error('No user ID');
    }

    if (sessionErr) {
      console.error('[connect/session] ❌ createSession error:', sessionErr);
    }
    if (!sessionData?.session) {
      console.warn('[connect/session] ⚠️ createSession returned no session, falling back to OTP');
    }

    // Fallback to OTP
    if (sessionErr || !sessionData?.session) {
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
