import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  
  const sessionToken = authHeader.replace('Bearer ', '');
  const { platform, access_token, refresh_token, expires_in } = req.body;
  
  if (!platform || !['ebay', 'stockx'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }
  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }
  
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
  );
  
  try {
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Invalid session token' });
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const expiresAt = new Date(Date.now() + (expires_in || 7200) * 1000);
    
    const { error: upsertError } = await supabaseAdmin.from('user_tokens').upsert({
      user_id: user.id,
      platform: platform,
      access_token: access_token,
      refresh_token: refresh_token || null,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,platform' });
    
    if (upsertError) return res.status(500).json({ error: 'Failed to store tokens' });
    
    return res.status(200).json({
      success: true,
      message: `${platform} tokens linked successfully`,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
