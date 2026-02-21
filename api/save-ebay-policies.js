// Save eBay Business Policy Defaults
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const sessionToken = authHeader.replace('Bearer ', '');

  // Authenticate user
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { fulfillment_policy_id, payment_policy_id, return_policy_id } = req.body;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const updates = {
      user_id: user.id,
      updated_at: new Date().toISOString()
    };

    if (fulfillment_policy_id) updates.ebay_fulfillment_policy_id = fulfillment_policy_id;
    if (payment_policy_id) updates.ebay_payment_policy_id = payment_policy_id;
    if (return_policy_id) updates.ebay_return_policy_id = return_policy_id;

    const { error } = await supabase.from('user_settings').upsert(updates, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
