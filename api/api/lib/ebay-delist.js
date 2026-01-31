/**
 * EBAY DELIST SERVICE
 * ====================
 * Handles fetching active eBay listings and delisting items.
 * Used by the auto-delist cron job.
 */

const EBAY_API_BASE = 'https://api.ebay.com';

/**
 * Build headers for eBay API calls
 */
function buildHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Content-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };
}

/**
 * Fetch all active eBay listings for a user
 * @param {string} accessToken - eBay access token
 * @returns {object} { success, listings, error }
 */
export async function getActiveEbayListings(accessToken) {
  const headers = buildHeaders(accessToken);
  
  try {
    console.log('[eBay:Delist] Fetching inventory items...');
    
    // Step 1: Get inventory items
    const invUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=100`;
    const invRes = await fetch(invUrl, { method: 'GET', headers });
    
    if (!invRes.ok) {
      const errText = await invRes.text();
      console.error(`[eBay:Delist] Inventory fetch failed ${invRes.status}:`, errText.substring(0, 200));
      return { success: false, error: `eBay API error: ${invRes.status}`, listings: [] };
    }
    
    const invData = await invRes.json();
    const inventoryItems = invData.inventoryItems || [];
    console.log(`[eBay:Delist] Found ${inventoryItems.length} inventory items`);
    
    // Step 2: Filter to valid SKUs only
    const validSkus = inventoryItems
      .map(item => item.sku)
      .filter(sku => sku && /^[A-Za-z0-9]+$/.test(sku));
    
    // Step 3: Fetch offers for each valid SKU
    const allOffers = [];
    for (const sku of validSkus) {
      try {
        const offerUrl = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
        const offerRes = await fetch(offerUrl, { method: 'GET', headers });
        
        if (offerRes.ok) {
          const offerData = await offerRes.json();
          if (offerData.offers && offerData.offers.length > 0) {
            for (const offer of offerData.offers) {
              // Only include PUBLISHED offers (active listings)
              if (offer.status === 'PUBLISHED') {
                allOffers.push({
                  offerId: offer.offerId,
                  sku: offer.sku,
                  status: offer.status,
                  price: offer.pricingSummary?.price?.value,
                  listingId: offer.listing?.listingId
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`[eBay:Delist] Error fetching offers for SKU ${sku}:`, e.message);
      }
    }

    console.log(`[eBay:Delist] Found ${allOffers.length} active offers`);
    return { success: true, listings: allOffers };
    
  } catch (err) {
    console.error('[eBay:Delist] Error fetching listings:', err);
    return { success: false, error: err.message, listings: [] };
  }
}

/**
 * Delist/withdraw an eBay listing by offer ID
 * @param {string} accessToken - eBay access token
 * @param {string} offerId - eBay offer ID to delist
 * @returns {object} { success, error }
 */
export async function delistEbayOffer(accessToken, offerId) {
  const headers = buildHeaders(accessToken);
  
  try {
    console.log(`[eBay:Delist] Withdrawing offer: ${offerId}`);
    
    // Step 1: Withdraw the offer (unpublishes the listing)
    const withdrawRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
      { method: 'POST', headers }
    );
    
    if (withdrawRes.ok || withdrawRes.status === 204) {
      console.log(`[eBay:Delist] ✓ Offer ${offerId} withdrawn successfully`);
      return { success: true };
    }
    
    // Check if already withdrawn/not found
    const errText = await withdrawRes.text();
    
    if (withdrawRes.status === 404 || errText.includes('not found')) {
      console.log(`[eBay:Delist] Offer ${offerId} not found (already removed)`);
      return { success: true, alreadyRemoved: true };
    }
    
    // Check if offer is in a state that can't be withdrawn (draft, etc)
    if (errText.includes('cannot be withdrawn') || errText.includes('not published')) {
      console.log(`[eBay:Delist] Offer ${offerId} cannot be withdrawn (not published)`);
      return { success: true, notPublished: true };
    }
    
    console.error(`[eBay:Delist] Failed to withdraw ${offerId}:`, errText.substring(0, 200));
    return { success: false, error: `Withdraw failed: ${withdrawRes.status}` };
    
  } catch (err) {
    console.error(`[eBay:Delist] Error withdrawing offer ${offerId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete an eBay offer completely (after withdrawing)
 * @param {string} accessToken - eBay access token
 * @param {string} offerId - eBay offer ID to delete
 * @returns {object} { success, error }
 */
export async function deleteEbayOffer(accessToken, offerId) {
  const headers = buildHeaders(accessToken);
  
  try {
    // First withdraw, then delete
    const withdrawResult = await delistEbayOffer(accessToken, offerId);
    
    if (!withdrawResult.success && !withdrawResult.alreadyRemoved) {
      return withdrawResult;
    }
    
    // Now delete the offer
    console.log(`[eBay:Delist] Deleting offer: ${offerId}`);
    
    const deleteRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`,
      { method: 'DELETE', headers }
    );
    
    if (deleteRes.ok || deleteRes.status === 204 || deleteRes.status === 404) {
      console.log(`[eBay:Delist] ✓ Offer ${offerId} deleted successfully`);
      return { success: true };
    }
    
    const errText = await deleteRes.text();
    console.error(`[eBay:Delist] Failed to delete ${offerId}:`, errText.substring(0, 200));
    return { success: false, error: `Delete failed: ${deleteRes.status}` };
    
  } catch (err) {
    console.error(`[eBay:Delist] Error deleting offer ${offerId}:`, err);
    return { success: false, error: err.message };
  }
}
