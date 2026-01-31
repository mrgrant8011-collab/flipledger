/**
 * LINK TOKENS API
 * ================
 * Called by frontend to store OAuth tokens server-side.
 * This enables 24/7 cron operations without user being logged in.
 * 
 * POST /api/link-tokens
 * Body: {
 *   platform: 'ebay' | 'stockx',
 *   access_token: string,
 *   refresh_token: string (optional),
 *   expires_in: number (seconds)
 * }
 * 
 * Requires Authorization header with Supabase session token.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Get auth token from header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  
  const sessionToken = authHeader.replace('Bearer ', '');
  
  // Get request body
  const { platform, access_token, refresh_token, expires_in } = req.body;
  
  // Validate input
  if (!platform || !['ebay', 'stockx'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be "ebay" or "stockx"' });
  }
  
  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }
  
  // Initialize Supabase client with user's session to get user_id
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_q3biAcBkFiSKEYrdUlkQwg_4a6SjiRy',
    {
      global: { headers: { Authorization: `Bearer ${sessionToken}` } }
    }
  );
  
  try {
    // Get user from session
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    
    if (authError || !user) {
      console.error('[LinkTokens] Auth error:', authError);
      return res.status(401).json({ error: 'Invalid session token' });
    }
    
    console.log(`[LinkTokens] Storing ${platform} tokens for user ${user.id}`);
    
    // Use service role to write to user_tokens (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (expires_in || 7200) * 1000);
    
    // Upsert token (insert or update if exists)
    const { error: upsertError } = await supabaseAdmin
      .from('user_tokens')
      .upsert({
        user_id: user.id,
        platform: platform,
        access_token: access_token,
        refresh_token: refresh_token || null,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });
    
    if (upsertError) {
      console.error('[LinkTokens] Upsert error:', upsertError);
      return res.status(500).json({ error: 'Failed to store tokens' });
    }
    
    console.log(`[LinkTokens] ✓ ${platform} tokens stored successfully for user ${user.id}`);
    
    return res.status(200).json({
      success: true,
      message: `${platform} tokens linked successfully`,
      expires_at: expiresAt.toISOString()
    });
    
  } catch (err) {
    console.error('[LinkTokens] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
