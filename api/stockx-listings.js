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

      // Fetch all listings
      let allListings = [];
      let pageNumber = 1;
      
      while (pageNumber <= 10) {
        const r = await fetch(`https://api.stockx.com/v2/selling/listings?pageNumber=${pageNumber}&pageSize=100&listingStatuses=ACTIVE`, {
          headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        });
        if (!r.ok) break;
        const d = await r.json();
        if (!d.listings?.length) break;
        allListings.push(...d.listings);
        if (!d.hasNextPage || d.listings.length < 100) break;
        pageNumber++;
      }

      // Get unique variants for market data (limit to 100 for speed)
      const variants = [];
      const seen = new Set();
      for (const l of allListings) {
        const key = `${l.product?.productId}|${l.variant?.variantId}`;
        if (!seen.has(key) && l.product?.productId && l.variant?.variantId) {
          seen.add(key);
          variants.push({ productId: l.product.productId, variantId: l.variant.variantId });
        }
        if (variants.length >= 100) break;
      }

      // Fetch market data in parallel (batches of 25)
      const marketData = {};
      for (let i = 0; i < variants.length; i += 25) {
        const batch = variants.slice(i, i + 25);
        await Promise.all(batch.map(async ({ productId, variantId }) => {
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
      }

      // Transform listings
      const listings = allListings.map(l => {
        const p = l.product || {};
        const v = l.variant || {};
        const md = marketData[v.variantId] || {};
        
        let image = '';
        if (p.productName) {
          let n = p.productName;
          if (/^Jordan\s/i.test(n) && !/^Air\s+Jordan/i.test(n)) n = 'Air ' + n;
          const slug = n.replace(/\(Women's\)/gi, 'W').replace(/\(Men's\)/gi, '').replace(/\(GS\)/gi, 'GS').replace(/\(PS\)/gi, 'PS').replace(/\(TD\)/gi, 'TD').replace(/\([^)]*\)/g, '').replace(/'/g, '').replace(/"/g, '').replace(/&/g, 'and').replace(/\+/g, 'Plus').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
          if (slug) image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        }
        
        return {
          listingId: l.listingId, productId: p.productId, variantId: v.variantId,
          name: p.productName || 'Unknown', sku: p.styleId || '', size: v.variantValue || '', image,
          yourAsk: parseFloat(l.amount) || 0, inventoryType: l.inventoryType || 'STANDARD',
          lowestAsk: md.lowestAsk || null, highestBid: md.highestBid || null, sellFaster: md.sellFaster || null,
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
      
      const r = await fetch('https://api.stockx.com/v2/selling/batch/update-listing', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ listingId: i.listingId, amount: String(i.amount), currencyCode: 'USD' })) })
      });
      if (!r.ok) return res.status(r.status).json({ error: 'Failed' });
      
      const { batchId } = await r.json();
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const s = await fetch(`https://api.stockx.com/v2/selling/batch/update-listing/${batchId}`, { headers: { 'Authorization': authHeader, 'x-api-key': apiKey } });
        if (s.ok && (await s.json()).status === 'COMPLETED') return res.status(200).json({ success: true, updated: items.length });
      }
      return res.status(200).json({ success: true, batchId });
    } catch (e) {
      return res.status(500).json({ error: 'Failed', message: e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { listingIds } = req.body;
      if (!listingIds?.length) return res.status(400).json({ error: 'listingIds required' });
      
      const r = await fetch('https://api.stockx.com/v2/selling/batch/delete-listing', {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: listingIds.map(id => ({ listingId: id })) })
      });
      if (!r.ok) return res.status(r.status).json({ error: 'Failed' });
      return res.status(200).json({ success: true, deleted: listingIds.length });
    } catch (e) {
      return res.status(500).json({ error: 'Failed', message: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
