/**
 * STOCKX LISTINGS API
 * ===================
 * GET - Fetch all active listings with market data
 * PATCH - Batch update listing prices
 * DELETE - Batch delete listings
 * 
 * Based on StockX API v2 docs
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  const apiKey = process.env.STOCKX_API_KEY;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  // ============================================
  // GET - Fetch all active listings + market data
  // ============================================
  if (req.method === 'GET') {
    try {
      let allListings = [];
      let pageNumber = 1;
      let hasMore = true;
      
      // Fetch all ACTIVE listings with pagination
      while (hasMore && pageNumber <= 10) {
        const url = new URL('https://api.stockx.com/v2/selling/listings');
        url.searchParams.set('pageNumber', pageNumber.toString());
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('listingStatuses', 'ACTIVE');
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (pageNumber === 1) {
            return res.status(response.status).json({ error: err.message || 'API Error', details: err });
          }
          break;
        }
        
        const data = await response.json();
        const listings = data.listings || [];
        
        if (listings.length === 0) {
          hasMore = false;
        } else {
          allListings = [...allListings, ...listings];
          if (!data.hasNextPage || listings.length < 100) {
            hasMore = false;
          } else {
            pageNumber++;
          }
        }
      }
      
      console.log(`[StockX Listings] Fetched ${allListings.length} active listings`);
      
      // Get unique productId/variantId pairs for market data
      const variantMap = new Map();
      allListings.forEach(listing => {
        if (listing.product?.productId && listing.variant?.variantId) {
          const key = `${listing.product.productId}|${listing.variant.variantId}`;
          if (!variantMap.has(key)) {
            variantMap.set(key, {
              productId: listing.product.productId,
              variantId: listing.variant.variantId
            });
          }
        }
      });
      
      // Fetch market data for each variant (in batches)
      const marketData = {};
      const variants = Array.from(variantMap.values());
      
      for (let i = 0; i < variants.length; i += 20) {
        const batch = variants.slice(i, i + 20);
        await Promise.all(batch.map(async ({ productId, variantId }) => {
          try {
            const mdUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data?currencyCode=USD`;
            const mdRes = await fetch(mdUrl, {
              headers: {
                'Authorization': authHeader,
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
              }
            });
            
            if (mdRes.ok) {
              const md = await mdRes.json();
              marketData[variantId] = {
                lowestAsk: parseFloat(md.lowestAskAmount) || null,
                highestBid: parseFloat(md.highestBidAmount) || null,
                sellFaster: parseFloat(md.sellFasterAmount) || null,
                earnMore: parseFloat(md.earnMoreAmount) || null,
                flexLowestAsk: parseFloat(md.flexLowestAskAmount) || null
              };
            }
          } catch (e) {
            console.log(`[StockX] Market data fetch failed for ${variantId}`);
          }
        }));
      }
      
      console.log(`[StockX Listings] Fetched market data for ${Object.keys(marketData).length} variants`);
      
      // Transform listings
      const transformedListings = allListings.map(listing => {
        const product = listing.product || {};
        const variant = listing.variant || {};
        const md = marketData[variant.variantId] || {};
        
        // Build image URL from product name
        let image = '';
        if (product.productName) {
          let nameForSlug = product.productName;
          if (/^Jordan\s/i.test(nameForSlug) && !/^Air\s+Jordan/i.test(nameForSlug)) {
            nameForSlug = 'Air ' + nameForSlug;
          }
          const slug = nameForSlug
            .replace(/\(Women's\)/gi, 'W')
            .replace(/\(Men's\)/gi, '')
            .replace(/\(GS\)/gi, 'GS')
            .replace(/\(PS\)/gi, 'PS')
            .replace(/\(TD\)/gi, 'TD')
            .replace(/\([^)]*\)/g, '')
            .replace(/'/g, '')
            .replace(/"/g, '')
            .replace(/&/g, 'and')
            .replace(/\+/g, 'Plus')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          
          if (slug) {
            image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
          }
        }
        
        return {
          listingId: listing.listingId,
          productId: product.productId,
          variantId: variant.variantId,
          
          // Product info
          name: product.productName || 'Unknown Product',
          sku: product.styleId || '',
          size: variant.variantValue || '',
          image,
          
          // Listing details
          yourAsk: parseFloat(listing.amount) || 0,
          currencyCode: listing.currencyCode || 'USD',
          inventoryType: listing.inventoryType || 'STANDARD',
          status: listing.status,
          
          // Market data
          lowestAsk: md.lowestAsk || null,
          highestBid: md.highestBid || null,
          sellFaster: md.sellFaster || null,
          earnMore: md.earnMore || null,
          
          // Timestamps
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          daysListed: listing.createdAt ? Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0
        };
      });
      
      return res.status(200).json({
        success: true,
        listings: transformedListings,
        total: transformedListings.length
      });
      
    } catch (error) {
      console.error('[StockX Listings] Error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch listings', message: error.message });
    }
  }

  // ============================================
  // PATCH - Batch update listing prices
  // ============================================
  if (req.method === 'PATCH') {
    try {
      const { items } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
      }
      
      // Prepare batch update request
      const batchItems = items.map(item => ({
        listingId: item.listingId,
        amount: String(item.amount),
        currencyCode: item.currencyCode || 'USD'
      }));
      
      // Submit batch update
      const batchRes = await fetch('https://api.stockx.com/v2/selling/batch/update-listing', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: batchItems })
      });
      
      if (!batchRes.ok) {
        const err = await batchRes.json().catch(() => ({}));
        return res.status(batchRes.status).json({ error: err.message || 'Batch update failed', details: err });
      }
      
      const batchData = await batchRes.json();
      const batchId = batchData.batchId;
      
      // Poll for completion (max 30 seconds)
      let status = 'QUEUED';
      let attempts = 0;
      
      while (status === 'QUEUED' && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        
        const statusRes = await fetch(`https://api.stockx.com/v2/selling/batch/update-listing/${batchId}`, {
          headers: {
            'Authorization': authHeader,
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          status = statusData.status;
          
          if (status === 'COMPLETED') {
            return res.status(200).json({
              success: true,
              batchId,
              status,
              updated: items.length,
              itemStatuses: statusData.itemStatuses
            });
          }
        }
        attempts++;
      }
      
      return res.status(200).json({
        success: true,
        batchId,
        status,
        message: 'Batch submitted, check status later'
      });
      
    } catch (error) {
      console.error('[StockX Listings] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to update listings', message: error.message });
    }
  }

  // ============================================
  // DELETE - Batch delete listings
  // ============================================
  if (req.method === 'DELETE') {
    try {
      const { listingIds } = req.body;
      
      if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
        return res.status(400).json({ error: 'listingIds array is required' });
      }
      
      const batchItems = listingIds.map(id => ({ listingId: id }));
      
      const batchRes = await fetch('https://api.stockx.com/v2/selling/batch/delete-listing', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: batchItems })
      });
      
      if (!batchRes.ok) {
        const err = await batchRes.json().catch(() => ({}));
        return res.status(batchRes.status).json({ error: err.message || 'Batch delete failed', details: err });
      }
      
      const batchData = await batchRes.json();
      
      return res.status(200).json({
        success: true,
        batchId: batchData.batchId,
        deleted: listingIds.length
      });
      
    } catch (error) {
      console.error('[StockX Listings] Delete error:', error.message);
      return res.status(500).json({ error: 'Failed to delete listings', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
