/**
 * STOCKX LISTINGS API
 * GET - Fetch listings + market data (batched for speed)
 * GET ?productId=xxx - Fetch market data for specific product
 * PATCH - Update prices
 * DELETE - Unlist
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  const apiKey = process.env.STOCKX_API_KEY;
  if (!authHeader) return res.status(401).json({ error: 'No auth token' });

  if (req.method === 'GET') {
    try {
      // Single product market data request
      if (req.query.productId) {
        const { productId, variantIds } = req.query;
        const ids = variantIds ? variantIds.split(',') : [];
        const marketData = {};
        
        await Promise.all(ids.slice(0, 30).map(async (variantId) => {
          try {
            const r = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data?currencyCode=USD`, {
              headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
            });
            if (r.ok) {
              const m = await r.json();
              marketData[variantId] = { lowestAsk: parseFloat(m.lowestAskAmount) || null, highestBid: parseFloat(m.highestBidAmount) || null, sellFaster: parseFloat(m.sellFasterAmount) || null };
            }
          } catch {}
        }));
        return res.status(200).json({ marketData });
      }

      // Fetch all listings (up to 2500)
      let allListings = [];
      let pageNumber = 1;
      
      while (pageNumber <= 25) {
        const r = await fetch(`https://api.stockx.com/v2/selling/listings?pageNumber=${pageNumber}&pageSize=100&listingStatuses=ACTIVE`, {
          headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        });
        if (!r.ok) {
          console.log(`[StockX] Listings page ${pageNumber} failed:`, r.status);
          break;
        }
        const d = await r.json();
        if (!d.listings?.length) break;
        allListings.push(...d.listings);
        console.log(`[StockX] Page ${pageNumber}: ${d.listings.length} listings (total: ${allListings.length})`);
        if (!d.hasNextPage || d.listings.length < 100) break;
        pageNumber++;
      }
      
      console.log(`[StockX] Total listings fetched: ${allListings.length}`);

      // Get unique products
      const productIds = new Set();
      for (const l of allListings) {
        if (l.product?.productId) productIds.add(l.product.productId);
      }

      // Fetch product details (including urlKey for images) - batch of 40
      const productDetails = {};
      const productArray = Array.from(productIds);
      
      console.log(`[StockX] Fetching details for ${productArray.length} products`);
      
      for (let i = 0; i < productArray.length; i += 40) {
        const batch = productArray.slice(i, i + 40);
        await Promise.all(batch.map(async (productId) => {
          try {
            const r = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}`, {
              headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
            });
            if (r.ok) {
              const p = await r.json();
              productDetails[productId] = { urlKey: p.urlKey, title: p.title };
            }
          } catch {}
        }));
      }
      
      // Helper to generate fallback slug from product name
      const generateSlug = (name) => {
        if (!name) return '';
        let n = name;
        if (/^Jordan\s/i.test(n) && !/^Air\s+Jordan/i.test(n)) n = 'Air ' + n;
        return n
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
      };

      // Fetch market data at PRODUCT level (faster - one call per product, not per variant)
      const marketData = {};
      
      console.log(`[StockX] Fetching market data for ${productArray.length} products`);
      
      for (let i = 0; i < productArray.length; i += 25) {
        const batch = productArray.slice(i, i + 25);
        await Promise.all(batch.map(async (productId) => {
          try {
            const r = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}/market-data?currencyCode=USD`, {
              headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
            });
            if (r.ok) {
              const variants = await r.json();
              for (const v of (variants || [])) {
                if (v.variantId) {
                  const std = v.standardMarketData || {};
                  const flex = v.flexMarketData || {};
                  const direct = v.directMarketData || {};
                  
                  marketData[v.variantId] = { 
                    lowestAsk: parseFloat(v.lowestAskAmount) || null, 
                    highestBid: parseFloat(v.highestBidAmount) || null, 
                    sellFaster: parseFloat(v.sellFasterAmount) || null,
                    
                    // Channel-specific - strictly from each channel
                    standardLowest: parseFloat(std.lowestAsk) || null,
                    standardSellFaster: parseFloat(std.sellFaster) || null,
                    
                    flexLowest: parseFloat(flex.lowestAsk) || null,
                    flexSellFaster: parseFloat(flex.sellFaster) || null,
                    
                    directLowest: parseFloat(direct.lowestAsk) || null,
                    directSellFaster: parseFloat(direct.sellFaster) || null
                  };
                }
              }
            }
          } catch (e) {
            console.log('[StockX] Product market data error:', productId, e.message);
          }
        }));
      }
      
      console.log(`[StockX] Market data: ${Object.keys(marketData).length} variants`);

      // Transform listings
      const listings = allListings.map(l => {
        const p = l.product || {};
        const v = l.variant || {};
        const md = marketData[v.variantId] || {};
        const pd = productDetails[p.productId] || {};
        const channel = l.inventoryType || 'STANDARD';
        
        // ONLY use channel-specific data - NO FALLBACKS
        // Direct sellers compete with Direct sellers only
        // Flex sellers compete with Flex sellers only
        // Standard sellers compete with Standard sellers only
        let lowestAsk = null, sellFaster = null;
        
        if (channel === 'DIRECT') {
          lowestAsk = md.directLowest;
          sellFaster = md.directSellFaster;
        } else if (channel === 'FLEX') {
          lowestAsk = md.flexLowest;
          sellFaster = md.flexSellFaster;
        } else {
          lowestAsk = md.standardLowest;
          sellFaster = md.standardSellFaster;
        }
        
        // Use urlKey from catalog API, or fallback to generated slug from product name
        let image = '';
        const slug = pd.urlKey || generateSlug(p.productName || pd.title);
        if (slug) {
          image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        }
        
        return {
          listingId: l.listingId, productId: p.productId, variantId: v.variantId,
          name: p.productName || pd.title || 'Unknown', sku: p.styleId || '', size: v.variantValue || '', image,
          yourAsk: parseFloat(l.amount) || 0, inventoryType: channel,
          lowestAsk: lowestAsk || null, 
          highestBid: md.highestBid || null, 
          sellFaster: sellFaster || null,
          createdAt: l.createdAt
        };
      });

      return res.status(200).json({ success: true, listings, total: listings.length });
    } catch (e) {
      return res.status(500).json({ error: 'Failed', message: e.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { items } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'items required' });
      
      console.log('[StockX] Updating', items.length, 'listings');
      
      const results = { success: 0, failed: 0, errors: [] };
      
      // Update each listing individually (more reliable than batch)
      for (const item of items) {
        try {
          const r = await fetch(`https://api.stockx.com/v2/selling/listings/${item.listingId}`, {
            method: 'PATCH',
            headers: { 
              'Authorization': authHeader, 
              'x-api-key': apiKey, 
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
              amount: String(item.amount), 
              currencyCode: 'USD' 
            })
          });
          
          if (r.ok) {
            const data = await r.json();
            console.log('[StockX] Updated', item.listingId, 'to', item.amount, '- operation:', data.operationId);
            results.success++;
          } else {
            const errText = await r.text();
            console.log('[StockX] Failed to update', item.listingId, ':', r.status, errText);
            results.failed++;
            results.errors.push({ listingId: item.listingId, status: r.status, error: errText });
          }
        } catch (e) {
          console.log('[StockX] Error updating', item.listingId, ':', e.message);
          results.failed++;
          results.errors.push({ listingId: item.listingId, error: e.message });
        }
      }
      
      if (results.success > 0) {
        return res.status(200).json({ success: true, updated: results.success, failed: results.failed, errors: results.errors });
      } else {
        return res.status(400).json({ success: false, error: 'All updates failed', ...results });
      }
    } catch (e) {
      console.log('[StockX] PATCH error:', e.message);
      return res.status(500).json({ error: 'Failed', message: e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { listingIds } = req.body;
      if (!listingIds?.length) return res.status(400).json({ error: 'listingIds required' });
      
      console.log('[StockX] Deleting', listingIds.length, 'listings');
      
      const results = { success: 0, failed: 0, errors: [] };
      
      for (const listingId of listingIds) {
        try {
          const r = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': authHeader, 'x-api-key': apiKey }
          });
          
          if (r.ok) {
            console.log('[StockX] Deleted', listingId);
            results.success++;
          } else {
            const errText = await r.text();
            console.log('[StockX] Failed to delete', listingId, ':', r.status, errText);
            results.failed++;
            results.errors.push({ listingId, status: r.status, error: errText });
          }
        } catch (e) {
          results.failed++;
          results.errors.push({ listingId, error: e.message });
        }
      }
      
      if (results.success > 0) {
        return res.status(200).json({ success: true, deleted: results.success, failed: results.failed });
      } else {
        return res.status(400).json({ success: false, error: 'All deletes failed', ...results });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Failed', message: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
