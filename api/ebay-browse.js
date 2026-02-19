/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY BROWSE API - Active Listing Intelligence
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Fetches competing active listings for a product from eBay Browse API.
 * Returns pricing stats (low/avg/median/high), promoted %, and individual listings.
 * 
 * Endpoints:
 *   GET /api/ebay-browse?q=Nike+Manoa+Leather&sku=HF7095-700
 * 
 * Query params:
 *   q     - Search query (product name)
 *   sku   - Style code to refine search (optional but recommended)
 *   limit - Max listings to return details for (default 20, max 50)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE_ID = 'EBAY_US';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Auth — use seller's token (also works for Browse API search)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const accessToken = authHeader.replace('Bearer ', '').trim();

  // Parse query
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = url.searchParams.get('q') || '';
  const sku = url.searchParams.get('sku') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);

  if (!q && !sku) {
    return res.status(400).json({ error: 'q or sku query param required' });
  }

  // Build search query — use SKU if available for precision
  const searchQuery = sku ? `${q} ${sku}`.trim() : q;

  console.log(`[eBay:Browse] Searching: "${searchQuery}" (limit: ${limit})`);

  try {
    // eBay Browse API search
    const searchParams = new URLSearchParams({
      q: searchQuery,
      limit: String(limit),
      filter: 'conditions:{NEW}', // Only new items
      sort: 'price',
    });

    const r = await fetch(
      `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${searchParams}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
          'Accept': 'application/json',
        }
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      console.error(`[eBay:Browse] Error ${r.status}:`, errText);
      return res.status(r.status).json({ 
        error: 'eBay Browse API error',
        status: r.status,
        details: errText.substring(0, 500)
      });
    }

    const data = await r.json();
    const items = data.itemSummaries || [];
    const totalResults = data.total || items.length;

    console.log(`[eBay:Browse] Found ${totalResults} results, processing ${items.length}`);

    // Parse listings
    const listings = items.map(item => {
      const price = parseFloat(item.price?.value) || 0;
      const shippingCost = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value) || 0;
      
      // Extract size from title or aspects
      let size = '';
      if (item.title) {
        const sizeMatch = item.title.match(/(?:Size|Sz)\s*[:\-]?\s*([\d\.]+(?:\s*[A-Z])?)/i);
        if (sizeMatch) size = sizeMatch[1].trim();
      }

      return {
        itemId: item.itemId,
        title: item.title || '',
        price,
        shipping: shippingCost,
        totalPrice: price + shippingCost,
        promoted: !!(item.topRatedBuyingExperience || item.priorityListing),
        size,
        condition: item.condition || 'New',
        seller: item.seller?.username || '',
        imageUrl: item.thumbnailImages?.[0]?.imageUrl || item.image?.imageUrl || '',
        itemUrl: item.itemWebUrl || '',
      };
    }).filter(l => l.price > 0);

    // Calculate stats
    const prices = listings.map(l => l.price).sort((a, b) => a - b);
    const stats = calculateStats(prices, listings);

    console.log(`[eBay:Browse] Stats: low=$${stats.low}, avg=$${stats.avg}, median=$${stats.median}, high=$${stats.high}, promoted=${stats.promotedPct}%`);

    return res.status(200).json({
      success: true,
      query: searchQuery,
      total: totalResults,
      ...stats,
      listings: listings.slice(0, limit),
    });

  } catch (e) {
    console.error('[eBay:Browse] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}

function calculateStats(prices, listings) {
  if (prices.length === 0) {
    return { low: 0, high: 0, avg: 0, median: 0, promotedPct: 0 };
  }

  const low = prices[0];
  const high = prices[prices.length - 1];
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  
  // Median
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];

  // Promoted percentage
  const promotedCount = listings.filter(l => l.promoted).length;
  const promotedPct = listings.length > 0 
    ? Math.round(promotedCount / listings.length * 100) 
    : 0;

  return { low, high, avg, median, promotedPct };
}
