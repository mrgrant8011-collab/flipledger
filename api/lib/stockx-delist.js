export async function getActiveStockXListings(accessToken) {
  const apiKey = process.env.STOCKX_API_KEY;
  
  try {
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
        if (pageNumber === 1) {
          return { success: false, error: `StockX API error: ${response.status}`, listings: [] };
        }
        break;
      }
      
      const data = await response.json();
      const listings = data.listings || [];
      
      if (listings.length === 0) break;
      
      for (const listing of listings) {
        allListings.push({
          listingId: listing.listingId,
          productId: listing.product?.productId,
          variantId: listing.variant?.variantId,
          sku: listing.product?.styleId || '',
          size: listing.variant?.variantValue || '',
          name: listing.product?.productName || '',
          price: parseFloat(listing.amount) || 0,
          status: listing.status
        });
      }
      
      if (!data.hasNextPage) break;
      pageNumber++;
      if (pageNumber > 20) break;
    }

    return { success: true, listings: allListings };
  } catch (err) {
    return { success: false, error: err.message, listings: [] };
  }
}

export async function delistStockXListing(accessToken, listingId) {
  const apiKey = process.env.STOCKX_API_KEY;
  
  try {
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
      return { success: true };
    }
    
    if (response.status === 404) {
      return { success: true, alreadyRemoved: true };
    }
    
    return { success: false, error: `Delete failed: ${response.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

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
  
  return { success: results.deleted > 0 || results.failed === 0, ...results };
}
