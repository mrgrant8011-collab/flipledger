/**
 * STOCKX LISTINGS API - FAST VERSION
 * ===================================
 * GET - Fetch listings (skip market data for speed)
 * GET ?productId=xxx - Fetch market data for specific product
 * PATCH - Batch update prices
 * DELETE - Batch delete listings
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  const apiKey = process.env.STOCKX_API_KEY;
  
  if (!authHeader) return res.status(401).json({ error: 'No auth token' });

  // GET - Fetch listings
  if (req.method === 'GET') {
    try {
      // If productId is provided, fetch market data for that product's variants
      if (req.query.productId) {
        const { productId, variantIds } = req.query;
        const ids = variantIds ? variantIds.split(',') : [];
        const marketData = {};
        
        for (const variantId of ids.slice(0, 20)) {
          try {
            const mdRes = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data?currencyCode=USD`, {
              headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
            });
            if (mdRes.ok) {
              const md = await mdRes.json();
              marketData[variantId] = {
                lowestAsk: parseFloat(md.lowestAskAmount) || null,
                highestBid: parseFloat(md.highestBidAmount) || null,
                sellFaster: parseFloat(md.sellFasterAmount) || null
              };
            }
          } catch (e) {}
        }
        return res.status(200).json({ marketData });
      }

      // Fetch all listings (no market data - much faster)
      let allListings = [];
      let pageNumber = 1;
      let hasMore = true;
      
      while (hasMore && pageNumber <= 10) {
        const url = `https://api.stockx.com/v2/selling/listings?pageNumber=${pageNumber}&pageSize=100&listingStatuses=ACTIVE`;
        
        const response = await fetch(url, {
          headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          if (pageNumber === 1) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: err.message || 'API Error' });
          }
          break;
        }
        
        const data = await response.json();
        const listings = data.listings || [];
        
        if (listings.length === 0) {
          hasMore = false;
        } else {
          allListings.push(...listings);
          hasMore = data.hasNextPage && listings.length === 100;
          pageNumber++;
        }
      }
      
      // Transform listings (no market data calls)
      const transformedListings = allListings.map(listing => {
        const product = listing.product || {};
        const variant = listing.variant || {};
        
        // Build image URL
        let image = '';
        if (product.productName) {
          let name = product.productName;
          if (/^Jordan\s/i.test(name) && !/^Air\s+Jordan/i.test(name)) name = 'Air ' + name;
          const slug = name
            .replace(/\(Women's\)/gi, 'W').replace(/\(Men's\)/gi, '').replace(/\(GS\)/gi, 'GS')
            .replace(/\(PS\)/gi, 'PS').replace(/\(TD\)/gi, 'TD').replace(/\([^)]*\)/g, '')
            .replace(/'/g, '').replace(/"/g, '').replace(/&/g, 'and').replace(/\+/g, 'Plus')
            .replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
          if (slug) image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        }
        
        return {
          listingId: listing.listingId,
          productId: product.productId,
          variantId: variant.variantId,
          name: product.productName || 'Unknown',
          sku: product.styleId || '',
          size: variant.variantValue || '',
          image,
          yourAsk: parseFloat(listing.amount) || 0,
          inventoryType: listing.inventoryType || 'STANDARD',
          lowestAsk: null, // Will be fetched on demand
          highestBid: null,
          sellFaster: null,
          createdAt: listing.createdAt,
          daysListed: listing.createdAt ? Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / 86400000) : 0
        };
      });
      
      return res.status(200).json({ success: true, listings: transformedListings, total: transformedListings.length });
      
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch listings', message: error.message });
    }
  }

  // PATCH - Batch update prices
  if (req.method === 'PATCH') {
    try {
      const { items } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'items required' });
      
      const batchItems = items.map(i => ({ listingId: i.listingId, amount: String(i.amount), currencyCode: 'USD' }));
      
      const batchRes = await fetch('https://api.stockx.com/v2/selling/batch/update-listing', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchItems })
      });
      
      if (!batchRes.ok) {
        const err = await batchRes.json().catch(() => ({}));
        return res.status(batchRes.status).json({ error: err.message || 'Failed' });
      }
      
      const { batchId } = await batchRes.json();
      
      // Poll for completion (max 15 sec)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await fetch(`https://api.stockx.com/v2/selling/batch/update-listing/${batchId}`, {
          headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
        });
        if (statusRes.ok) {
          const data = await statusRes.json();
          if (data.status === 'COMPLETED') return res.status(200).json({ success: true, batchId, updated: items.length });
        }
      }
      
      return res.status(200).json({ success: true, batchId, message: 'Processing' });
    } catch (error) {
      return res.status(500).json({ error: 'Update failed', message: error.message });
    }
  }

  // DELETE - Batch delete
  if (req.method === 'DELETE') {
    try {
      const { listingIds } = req.body;
      if (!listingIds?.length) return res.status(400).json({ error: 'listingIds required' });
      
      const batchRes = await fetch('https://api.stockx.com/v2/selling/batch/delete-listing', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: listingIds.map(id => ({ listingId: id })) })
      });
      
      if (!batchRes.ok) {
        const err = await batchRes.json().catch(() => ({}));
        return res.status(batchRes.status).json({ error: err.message || 'Failed' });
      }
      
      const { batchId } = await batchRes.json();
      return res.status(200).json({ success: true, batchId, deleted: listingIds.length });
    } catch (error) {
      return res.status(500).json({ error: 'Delete failed', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
