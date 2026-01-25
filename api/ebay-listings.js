/**
 * EBAY LISTINGS API
 * =================
 * GET - Fetch all active listings (inventory items + offers)
 * POST - Create new listings (cross-list from StockX)
 * PATCH - Bulk update price/quantity
 * DELETE - End/withdraw listings
 * 
 * Based on eBay Sell Inventory API v1
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
  const baseHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
  };

  // ============================================
  // GET - Fetch all active listings
  // ============================================
  if (req.method === 'GET') {
    try {
      // Step 1: Get all inventory items
      let allItems = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      
      while (hasMore && offset < 1000) {
        const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
        
        const response = await fetch(url, { headers: baseHeaders });
        
        if (!response.ok) {
          const err = await response.text();
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
      
      // Step 2: For each item, get its offers to find published (active) listings
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
              
              // Only include PUBLISHED offers (active listings)
              const publishedOffers = offers.filter(o => o.status === 'PUBLISHED');
              
              for (const offer of publishedOffers) {
                // Extract size from aspects
                const aspects = item.product?.aspects || {};
                const size = aspects['US Shoe Size']?.[0] || 
                            aspects['Size']?.[0] || 
                            aspects['US Size']?.[0] || '';
                
                listings.push({
                  sku: item.sku,
                  offerId: offer.offerId,
                  listingId: offer.listing?.listingId || null,
                  
                  // Product info
                  title: item.product?.title || offer.listing?.listingTitle || 'eBay Item',
                  mpn: item.product?.mpn || '',
                  brand: item.product?.brand || '',
                  size,
                  image: item.product?.imageUrls?.[0] || '',
                  
                  // Listing details
                  price: parseFloat(offer.pricingSummary?.price?.value) || 0,
                  currency: offer.pricingSummary?.price?.currency || 'USD',
                  quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
                  status: offer.status,
                  format: offer.format || 'FIXED_PRICE',
                  
                  // Category
                  categoryId: offer.categoryId,
                  
                  // Timestamps
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
      
      return res.status(200).json({
        success: true,
        listings,
        total: listings.length
      });
      
    } catch (error) {
      console.error('[eBay Listings] Error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch listings', message: error.message });
    }
  }

  // ============================================
  // POST - Create new listings (cross-list)
  // ============================================
  if (req.method === 'POST') {
    try {
      const { products } = req.body;
      
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'products array is required' });
      }
      
      // Step 1: Get fulfillment/payment/return policies
      let fulfillmentPolicyId, paymentPolicyId, returnPolicyId;
      
      try {
        const [fulfillRes, paymentRes, returnRes] = await Promise.all([
          fetch('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', { headers: baseHeaders }),
          fetch('https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US', { headers: baseHeaders }),
          fetch('https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US', { headers: baseHeaders })
        ]);
        
        if (fulfillRes.ok) {
          const data = await fulfillRes.json();
          fulfillmentPolicyId = data.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
        }
        if (paymentRes.ok) {
          const data = await paymentRes.json();
          paymentPolicyId = data.paymentPolicies?.[0]?.paymentPolicyId;
        }
        if (returnRes.ok) {
          const data = await returnRes.json();
          returnPolicyId = data.returnPolicies?.[0]?.returnPolicyId;
        }
      } catch (e) {
        console.log('[eBay] Error fetching policies:', e.message);
      }
      
      if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
        return res.status(400).json({ 
          error: 'Missing business policies', 
          message: 'Please set up fulfillment, payment, and return policies in eBay Seller Hub'
        });
      }
      
      const results = { created: 0, failed: 0, errors: [] };
      
      for (const product of products) {
        for (const sizeData of (product.sizes || [])) {
          try {
            const sku = `${product.sku}-${sizeData.size}`;
            const price = Math.ceil((sizeData.price || product.price || 100) * 1.10); // 10% markup for eBay fees
            
            // Step 2: Create/Update Inventory Item
            const inventoryItem = {
              availability: {
                shipToLocationAvailability: {
                  quantity: sizeData.qty || 1
                }
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
            
            const invRes = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
              method: 'PUT',
              headers: {
                ...baseHeaders,
                'Content-Language': 'en-US'
              },
              body: JSON.stringify(inventoryItem)
            });
            
            if (!invRes.ok && invRes.status !== 204) {
              const err = await invRes.text();
              results.errors.push({ sku, step: 'inventory', error: err });
              results.failed++;
              continue;
            }
            
            // Step 3: Create Offer
            const offer = {
              sku,
              marketplaceId: 'EBAY_US',
              format: 'FIXED_PRICE',
              listingDescription: `Brand new ${product.name} in size ${sizeData.size}. 100% Authentic.`,
              availableQuantity: sizeData.qty || 1,
              categoryId: '15709', // Athletic Shoes
              pricingSummary: {
                price: {
                  value: String(price),
                  currency: 'USD'
                }
              },
              listingPolicies: {
                fulfillmentPolicyId,
                paymentPolicyId,
                returnPolicyId
              },
              merchantLocationKey: 'default' // Uses default location
            };
            
            const offerRes = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
              method: 'POST',
              headers: baseHeaders,
              body: JSON.stringify(offer)
            });
            
            if (!offerRes.ok) {
              const err = await offerRes.text();
              results.errors.push({ sku, step: 'offer', error: err });
              results.failed++;
              continue;
            }
            
            const offerData = await offerRes.json();
            const offerId = offerData.offerId;
            
            // Step 4: Publish Offer
            const publishRes = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`, {
              method: 'POST',
              headers: baseHeaders
            });
            
            if (!publishRes.ok) {
              const err = await publishRes.text();
              results.errors.push({ sku, step: 'publish', error: err });
              results.failed++;
              continue;
            }
            
            results.created++;
            
          } catch (e) {
            results.errors.push({ sku: `${product.sku}-${sizeData.size}`, error: e.message });
            results.failed++;
          }
        }
      }
      
      return res.status(200).json({
        success: results.created > 0,
        ...results
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
      
      // Group updates by SKU
      const requests = updates.map(u => ({
        sku: u.sku,
        shipToLocationAvailability: u.quantity !== undefined ? {
          quantity: u.quantity
        } : undefined,
        offers: [{
          offerId: u.offerId,
          availableQuantity: u.quantity,
          price: u.price !== undefined ? {
            value: String(u.price),
            currency: 'USD'
          } : undefined
        }]
      }));
      
      const bulkRes = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_update_price_quantity', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({ requests })
      });
      
      if (!bulkRes.ok) {
        const err = await bulkRes.text();
        return res.status(bulkRes.status).json({ error: 'Bulk update failed', details: err });
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
          const withdrawRes = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/withdraw`, {
            method: 'POST',
            headers: baseHeaders
          });
          
          if (withdrawRes.ok || withdrawRes.status === 204) {
            results.ended++;
          } else {
            const err = await withdrawRes.text();
            results.errors.push({ offerId, error: err });
            results.failed++;
          }
        } catch (e) {
          results.errors.push({ offerId, error: e.message });
          results.failed++;
        }
      }
      
      return res.status(200).json({
        success: results.ended > 0,
        ...results
      });
      
    } catch (error) {
      console.error('[eBay Listings] Delete error:', error.message);
      return res.status(500).json({ error: 'Failed to end listings', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
