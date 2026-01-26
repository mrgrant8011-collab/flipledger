/**
 * eBay Token Helper
 * 
 * Handles automatic token refresh to keep users connected.
 * Access tokens expire after 2 hours, refresh tokens last 18 months.
 */

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'flipledger_ebay_token',
  REFRESH_TOKEN: 'flipledger_ebay_refresh',
  TOKEN_EXPIRY: 'flipledger_ebay_token_expiry'
};

// Buffer time - refresh 5 minutes before actual expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Store eBay tokens after successful OAuth
 */
export function storeEbayTokens(accessToken, refreshToken, expiresIn) {
  const expiryTime = Date.now() + (expiresIn * 1000);
  
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken || '');
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  
  console.log('[eBay:Token] Stored tokens, expires at:', new Date(expiryTime).toLocaleString());
  
  return { accessToken, refreshToken, expiryTime };
}

/**
 * Get a valid eBay access token, auto-refreshing if needed
 */
export async function getValidEbayToken(onTokenRefresh) {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  const tokenExpiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
  
  // No token stored
  if (!accessToken) {
    console.log('[eBay:Token] No access token found');
    return null;
  }
  
  // Check if token is still valid (with buffer)
  const expiryTime = parseInt(tokenExpiry) || 0;
  const needsRefresh = Date.now() > (expiryTime - REFRESH_BUFFER_MS);
  
  if (!needsRefresh) {
    // Token is still valid
    const minutesLeft = Math.round((expiryTime - Date.now()) / 60000);
    console.log('[eBay:Token] Token valid for ' + minutesLeft + ' more minutes');
    return accessToken;
  }
  
  // Token expired or expiring soon - try to refresh
  console.log('[eBay:Token] Token expired or expiring soon, attempting refresh...');
  
  if (!refreshToken) {
    console.log('[eBay:Token] No refresh token available, user needs to reconnect');
    clearEbayTokens();
    return null;
  }
  
  try {
    const response = await fetch('/api/ebay-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    const data = await response.json();
    
    if (data.success && data.access_token) {
      // Store new tokens
      storeEbayTokens(
        data.access_token, 
        data.refresh_token || refreshToken, 
        data.expires_in || 7200
      );
      
      // Notify callback if provided
      if (onTokenRefresh) {
        onTokenRefresh(data.access_token);
      }
      
      console.log('[eBay:Token] Token refreshed successfully');
      return data.access_token;
    }
    
    // Refresh failed - check if reconnect needed
    if (data.needsReconnect) {
      console.log('[eBay:Token] Refresh token expired, user needs to reconnect');
      clearEbayTokens();
      return null;
    }
    
    console.error('[eBay:Token] Refresh failed:', data.error);
    return null;
    
  } catch (err) {
    console.error('[eBay:Token] Refresh error:', err);
    return null;
  }
}

/**
 * Clear all eBay tokens (disconnect)
 */
export function clearEbayTokens() {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  console.log('[eBay:Token] Tokens cleared');
}
