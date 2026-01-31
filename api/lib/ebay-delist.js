const EBAY_API_BASE = 'https://api.ebay.com';

function buildHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Content-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };
}

export async function getActiveEbayListings(accessToken) {
  const headers = buildHeaders(accessToken);
  
  try {
    const invUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=100`;
    const invRes = await fetch(invUrl, { method: 'GET', headers });
    
    if (!invRes.ok) {
      const errText = await invRes.text();
      return { success: false, error: `eBay API error: ${invRes.status}`, listings: [] };
    }
    
    const invData = await invRes.json();
    const inventoryItems = invData.inventoryItems || [];
    
    const validSkus = inventoryItems
      .map(item => item.sku)
      .filter(sku => sku && /^[A-Za-z0-9]+$/.test(sku));
    
    const allOffers = [];
    for (const sku of validSkus) {
      try {
        const offerUrl = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
        const offerRes = await fetch(offerUrl, { method: 'GET', headers });
        
        if (offerRes.ok) {
          const offerData = await offerRes.json();
          if (offerData.offers && offerData.offers.length > 0) {
            for (const offer of offerData.offers) {
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
        console.error(`Error fetching offers for SKU ${sku}:`, e.message);
      }
    }

    return { success: true, listings: allOffers };
  } catch (err) {
    return { success: false, error: err.message, listings: [] };
  }
}

export async function delistEbayOffer(accessToken, offerId) {
  const headers = buildHeaders(accessToken);
  
  try {
    const withdrawRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
      { method: 'POST', headers }
    );
    
    if (withdrawRes.ok || withdrawRes.status === 204) {
      return { success: true };
    }
    
    const errText = await withdrawRes.text();
    
    if (withdrawRes.status === 404 || errText.includes('not found')) {
      return { success: true, alreadyRemoved: true };
    }
    
    if (errText.includes('cannot be withdrawn') || errText.includes('not published')) {
      return { success: true, notPublished: true };
    }
    
    return { success: false, error: `Withdraw failed: ${withdrawRes.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteEbayOffer(accessToken, offerId) {
  const headers = buildHeaders(accessToken);
  
  try {
    const withdrawResult = await delistEbayOffer(accessToken, offerId);
    if (!withdrawResult.success && !withdrawResult.alreadyRemoved) {
      return withdrawResult;
    }
    
    const deleteRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`,
      { method: 'DELETE', headers }
    );
    
    if (deleteRes.ok || deleteRes.status === 204 || deleteRes.status === 404) {
      return { success: true };
    }
    
    return { success: false, error: `Delete failed: ${deleteRes.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// QTY SUPPORT: Reduce eBay listing quantity instead of deleting
// ═══════════════════════════════════════════════════════════════════════
export async function reduceEbayQuantity(accessToken, sku, newQuantity) {
  const headers = buildHeaders(accessToken);
  
  try {
    // Get current inventory item
    const getUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    const getRes = await fetch(getUrl, { method: 'GET', headers });
    
    if (!getRes.ok) {
      return { success: false, error: `Failed to get inventory item: ${getRes.status}` };
    }
    
    const inventoryItem = await getRes.json();
    
    // Update the quantity
    inventoryItem.availability = inventoryItem.availability || {};
    inventoryItem.availability.shipToLocationAvailability = inventoryItem.availability.shipToLocationAvailability || {};
    inventoryItem.availability.shipToLocationAvailability.quantity = newQuantity;
    
    // Put back the updated inventory item
    const putRes = await fetch(getUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(inventoryItem)
    });
    
    if (putRes.ok || putRes.status === 204) {
      return { success: true, newQuantity };
    }
    
    const errText = await putRes.text();
    return { success: false, error: `Failed to update quantity: ${putRes.status} - ${errText}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
