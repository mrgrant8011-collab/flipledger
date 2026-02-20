import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  const { code, state } = req.query;
  const userId = state ? decodeURIComponent(state) : null;
  
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }
  
  try {
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.STOCKX_CLIENT_ID,
        client_secret: process.env.STOCKX_CLIENT_SECRET,
        code: code,
        redirect_uri: 'https://flipledger.vercel.app/api/callback'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      return res.status(400).json({ error: tokens.error_description || tokens.error });
    }
    
    // Save tokens per-user in Supabase
    if (userId && tokens.refresh_token) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          await supabase.from('user_tokens').upsert({
            user_id: userId,
            platform: 'stockx',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: new Date(Date.now() + (tokens.expires_in || 86400) * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,platform' });
        }
      } catch (dbErr) {
        console.error('[StockX Callback] DB save error:', dbErr.message);
      }
    }

    res.redirect(`/?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}`);
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
}
