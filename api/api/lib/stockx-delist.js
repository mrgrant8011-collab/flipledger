/**
 * STOCKX DELIST SERVICE
 * ======================
 * Handles fetching active StockX listings and delisting items.
 * Used by the auto-delist cron job.
 */

/**
 * Fetch all active StockX listings for a user
 * @param {string} accessToken - StockX access token
 * @returns {object} { success, listings, error }
 */
export async function getActiveStockXListings(accessToken) {
  const apiKey = process.env.STOCKX_API_KEY;
  
  try {
    console.log('[StockX:Delist] Fetching active listings...');
    
    let allListings = [];
    let pageNumber = 1;
    
    while (true) {
      const url = `https://api.stockx.com/v2/selling/listings?pageNumber=${pageNumber}&pageSize=100&listingStatuses=ACTIVE`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[StockX:Delist] API error ${response.status}:`, errText.substring(0, 200));
        
        if (pageNumber === 1) {
          return { success: false, error: `StockX API error: ${response.status}`, listings: [] };
        }
        break;
      }
      
      const data = await response.json();
      const listings = data.listings || [];
      
      if (listings.length === 0) break;
      
      // Transform to simplified format
      for (const listing of listings) {
        allListings.push({
          listingId: listing.listingId,
          productId: listing.product?.productId,
          variantId: listing.variant?.variantId,
          sku: listing.product?.styleId || '',
          size: listing.variant?.variantValue || '',
          name: listing.product?.productName || '',
          price: parseFloat(listing.amount) || 0,
          inventoryType: listing.inventoryType || 'STANDARD',
          status: listing.status
        });
      }
      
      if (!data.hasNextPage) break;
      pageNumber++;
      
      // Safety limit
      if (pageNumber > 20) break;
    }

    console.log(`[StockX:Delist] Found ${allListings.length} active listings`);
    return { success: true, listings: allListings };
    
  } catch (err) {
    console.error('[StockX:Delist] Error fetching listings:', err);
    return { success: false, error: err.message, listings: [] };
  }
}

/**
 * Delist/delete a StockX listing by listing ID
 * @param {string} accessToken - StockX access token
 * @param {string} listingId - StockX listing ID to delete
 * @returns {object} { success, error }
 */
export async function delistStockXListing(accessToken, listingId) {
  const apiKey = process.env.STOCKX_API_KEY;
  
  try {
    console.log(`[StockX:Delist] Deleting listing: ${listingId}`);
    
    const response = await fetch(
      `https://api.stockx.com/v2/selling/listings/${listingId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey
        }
      }
    );
    
    if (response.ok || response.status === 200 || response.status === 204) {
      console.log(`[StockX:Delist] ✓ Listing ${listingId} deleted successfully`);
      return { success: true };
    }
    
    // Check if already deleted/not found
    if (response.status === 404) {
      console.log(`[StockX:Delist] Listing ${listingId} not found (already removed)`);
      return { success: true, alreadyRemoved: true };
    }
    
    const errText = await response.text();
    console.error(`[StockX:Delist] Failed to delete ${listingId}:`, errText.substring(0, 200));
    return { success: false, error: `Delete failed: ${response.status}` };
    
  } catch (err) {
    console.error(`[StockX:Delist] Error deleting listing ${listingId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Batch delist multiple StockX listings
 * @param {string} accessToken - StockX access token
 * @param {array} listingIds - Array of listing IDs to delete
 * @returns {object} { success, deleted, failed, errors }
 */
export async function batchDelistStockX(accessToken, listingIds) {
  const results = { deleted: 0, failed: 0, errors: [] };
  
  for (const listingId of listingIds) {
    const result = await delistStockXListing(accessToken, listingId);
    
    if (result.success) {
      results.deleted++;
    } else {
      results.failed++;
      results.errors.push({ listingId, error: result.error });
    }
  }
  
  return {
    success: results.deleted > 0 || results.failed === 0,
    ...results
  };
}
