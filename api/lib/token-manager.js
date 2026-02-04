/**
 * TOKEN MANAGER
 * ==============
 * Handles server-side token storage and refresh for 24/7 cron operations.
 * Tokens are stored in Supabase user_tokens table.
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cgwwzithkdtunrpwctvb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get valid token for a user/platform, refreshing if needed
 * @param {string} userId - User's UUID
 * @param {string} platform - 'ebay' or 'stockx'
 * @returns {object} { success, accessToken, error }
 */
export async function getValidToken(userId, platform) {
  try {
    // Fetch token from database
    const { data: tokenData, error: fetchError } = await supabaseAdmin
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (fetchError || !tokenData) {
      return { success: false, error: `No ${platform} token found for user` };
    }

    // Check if token is expired (with 5 min buffer)
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (expiresAt.getTime() - bufferMs > now.getTime()) {
      // Token still valid
      return { success: true, accessToken: tokenData.access_token };
    }

    // Token expired or expiring soon - refresh it
    console.log(`[TokenManager] ${platform} token expired for user ${userId}, refreshing...`);

    if (platform === 'ebay') {
      return await refreshEbayToken(userId, tokenData.refresh_token);
    } else if (platform === 'stockx') {
      return await refreshStockXToken(userId, tokenData.refresh_token);
    }

    return { success: false, error: `Unknown platform: ${platform}` };
  } catch (err) {
    console.error(`[TokenManager] Error getting ${platform} token:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Refresh eBay token using refresh_token
 */
async function refreshEbayToken(userId, refreshToken) {
  if (!refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory'
  ].join(' ');

  try {
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: scopes
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('[TokenManager] eBay refresh failed:', data);
      return { success: false, error: data.error_description || data.error };
    }

    // Update token in database
    const expiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000);
    
    const { error: updateError } = await supabaseAdmin
      .from('user_tokens')
      .update({
        access_token: data.access_token,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'ebay');

    if (updateError) {
      console.error('[TokenManager] Failed to update eBay token:', updateError);
    }

    console.log('[TokenManager] eBay token refreshed successfully');
    return { success: true, accessToken: data.access_token };
  } catch (err) {
    console.error('[TokenManager] eBay refresh error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Refresh StockX token using refresh_token
 */
async function refreshStockXToken(userId, refreshToken) {
  if (!refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    const response = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.STOCKX_CLIENT_ID,
        client_secret: process.env.STOCKX_CLIENT_SECRET,
        refresh_token: refreshToken
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('[TokenManager] StockX refresh failed:', data);
      return { success: false, error: data.error_description || data.error };
    }

    // Update token in database
    const expiresAt = new Date(Date.now() + (data.expires_in || 86400) * 1000);
    
    const { error: updateError } = await supabaseAdmin
      .from('user_tokens')
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'stockx');

    if (updateError) {
      console.error('[TokenManager] Failed to update StockX token:', updateError);
    }

    console.log('[TokenManager] StockX token refreshed successfully');
    return { success: true, accessToken: data.access_token };
  } catch (err) {
    console.error('[TokenManager] StockX refresh error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Store tokens for a user (called after OAuth)
 * @param {string} userId - User's UUID
 * @param {string} platform - 'ebay' or 'stockx'
 * @param {object} tokens - { access_token, refresh_token, expires_in }
 */
export async function storeTokens(userId, platform, tokens) {
  try {
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 7200) * 1000);

    const { error } = await supabaseAdmin
      .from('user_tokens')
      .upsert({
        user_id: userId,
        platform: platform,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    if (error) {
      console.error(`[TokenManager] Failed to store ${platform} tokens:`, error);
      return { success: false, error: error.message };
    }

    console.log(`[TokenManager] ${platform} tokens stored for user ${userId}`);
    return { success: true };
  } catch (err) {
    console.error(`[TokenManager] Error storing ${platform} tokens:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Get all users who have tokens stored
 * @returns {array} List of user_ids with at least one platform token
 */
export async function getUsersWithTokens() {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_tokens')
      .select('user_id, platform')
      .order('user_id').range(0, 999999);

    if (error) {
      console.error('[TokenManager] Failed to get users with tokens:', error);
      return [];
    }

    // Group by user_id
    const userMap = new Map();
    for (const row of data) {
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, []);
      }
      userMap.get(row.user_id).push(row.platform);
    }

    // Return array of { userId, platforms }
    return Array.from(userMap.entries()).map(([userId, platforms]) => ({
      userId,
      platforms
    }));
  } catch (err) {
    console.error('[TokenManager] Error getting users:', err);
    return [];
  }
}

export { supabaseAdmin };
