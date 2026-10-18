import { createClient } from '@supabase/supabase-js';

// Service-role client: server only. Bypasses RLS, so every caller must check ownership first
// (see lib/auth.ts).
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
