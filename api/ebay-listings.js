/**
 * EBAY LISTINGS API
 * =================
 * GET - Fetch all active listings (inventory items + offers)
 * POST - Create new listings (cross-list from StockX/inventory)
 * PATCH - Bulk update price/quantity
 * DELETE - End/withdraw listings (body: { offerIds: [...] })
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  
  // ============================================
  // FIX: Explicit headers for ALL eBay API calls
  // DO NOT forward browser headers - eBay rejects them
  // This fixes errorId 25709 (Unsupported Accept-Language)
  // ============================================
  const baseHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };

  // ============================================
  // GET - Fetch all active listings
  // ============================================
  if (req.method === 'GET') {
    try {
      let allItems = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      
      while (hasMore && offset < 1000) {
        const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
        const response = await fetch(url, { headers: baseHeaders });
        
        if (!response.ok) {
          const err = await response.text();
          console.error('[eBay GET] Inventory fetch error:', response.status, err);
          if (offset === 0) {
            return res.status(response.status).json({ error: 'Failed to fetch inventory', details: err });
          }
          break;
        }
        
        const data = await response.json();
        const items = data.inventoryItems || [];
        allItems = allItems.concat(items);
        
        if (items.length < limit || !data.next) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
      
      console.log(`[eBay Listings] Fetched ${allItems.length} inventory items`);
      
      const listings = [];
      
      for (let i = 0; i < allItems.length; i += 10) {
        const batch = allItems.slice(i, i + 10);
        
        await Promise.all(batch.map(async (item) => {
          try {
            const sku = item.sku;
            const offersUrl = `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=EBAY_US`;
            const offersRes = await fetch(offersUrl, { headers: baseHeaders });
            
            if (offersRes.ok) {
              const offersData = await offersRes.json();
              const offers = offersData.offers || [];
              const publishedOffers = offers.filter(o => o.status === 'PUBLISHED');
              
              for (const offer of publishedOffers) {
                const aspects = item.product?.aspects || {};
                const size = aspects['US Shoe Size']?.[0] || aspects['Size']?.[0] || aspects['US Size']?.[0] || '';
                
                listings.push({
                  sku: item.sku,
                  offerId: offer.offerId,
                  listingId: offer.listing?.listingId || null,
                  title: item.product?.title || offer.listing?.listingTitle || 'eBay Item',
                  mpn: item.product?.mpn || '',
                  brand: item.product?.brand || '',
                  size,
                  image: item.product?.imageUrls?.[0] || '',
                  price: parseFloat(offer.pricingSummary?.price?.value) || 0,
                  currency: offer.pricingSummary?.price?.currency || 'USD',
                  quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
                  status: offer.status,
                  format: offer.format || 'FIXED_PRICE',
                  categoryId: offer.categoryId,
                  listingStartDate: offer.listing?.listingStartDate || null
                });
              }
            }
          } catch (e) {
            console.log(`[eBay] Error fetching offers for ${item.sku}:`, e.message);
          }
        }));
      }
      
      console.log(`[eBay Listings] Found ${listings.length} active listings`);
      
      return res.status(200).json({ success: true, listings, total: listings.length });
      
    } catch (error) {
      console.error('[eBay Listings] Error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch listings', message: error.message });
    }
  }

  // ============================================
  // POST - Create new listings (cross-list)
  // Returns: { success, created, failed, errors, createdOffers }
  // ============================================
  if (req.method === 'POST') {
    try {
      const { products } = req.body;
      
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'products array is required' });
      }
      
      // Get business policies from env vars ONLY (with trim to handle whitespace)
      const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID?.trim();
      const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID?.trim();
      const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID?.trim();
      
      console.log('[eBay] Policy IDs from env:', { fulfillmentPolicyId, paymentPolicyId, returnPolicyId });
      
      if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
        return res.status(400).json({ 
          error: 'Missing policy env vars', 
          message: 'Set EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID in Vercel',
          missing: {
            EBAY_FULFILLMENT_POLICY_ID: !fulfillmentPolicyId,
            EBAY_PAYMENT_POLICY_ID: !paymentPolicyId,
            EBAY_RETURN_POLICY_ID: !returnPolicyId
          }
        });
      }
      
      // ============================================
      // FIX for error 25002: Ensure merchant location exists
      // ============================================
      const merchantLocationKey = await ensureMerchantLocation(baseHeaders);
      console.log('[eBay] Using merchant location:', merchantLocationKey);
      
      const results = { created: 0, failed: 0, errors: [], createdOffers: [] };
      
      for (const product of products) {
        for (const sizeData of (product.sizes || [])) {
          try {
            const ebaySku = `${product.sku}-${sizeData.size}`;
            const price = Math.ceil((sizeData.price || product.price || 100) * 1.10);
            
            // Create Inventory Item
            const inventoryItem = {
              availability: {
                shipToLocationAvailability: { quantity: sizeData.qty || 1 }
              },
              condition: 'NEW',
              product: {
                title: `${product.name} Size ${sizeData.size}`,
                brand: product.brand || 'Nike',
                mpn: product.sku,
                aspects: {
                  'Brand': [product.brand || 'Nike'],
                  'US Shoe Size': [String(sizeData.size)],
                  'Style': [product.sku],
                  'Type': ['Athletic'],
                  'Department': ['Men']
                },
                imageUrls: product.image ? [product.image] : []
              }
            };
            
            // FIX: Use baseHeaders (includes Accept-Language: en-US)
            const invRes = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(ebaySku)}`, {
              method: 'PUT',
              headers: baseHeaders,
              body: JSON.stringify(inventoryItem)
            });
            
            if (!invRes.ok && invRes.status !== 204) {
              const err = await invRes.text();
              console.error('[eBay] Inventory item error:', invRes.status, err);
              results.errors.push({ sku: ebaySku, step: 'inventory', error: parseEbayError(err) });
              results.failed++;
              continue;
            }
            
            console.log('[eBay] Inventory item created:', ebaySku);
            
            // Create Offer
            const offer = {
              sku: ebaySku,
              marketplaceId: 'EBAY_US',
              format: 'FIXED_PRICE',
              listingDescription: `Brand new ${product.name} in size ${sizeData.size}. 100% Authentic.`,
              availableQuantity: sizeData.qty || 1,
              categoryId: '15709',
              pricingSummary: { price: { value: String(price), currency: 'USD' } },
              listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
              merchantLocationKey: merchantLocationKey
            };
            
            // FIX: Use baseHeaders (includes Accept-Language: en-US)
            const offerRes = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
              method: 'POST',
              headers: baseHeaders,
              body: JSON.stringify(offer)
            });
            
            if (!offerRes.ok) {
              const err = await offerRes.text();
              console.error('[eBay] Create offer error:', offerRes.status, err);
              results.errors.push({ sku: ebaySku, step: 'offer', error: parseEbayError(err) });
              results.failed++;
              continue;
            }
            
            const offerData = await offerRes.json();
            const offerId = offerData.offerId;
            console.log('[eBay] Offer created:', offerId);
            
            // Publish Offer
            // FIX: Use baseHeaders (includes Accept-Language: en-US)
            const publishRes = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`, {
              method: 'POST',
              headers: baseHeaders
            });
            
            let listingId = null;
            if (publishRes.ok) {
              const publishData = await publishRes.json();
              listingId = publishData.listingId || null;
              console.log('[eBay] Offer published, listingId:', listingId);
            } else {
              const err = await publishRes.text();
              console.error('[eBay] Publish error:', publishRes.status, err);
              results.errors.push({ sku: ebaySku, step: 'publish', error: parseEbayError(err) });
              results.failed++;
              continue;
            }
            
            // Track created offer for mapping
            results.createdOffers.push({
              ebaySku,
              baseSku: product.sku,
              size: sizeData.size,
              offerId,
              listingId,
              stockxListingId: sizeData.stockxListingId || null,
              price
            });
            
            results.created++;
            
          } catch (e) {
            console.error('[eBay] Unexpected error:', e.message);
            results.errors.push({ sku: `${product.sku}-${sizeData.size}`, error: e.message });
            results.failed++;
          }
        }
      }
      
      return res.status(200).json({
        success: results.created > 0,
        created: results.created,
        failed: results.failed,
        errors: results.errors,
        createdOffers: results.createdOffers
      });
      
    } catch (error) {
      console.error('[eBay Listings] Create error:', error.message);
      return res.status(500).json({ error: 'Failed to create listings', message: error.message });
    }
  }

  // ============================================
  // PATCH - Bulk update price/quantity
  // ============================================
  if (req.method === 'PATCH') {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'updates array is required' });
      }
      
      const requests = updates.map(u => ({
        sku: u.sku,
        shipToLocationAvailability: u.quantity !== undefined ? { quantity: u.quantity } : undefined,
        offers: [{
          offerId: u.offerId,
          availableQuantity: u.quantity,
          price: u.price !== undefined ? { value: String(u.price), currency: 'USD' } : undefined
        }]
      }));
      
      // FIX: Use baseHeaders (includes Accept-Language: en-US)
      const bulkRes = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_update_price_quantity', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({ requests })
      });
      
      if (!bulkRes.ok) {
        const err = await bulkRes.text();
        console.error('[eBay] Bulk update error:', bulkRes.status, err);
        return res.status(bulkRes.status).json({ error: 'Bulk update failed', details: parseEbayError(err) });
      }
      
      const bulkData = await bulkRes.json();
      
      return res.status(200).json({
        success: true,
        responses: bulkData.responses,
        updated: bulkData.responses?.filter(r => r.statusCode === 200).length || 0,
        failed: bulkData.responses?.filter(r => r.statusCode !== 200).length || 0
      });
      
    } catch (error) {
      console.error('[eBay Listings] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to update listings', message: error.message });
    }
  }

  // ============================================
  // DELETE - End/withdraw listings
  // Body: { offerIds: [...] }
  // ============================================
  if (req.method === 'DELETE') {
    try {
      const { offerIds } = req.body;
      
      if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
        return res.status(400).json({ error: 'offerIds array is required' });
      }
      
      const results = { ended: 0, failed: 0, errors: [] };
      
      for (const offerId of offerIds) {
        try {
          // FIX: Use baseHeaders (includes Accept-Language: en-US)
          const withdrawRes = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/withdraw`, {
            method: 'POST',
            headers: baseHeaders
          });
          
          if (withdrawRes.ok || withdrawRes.status === 204) {
            results.ended++;
          } else {
            const err = await withdrawRes.text();
            console.error('[eBay] Withdraw error:', withdrawRes.status, err);
            results.errors.push({ offerId, error: parseEbayError(err) });
            results.failed++;
          }
        } catch (e) {
          results.errors.push({ offerId, error: e.message });
          results.failed++;
        }
      }
      
      return res.status(200).json({
        success: results.ended > 0,
        ended: results.ended,
        failed: results.failed,
        errors: results.errors
      });
      
    } catch (error) {
      console.error('[eBay Listings] Delete error:', error.message);
      return res.status(500).json({ error: 'Failed to end listings', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ============================================
// Helper: Ensure merchant location exists (fixes error 25002)
// ============================================
async function ensureMerchantLocation(headers) {
  const LOCATION_KEY = 'flipledger-default';
  
  // First, check if location already exists
  try {
    const checkRes = await fetch(
      `https://api.ebay.com/sell/inventory/v1/location/${LOCATION_KEY}`,
      { method: 'GET', headers }
    );
    
    if (checkRes.ok) {
      console.log('[eBay] Merchant location exists:', LOCATION_KEY);
      return LOCATION_KEY;
    }
  } catch (e) {
    console.log('[eBay] Location check failed, will try to create');
  }
  
  // Location doesn't exist, create it
  // You can customize this address - it's used for "item location" display on eBay
  const locationData = {
    location: {
      address: {
        addressLine1: process.env.EBAY_LOCATION_ADDRESS || '123 Main St',
        city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
        stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
        postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
        country: 'US'
      }
    },
    locationTypes: ['WAREHOUSE'],
    name: 'FlipLedger Warehouse',
    merchantLocationStatus: 'ENABLED'
  };
  
  console.log('[eBay] Creating merchant location:', LOCATION_KEY);
  
  const createRes = await fetch(
    `https://api.ebay.com/sell/inventory/v1/location/${LOCATION_KEY}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(locationData)
    }
  );
  
  if (createRes.ok || createRes.status === 204) {
    console.log('[eBay] Merchant location created successfully');
    return LOCATION_KEY;
  }
  
  // If creation failed, try to get any existing location
  const listRes = await fetch(
    'https://api.ebay.com/sell/inventory/v1/location?limit=1',
    { method: 'GET', headers }
  );
  
  if (listRes.ok) {
    const listData = await listRes.json();
    if (listData.locations && listData.locations.length > 0) {
      const existingKey = listData.locations[0].merchantLocationKey;
      console.log('[eBay] Using existing location:', existingKey);
      return existingKey;
    }
  }
  
  // Last resort - throw error with helpful message
  const errBody = await createRes.text();
  console.error('[eBay] Failed to create/find merchant location:', errBody);
  throw new Error(
    'Could not create merchant location. Please create one manually in eBay Seller Hub ' +
    '(Account Settings → Business Policies → Shipping → Location) or set EBAY_LOCATION_* env vars. ' +
    `eBay error: ${parseEbayError(errBody)}`
  );
}

// ============================================
// Helper: Parse eBay error for readable message
// ============================================
function parseEbayError(errorBody) {
  try {
    const parsed = JSON.parse(errorBody);
    if (parsed.errors && parsed.errors.length > 0) {
      return parsed.errors.map(e => `${e.errorId}: ${e.message}`).join('; ');
    }
    if (parsed.error_description) {
      return parsed.error_description;
    }
    return errorBody;
  } catch {
    return errorBody;
  }
}
