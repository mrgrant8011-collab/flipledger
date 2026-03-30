const EBAY_API_BASE = 'https://api.ebay.com';

function buildHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en-US',
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
export async function reduceEbayQuantity(accessToken, sku, newQuantity, offerId) {
  const headers = buildHeaders(accessToken);
  
  try {
    if (!offerId) {
      return { success: false, error: 'offerId is required to update live listing quantity' };
    }

    // Fetch current offer to get price (required by bulkUpdatePriceQuantity)
    const offerRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`,
      { method: 'GET', headers }
    );

   if (!offerRes.ok) {
      const errText = await offerRes.text();
      console.error(`[eBay:Delist] GET offer ${offerId} failed: ${offerRes.status} - ${errText}`);
      if (offerRes.status === 404 || offerRes.status === 410) {
        return { success: false, alreadyRemoved: true, notFound: true };
      }
      return { success: false, error: `Failed to fetch offer ${offerId}: ${offerRes.status} - ${errText}` };
    }

    const offerData = await offerRes.json();
    const currentPrice = offerData.pricingSummary?.price?.value;
    const currency = offerData.pricingSummary?.price?.currency || 'USD';

    if (!currentPrice) {
      return { success: false, error: 'Could not determine current price for offer' };
    }

    // Use eBay's own SKU from the offer (source of truth)
    const ebaySku = offerData.sku || sku;
    if (!ebaySku) {
      return { success: false, error: `Offer ${offerId} returned no SKU` };
    }

    // Detect real live quantity from eBay (check multiple possible fields)
    const liveQty = offerData.availableQuantity 
      ?? offerData.listing?.availableQuantity 
      ?? offerData.listing?.quantity 
      ?? null;

    if (liveQty === null) {
      return { success: false, error: `Could not determine live eBay quantity for offer ${offerId}` };
    }

    // Calculate new quantity (reduce by 1 from live)
    newQuantity = liveQty - 1;
    console.log(`[eBay:Delist] Offer ${offerId}: liveQty=${liveQty} reducing to ${newQuantity}`);

    // If qty would hit 0, withdraw instead of reducing
    if (newQuantity <= 0) {
      console.log(`[eBay:Delist] Qty would be 0 — withdrawing offer ${offerId}`);
      const withdrawRes = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
        { method: 'POST', headers }
      );
      if (withdrawRes.ok || withdrawRes.status === 204) {
        return { success: true, newQuantity: 0, withdrawn: true };
      }
      const wErr = await withdrawRes.text();
      return { success: false, error: `Withdraw failed: ${withdrawRes.status} - ${wErr}` };
    }

    // Build the request for bulkUpdatePriceQuantity
    // This updates BOTH the inventory record AND the live eBay listing
    const requestBody = {
      requests: [{
        sku: ebaySku,
        
        shipToLocationAvailability: {
          quantity: newQuantity
        },
        offers: [{
          offerId: offerId,
          availableQuantity: newQuantity,
          price: {
            value: currentPrice,
            currency: currency
          }
        }]
      }]
    };

    const res = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/bulk_update_price_quantity`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      }
    );

  if (!res.ok) {
      const errText = await res.text();
      console.error(`[eBay:Delist] bulkUpdate HTTP failed: ${res.status} - ${errText}`);
      return { success: false, error: `bulkUpdatePriceQuantity failed: ${res.status} - ${errText}`, liveQty };
    }

    const data = await res.json();
    console.log(`[eBay:Delist] bulkUpdate response: ${JSON.stringify(data)}`);
    const responses = data.responses || [];
    const result = responses[0] || {};

    if (result.statusCode === 200) {
      console.log(`[eBay:Delist] ✓ Reduced quantity for ${sku} to ${newQuantity} (offer ${offerId})`);
      return { success: true, newQuantity, liveQty };
    }

    const errorMsg = result.errors?.[0]?.message || `statusCode ${result.statusCode}`;
    console.error(`[eBay:Delist] bulkUpdate item error: ${JSON.stringify(result)}`);
    return { success: false, error: `Quantity update failed: ${errorMsg}`, liveQty };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
