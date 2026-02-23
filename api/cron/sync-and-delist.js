import { getValidToken, getUsersWithTokens, supabaseAdmin } from '../lib/token-manager.js';
import { processDelistForSale, getUnprocessedSales, acquireLock, releaseLock } from '../lib/delist-processor.js';
import { delistEbayOffer } from '../lib/ebay-delist.js';
function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://flipledger.vercel.app';
}

function verifyCronSecret(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

async function fetchStockXListings(accessToken) {
  try {
    const url = `${getBaseUrl()}/api/stockx-listings?skipMarketData=true`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.listings || [];
  } catch (err) {
    console.error('[Cron] StockX listings fetch error:', err.message);
    return [];
  }
}

async function fetchEbayListings(accessToken) {
  try {
    const url = `${getBaseUrl()}/api/ebay-listings`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.offers || data.listings || [];
  } catch (err) {
    console.error('[Cron] eBay listings fetch error:', err.message);
    return [];
  }
}
async function processUser(userId, platforms) {
  const result = { userId, locked: false, stockxListings: 0, activeMappings: 0, delisted: 0, failed: 0 };

  const lockAcquired = await acquireLock(userId);
  if (!lockAcquired) { result.locked = true; return result; }

  try {
    const tokens = { ebayToken: null, stockxToken: null };

    if (platforms.includes('ebay')) {
      const r = await getValidToken(userId, 'ebay');
      if (r.success) tokens.ebayToken = r.accessToken;
    }
    if (platforms.includes('stockx')) {
      const r = await getValidToken(userId, 'stockx');
      if (r.success) tokens.stockxToken = r.accessToken;
    }

    if (!tokens.ebayToken || !tokens.stockxToken) return result;

    const sxListings = await fetchStockXListings(tokens.stockxToken);
    result.stockxListings = sxListings.length;

    // SAFEGUARD: Skip if StockX returned 0 (possible API failure)
    if (sxListings.length === 0) {
      console.log('[Cron] Skipping — StockX returned 0 listings (possible sync failure)');
      return result;
    }

    const { data: activeMappings } = await supabaseAdmin
      .from('cross_list_links')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (!activeMappings || activeMappings.length === 0) return result;
    result.activeMappings = activeMappings.length;

    const sxListingIds = new Set(sxListings.map(s => s.listingId));

    for (const mapping of activeMappings) {
      if (mapping.stockx_listing_id && !sxListingIds.has(mapping.stockx_listing_id) && mapping.ebay_offer_id) {
        try {
          const delistResult = await delistEbayOffer(tokens.ebayToken, mapping.ebay_offer_id);

          if (delistResult.success || delistResult.alreadyRemoved) {
            await supabaseAdmin.from('cross_list_links').update({
              status: 'sold', sold_on: 'stockx', sold_at: new Date().toISOString(), updated_at: new Date().toISOString()
            }).eq('id', mapping.id);

            await supabaseAdmin.from('delist_log').insert({
              user_id: userId, sold_on: 'stockx', delisted_from: 'ebay',
              item_sku: mapping.sku, item_size: mapping.size,
              listing_id_delisted: mapping.ebay_offer_id,
              cross_list_link_id: mapping.id, status: 'success'
            });

            result.delisted++;
            console.log(`[Cron] Delisted from eBay: ${mapping.sku} size ${mapping.size}`);
          } else {
            result.failed++;
          }
        } catch (err) {
          result.failed++;
          console.error('[Cron] eBay delist failed:', err.message);
        }
      }
    }
  } finally {
    await releaseLock(userId);
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const users = await getUsersWithTokens();
    if (users.length === 0) {
      return res.status(200).json({ success: true, message: 'No users with tokens', timestamp: new Date().toISOString() });
    }
    
    const results = [];
    for (const user of users) {
      try {
        const result = await processUser(user.userId, user.platforms);
        results.push(result);
      } catch (err) {
        results.push({ userId: user.userId, error: err.message });
      }
    }
    
   return res.status(200).json({ success: true, timestamp: new Date().toISOString(), results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
}
