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
              const std = m.standardMarketData || {};
              const flex = m.flexMarketData || {};
              const direct = m.directMarketData || {};
              marketData[variantId] = { 
                lowestAsk: parseFloat(m.lowestAskAmount) || null, 
                highestBid: parseFloat(m.highestBidAmount) || null, 
                sellFaster: parseFloat(m.sellFasterAmount) || null,
                standardLowest: parseFloat(std.lowestAsk) || null,
                standardSellFaster: parseFloat(std.sellFaster) || null,
                standardBid: parseFloat(std.highestBidAmount) || null,
                flexLowest: parseFloat(flex.lowestAsk) || null,
                flexSellFaster: parseFloat(flex.sellFaster) || null,
                flexBid: parseFloat(flex.highestBidAmount) || null,
                directLowest: parseFloat(direct.lowestAsk) || null,
                directSellFaster: parseFloat(direct.sellFaster) || null,
                directBid: parseFloat(direct.highestBidAmount) || null
              };
            }
          } catch {}
        }));
        return res.status(200).json({ marketData });
      }

      // Check if skipMarketData query param is set (for fast initial load)
      const skipMarketData = req.query.skipMarketData === 'true';

      // Fetch all listings - first get page 1 to know total
      let allListings = [];
      
      const firstPage = await fetch(`https://api.stockx.com/v2/selling/listings?pageNumber=1&pageSize=100&listingStatuses=ACTIVE`, {
        headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
      });
      
      if (!firstPage.ok) {
        console.log('[StockX] First page failed:', firstPage.status);
        return res.status(firstPage.status).json({ error: 'Failed to fetch listings' });
      }
      
      const firstData = await firstPage.json();
      allListings.push(...(firstData.listings || []));
      
      const totalCount = firstData.count || 0;
      const totalPages = Math.ceil(totalCount / 100);
      
      console.log(`[StockX] Total count: ${totalCount}, Pages needed: ${totalPages}`);
      
      // Fetch remaining pages in parallel batches of 20
      if (firstData.hasNextPage && totalPages > 1) {
        for (let batch = 2; batch <= totalPages; batch += 20) {
          const pagePromises = [];
          for (let p = batch; p < batch + 20 && p <= totalPages; p++) {
            pagePromises.push(
              fetch(`https://api.stockx.com/v2/selling/listings?pageNumber=${p}&pageSize=100&listingStatuses=ACTIVE`, {
                headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
              }).then(r => r.ok ? r.json() : null).catch(() => null)
            );
          }
          
          const results = await Promise.all(pagePromises);
          for (const d of results) {
            if (d?.listings?.length) {
              allListings.push(...d.listings);
            }
          }
          
          console.log(`[StockX] Progress: ${allListings.length} listings`);
        }
      }
      
      console.log(`[StockX] FINAL: ${allListings.length} of ${totalCount} listings fetched`);

      // Get unique products
      const productIds = new Set();
      for (const l of allListings) {
        if (l.product?.productId) productIds.add(l.product.productId);
      }

      // Skip product details fetch for fast sync - just use product name for image
      const productDetails = {};
      const productArray = Array.from(productIds);
      
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
      
      if (!skipMarketData) {
        console.log(`[StockX] Fetching market data for ${productArray.length} products`);
        
        for (let i = 0; i < productArray.length; i += 50) {
          const batch = productArray.slice(i, i + 50);
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
                      standardBid: parseFloat(std.highestBidAmount) || null,
                      
                      flexLowest: parseFloat(flex.lowestAsk) || null,
                      flexSellFaster: parseFloat(flex.sellFaster) || null,
                      flexBid: parseFloat(flex.highestBidAmount) || null,
                      
                      directLowest: parseFloat(direct.lowestAsk) || null,
                      directSellFaster: parseFloat(direct.sellFaster) || null,
                      directBid: parseFloat(direct.highestBidAmount) || null
                    };
                  }
              }
            }
          } catch (e) {
            console.log('[StockX] Product market data error:', productId, e.message);
          }
        }));
      }
      } // end if (!skipMarketData)
      
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
        let lowestAsk = null, sellFaster = null, highestBid = null;
        
        if (channel === 'DIRECT') {
          lowestAsk = md.directLowest;
          sellFaster = md.directSellFaster;
          highestBid = md.directBid || md.highestBid;
        } else if (channel === 'FLEX') {
          lowestAsk = md.flexLowest;
          sellFaster = md.flexSellFaster;
          highestBid = md.flexBid || md.highestBid;
        } else {
          lowestAsk = md.standardLowest;
          sellFaster = md.standardSellFaster;
          highestBid = md.standardBid || md.highestBid;
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
          highestBid: highestBid || null, 
          sellFaster: sellFaster || null,
          qty: l.quantity || 1,
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
