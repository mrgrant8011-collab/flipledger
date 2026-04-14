/**
 * ═══════════════════════════════════════════════════════════════
 * CHECK ACCESS — /api/check-access
 * ═══════════════════════════════════════════════════════════════
 * Called by App.jsx on load and every 5 minutes.
 * Checks if user's email is still in allowed_emails.
 * Returns { allowed: true/false }
 * ═══════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ allowed: false });
  }

  const sessionToken = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return res.status(200).json({ allowed: false });

  const { data } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('email', user?.email?.toLowerCase() ?? '')
    .maybeSingle();

  return res.status(200).json({ allowed: !!data });
}
