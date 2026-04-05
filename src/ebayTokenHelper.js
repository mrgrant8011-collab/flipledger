/**
 * eBay Token Helper
 * 
 * Handles automatic token refresh to keep users connected.
 * Access tokens expire after 2 hours, refresh tokens last 18 months.
 */

// Fetch with timeout to prevent hanging on dead endpoints
function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

const STORAGE_KEYS = (userId) => ({
  ACCESS_TOKEN: `flipledger_ebay_token_${userId}`,
  REFRESH_TOKEN: `flipledger_ebay_refresh_${userId}`,
  TOKEN_EXPIRY: `flipledger_ebay_expiry_${userId}`
});

// Buffer time - refresh 5 minutes before actual expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Store eBay tokens after successful OAuth
 */
export function storeEbayTokens(accessToken, refreshToken, expiresIn, userId) {
  if (!userId) return;
  const keys = STORAGE_KEYS(userId);
  const expiryTime = Date.now() + (expiresIn * 1000);
  
  localStorage.setItem(keys.ACCESS_TOKEN, accessToken);
  localStorage.setItem(keys.REFRESH_TOKEN, refreshToken || '');
  localStorage.setItem(keys.TOKEN_EXPIRY, expiryTime.toString());
  
  console.log('[eBay:Token] Stored tokens, expires at:', new Date(expiryTime).toLocaleString());
  
  return { accessToken, refreshToken, expiryTime };
}

/**
 * Get a valid eBay access token, auto-refreshing if needed
 */
export async function getValidEbayToken(onTokenRefresh, userId) {
  if (!userId) return null;
  const keys = STORAGE_KEYS(userId);
  const accessToken = localStorage.getItem(keys.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(keys.REFRESH_TOKEN);
  const tokenExpiry = localStorage.getItem(keys.TOKEN_EXPIRY);
  
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
    clearEbayTokens(userId);
    return null;
  }
  
  try {
   const response = await fetchWithTimeout('/api/ebay-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }, 10000);
    
    const data = await response.json();
    
    if (data.access_token) {
      // Store new tokens
      storeEbayTokens(
        data.access_token, 
        data.refresh_token || refreshToken, 
        data.expires_in || 7200,
        userId
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
      clearEbayTokens(userId);
      return null;
    }
    
    // Refresh failed but not permanent — return cached token
    // If it's truly expired, API calls will fail and user sees clear error
    console.error('[eBay:Token] Refresh failed:', data.error);
    return accessToken;
    
  } catch (err) {
    // Network error, timeout, server down — use cached token
    console.error('[eBay:Token] Refresh error:', err.message);
    return accessToken;
  }
  }

/**
 * Clear all eBay tokens (disconnect)
 */
export function clearEbayTokens(userId) {
  const keys = STORAGE_KEYS(userId);
  localStorage.removeItem(keys.ACCESS_TOKEN);
  localStorage.removeItem(keys.REFRESH_TOKEN);
  localStorage.removeItem(keys.TOKEN_EXPIRY);
  console.log('[eBay:Token] Tokens cleared');
}
