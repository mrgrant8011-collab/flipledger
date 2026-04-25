/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * HIVE MIND API - Buying Intelligence
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Combines personal history, community data, eBay market, and StockX bid/ask
 * into a single buying intelligence response.
 *
 * Endpoint:
 *   GET /api/hive-mind?sku=CN8490-002&size=10&user_id=xxx&ebayToken=xxx&stockxToken=xxx
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STOCKX_API_BASE = 'https://api.stockx.com/v2';
// User IDs to exclude from community/aggregate stats
const EXCLUDED_FROM_COMMUNITY = [
  'a636c348-f91c-4e91-87d3-99e7d06d4046',
];
const EBAY_API_BASE = 'https://api.ebay.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const sku = (url.searchParams.get('sku') || '').trim().toUpperCase();
  const size = (url.searchParams.get('size') || '').trim();
  const userId = url.searchParams.get('user_id') || '';
  const stockxToken = url.searchParams.get('stockxToken') || req.headers['x-stockx-token'] || '';
  const ebayToken = (req.headers.authorization || '').replace('Bearer ', '').trim();

  if (!sku) return res.status(400).json({ error: 'sku required' });
  if (!userId) return res.status(400).json({ error: 'user_id required' });

  try {
    const [personal, community, stockxData, ebayData] = await Promise.allSettled([
      getPersonalHistory(userId, sku, size),
      getCommunityData(sku, size),
      getStockXData(sku, size, stockxToken),
      getEbayData(sku, size, ebayToken),
    ]);

    const personalResult = personal.status === 'fulfilled' ? personal.value : null;
    const communityResult = community.status === 'fulfilled' ? community.value : null;
    const stockxResult = stockxData.status === 'fulfilled' ? stockxData.value : null;
    const ebayResult = ebayData.status === 'fulfilled' ? ebayData.value : null;

    const netComparison = calcNetComparison(ebayResult, stockxResult);
    const hotSizes = communityResult?.hotSizes || [];
    const signals = calcSignals(personalResult, communityResult, ebayResult);

    return res.status(200).json({
      success: true,
      sku,
      size,
      personal: personalResult,
      community: communityResult,
      stockx: stockxResult,
      ebay: ebayResult,
      netComparison,
      hotSizes,
      signals,
    });
  } catch (err) {
    console.error('[HiveMind] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ─── PERSONAL HISTORY ────────────────────────────────────────────────────────

async function getPersonalHistory(userId, sku, size) {
  try {
    const normalizedSku = sku.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, sku, size, cost, sale_price, profit, platform, sale_date, fees')
      .eq('user_id', userId)
      .ilike('sku', `%${normalizedSku}%`)
      .order('sale_date', { ascending: false })
      .limit(100);

    let inventoryQuery = supabaseAdmin
      .from('inventory')
      .select('id, sku, size, cost, date, sold, source')
      .eq('user_id', userId)
      .ilike('sku', `%${normalizedSku}%`)
      .limit(100);

    const [salesRes, inventoryRes] = await Promise.all([salesQuery, inventoryQuery]);

    const allSales = salesRes.data || [];
    const allInventory = inventoryRes.data || [];

    const sizeFilter = size ? size.toString().replace(/[^0-9.]/g, '') : null;

    const filteredSales = sizeFilter
      ? allSales.filter(s => s.size && s.size.toString().replace(/[^0-9.]/g, '') === sizeFilter)
      : allSales;

    const filteredInventory = sizeFilter
      ? allInventory.filter(i => i.size && i.size.toString().replace(/[^0-9.]/g, '') === sizeFilter)
      : allInventory;

    if (filteredSales.length === 0 && filteredInventory.length === 0) {
      return null;
    }

    const profits = filteredSales.map(s => s.profit || 0).filter(p => p !== 0);
    const avgProfit = profits.length > 0
      ? Math.round(profits.reduce((a, b) => a + b, 0) / profits.length)
      : null;

    const sellTimes = filteredSales
      .filter(s => s.sale_date)
      .map(s => {
        const inventoryMatch = allInventory.find(i =>
          i.sku?.toUpperCase() === s.sku?.toUpperCase() &&
          i.size?.toString() === s.size?.toString()
        );
        if (!inventoryMatch?.date) return null;
        const days = Math.round(
          (new Date(s.sale_date) - new Date(inventoryMatch.date)) / (1000 * 60 * 60 * 24)
        );
        return days > 0 ? days : null;
      })
      .filter(d => d !== null);

    const avgSellTime = sellTimes.length > 0
      ? Math.round(sellTimes.reduce((a, b) => a + b, 0) / sellTimes.length)
      : null;

    const platformCounts = {};
    filteredSales.forEach(s => {
      if (s.platform) {
        platformCounts[s.platform] = (platformCounts[s.platform] || 0) + 1;
      }
    });
    const bestPlatform = Object.keys(platformCounts).sort(
      (a, b) => platformCounts[b] - platformCounts[a]
    )[0] || null;

    const timesBought = filteredInventory.length;
    const timesSold = filteredSales.length;
    const sellRate = timesBought > 0
      ? `${timesSold}/${timesBought}`
      : null;

    return {
      timesBought,
      timesSold,
      sellRate,
      avgProfit,
      avgSellTime,
      bestPlatform,
    };
  } catch (err) {
    console.error('[HiveMind] Personal history error:', err.message);
    return null;
  }
}

// ─── COMMUNITY DATA ───────────────────────────────────────────────────────────

async function getCommunityData(sku, size) {
  try {
    const normalizedSku = sku.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    const { data: allSales, error } = await supabaseAdmin
      .from('sales')
      .select('sku, size, profit, platform, sale_date, cost, sale_price, user_id')
      .ilike('sku', `%${normalizedSku}%`)
      .not('user_id', 'in', `(${EXCLUDED_FROM_COMMUNITY.map(id => `"${id}"`).join(',')})`)
      .limit(500);

    if (error || !allSales || allSales.length === 0) return null;

    const sizeFilter = size ? size.toString().replace(/[^0-9.]/g, '') : null;

    const filteredSales = sizeFilter
      ? allSales.filter(s => s.size && s.size.toString().replace(/[^0-9.]/g, '') === sizeFilter)
      : allSales;

    if (filteredSales.length === 0) return null;

    const profits = filteredSales.map(s => s.profit || 0).filter(p => p !== 0);
    const avgProfit = profits.length > 0
      ? Math.round(profits.reduce((a, b) => a + b, 0) / profits.length)
      : null;

    const salePrices = filteredSales.map(s => s.sale_price || 0).filter(p => p > 0);
    const avgSalePrice = salePrices.length > 0
      ? Math.round(salePrices.reduce((a, b) => a + b, 0) / salePrices.length)
      : null;

    const sellRate = allSales.length > 0
      ? Math.round((filteredSales.length / allSales.length) * 100)
      : null;

    const sizeCounts = {};
    allSales.forEach(s => {
      if (s.size) {
        const sizeKey = s.size.toString().replace(/[^0-9.]/g, '');
        sizeCounts[sizeKey] = (sizeCounts[sizeKey] || 0) + 1;
      }
    });

    const totalSizeCount = Object.values(sizeCounts).reduce((a, b) => a + b, 0);
    const sizeEntries = Object.entries(sizeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([sz, count]) => ({
        size: sz,
        count,
        pct: Math.round((count / totalSizeCount) * 100),
      }));

    const topThreshold = sizeEntries[0]?.count * 0.6 || 0;
    const midThreshold = sizeEntries[0]?.count * 0.3 || 0;

    const hotSizes = sizeEntries.map(s => ({
      size: s.size,
      heat: s.count >= topThreshold ? 'hot' : s.count >= midThreshold ? 'warm' : 'slow',
    }));

    return {
      totalSales: filteredSales.length,
      avgProfit,
      avgSalePrice,
      sellRate,
      hotSizes,
    };
  } catch (err) {
    console.error('[HiveMind] Community data error:', err.message);
    return null;
  }
}

// ─── STOCKX APP TOKEN ────────────────────────────────────────────────────────

async function getStockXAppToken() {
  try {
    const res = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.STOCKX_CLIENT_ID,
        client_secret: process.env.STOCKX_CLIENT_SECRET,
        refresh_token: process.env.STOCKX_REFRESH_TOKEN,
        audience: 'gateway.stockx.com',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    return null;
  }
}

// ─── STOCKX DATA ─────────────────────────────────────────────────────────────

async function getStockXData(sku, size, userToken) {
  try {
    const apiKey = process.env.STOCKX_API_KEY;
    const accessToken = await getStockXAppToken() || userToken;
    if (!accessToken) return null;

    const searchRes = await fetch(
      `${STOCKX_API_BASE}/catalog/search?query=${encodeURIComponent(sku)}`,
      {
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const products = searchData?.products || [];
    if (products.length === 0) return null;

    const product = products.find(p =>
      p.styleId?.toUpperCase() === sku.toUpperCase()
    ) || products[0];

    const productId = product.productId || product.id;
    if (!productId) return null;

    const variantsRes = await fetch(
      `${STOCKX_API_BASE}/catalog/products/${productId}/variants`,
      {
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!variantsRes.ok) return null;

    const variantsData = await variantsRes.json();
    const variants = variantsData?.variants || variantsData || [];

    const sizeFilter = size ? size.toString().replace(/[^0-9.]/g, '') : null;

    const matchedVariant = sizeFilter
      ? variants.find(v => {
          const vSize = (v.variantValue || v.sizeChart?.baseSize || v.size || '').toString().replace(/[^0-9.]/g, '');
          return vSize === sizeFilter;
        })
      : null;

    if (!matchedVariant && sizeFilter) {
      return {
        productId,
        productTitle: product.title || '',
        retailPrice: product.productAttributes?.retailPrice || null,
        variantNotFound: true,
        allVariants: formatVariants(variants),
      };
    }

    const variantId = matchedVariant?.variantId || matchedVariant?.id;
    if (!variantId) {
      return {
        productId,
        productTitle: product.title || '',
        retailPrice: product.productAttributes?.retailPrice || null,
        allVariants: formatVariants(variants),
      };
    }

    const marketRes = await fetch(
      `${STOCKX_API_BASE}/catalog/products/${productId}/variants/${variantId}/market-data`,
      {
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!marketRes.ok) return null;

    const marketData = await marketRes.json();

    // StockX returns ALL CAPS keys — normalize to lowercase for safe access
    const normalizedMarket = {};
    const raw = marketData?.ProductMarket || marketData?.market || marketData?.data?.market || marketData;
    Object.keys(raw || {}).forEach(k => { normalizedMarket[k.toLowerCase()] = raw[k]; });

    return {
      productId,
      productTitle: product.title || '',
      retailPrice: product.productAttributes?.retailPrice || null,
      size: sizeFilter,
      lowestAsk: parseFloat(normalizedMarket.lowestaskamount) || null,
      highestBid: parseFloat(normalizedMarket.highestbidamount) || null,
      allVariants: formatVariants(variants),
    };
  } catch (err) {
    console.error('[HiveMind] StockX error:', err.message);
    return null;
  }
}

function formatVariants(variants) {
  return (variants || [])
    .map(v => ({
      size: (v.variantValue || v.sizeChart?.baseSize || v.size || '').toString(),
      variantId: v.variantId || v.id,
    }))
    .filter(v => v.size)
    .sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
}

// ─── EBAY DATA ────────────────────────────────────────────────────────────────

async function getEbayData(sku, size, accessToken) {
  if (!accessToken) return null;

  try {
    const query = size ? `${sku} size ${size}` : sku;

    const searchParams = new URLSearchParams({
      q: query,
      limit: '100',
      filter: 'conditions:{NEW}',
      sort: 'price',
    });

    const r = await fetch(
      `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${searchParams}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'Accept': 'application/json',
        },
      }
    );

    if (!r.ok) return null;

    const data = await r.json();
    const items = data.itemSummaries || [];

    const listings = items
      .map(item => ({
        price: parseFloat(item.price?.value) || 0,
        title: item.title || '',
      }))
      .filter(l => l.price > 0);

    if (listings.length === 0) return null;

    const prices = listings.map(l => l.price).sort((a, b) => a - b);
    const low = prices[0];
    const high = prices[prices.length - 1];
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0
      ? Math.round((prices[mid - 1] + prices[mid]) / 2)
      : prices[mid];

    return {
      low,
      avg,
      median,
      high,
      count: listings.length,
      total: data.total || listings.length,
    };
  } catch (err) {
    console.error('[HiveMind] eBay error:', err.message);
    return null;
  }
}

// ─── NET COMPARISON ───────────────────────────────────────────────────────────

function calcNetComparison(ebay, stockx) {
  const ebayAvg = ebay?.avg || null;
  const stockxAsk = stockx?.lowestAsk || null;

  const EBAY_FEE = 0.08;
  const STOCKX_FEE = 0.095;

  const ebayNet = ebayAvg ? Math.round(ebayAvg * (1 - EBAY_FEE)) : null;
  const stockxNet = stockxAsk ? Math.round(stockxAsk * (1 - STOCKX_FEE)) : null;

  if (!ebayNet && !stockxNet) return null;

  const diff = ebayNet && stockxNet ? ebayNet - stockxNet : null;
  const better = diff === null ? null : diff > 0 ? 'ebay' : diff < 0 ? 'stockx' : 'equal';

  return {
    ebayNet,
    stockxNet,
    diff: diff ? Math.abs(diff) : null,
    better,
  };
}

// ─── SIGNALS ─────────────────────────────────────────────────────────────────

function calcSignals(personal, community, ebay) {
  const signals = [];

  if (personal) {
    if (personal.timesBought >= 5) signals.push('green');
    else if (personal.timesBought >= 1) signals.push('yellow');
    else signals.push('gray');
  }

  if (community) {
    if (community.sellRate >= 80) signals.push('green');
    else if (community.sellRate >= 50) signals.push('yellow');
    else signals.push('red');
  }

  if (ebay) {
    if (ebay.count >= 20) signals.push('green');
    else if (ebay.count >= 5) signals.push('yellow');
    else signals.push('red');
  }

  return signals;
}
