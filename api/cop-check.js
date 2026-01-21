// Cop Check API - Official StockX API with OAuth

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }

  const apiKey = process.env.STOCKX_API_KEY;
  const refreshToken = process.env.STOCKX_REFRESH_TOKEN;
  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;
  
  // Try official API if we have all credentials
  if (apiKey && refreshToken && clientId && clientSecret) {
    try {
      const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
      const officialResult = await tryOfficialAPI(sku, apiKey, accessToken);
      if (officialResult) {
        return res.status(200).json(officialResult);
      }
    } catch (err) {
      console.log('Official API failed, falling back to GraphQL:', err.message);
    }
  }

  // Fallback to GraphQL (public data, no auth needed)
  try {
    const graphqlResult = await tryGraphQL(sku);
    return res.status(200).json(graphqlResult);
  } catch (err) {
    console.error('GraphQL also failed:', err.message);
    return res.status(500).json({ 
      error: 'FETCH_FAILED', 
      message: 'Unable to fetch market data. Please try again.' 
    });
  }
}

// Get access token from refresh token
async function getAccessToken(clientId, clientSecret, refreshToken) {
  const response = await fetch('https://accounts.stockx.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      audience: 'gateway.stockx.com',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get access token');
  }

  const data = await response.json();
  return data.access_token;
}

// Official StockX API v2 with OAuth
async function tryOfficialAPI(sku, apiKey, accessToken) {
  const searchRes = await fetch(
    `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(sku)}`,
    {
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!searchRes.ok) {
    throw new Error(`Search failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const products = searchData?.products || [];
  
  if (products.length === 0) {
    throw new Error('SKU_NOT_FOUND');
  }

  const product = products.find(p => 
    p.styleId?.toUpperCase() === sku.toUpperCase()
  ) || products[0];

  const productId = product.productId || product.id;

  const marketRes = await fetch(
    `https://api.stockx.com/v2/catalog/products/${productId}/market-data`,
    {
      headers: {
        'x-api-key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!marketRes.ok) {
    throw new Error(`Market data failed: ${marketRes.status}`);
  }

  const marketData = await marketRes.json();
  return formatResponse(product, marketData, 'official');
}

// GraphQL fallback
async function tryGraphQL(sku) {
  const query = {
    query: `
      query SearchProducts($query: String!) {
        browse(query: $query, first: 10) {
          edges {
            node {
              ... on Product {
                id
                urlKey
                title
                styleId
                media { thumbUrl imageUrl }
                market {
                  bidAskData {
                    lowestAsk
                    highestBid
                    lastSale
                    salesLast72Hours
                  }
                }
                variants {
                  id
                  sizeChart {
                    baseSize
                    displayOptions { type value }
                  }
                  market {
                    bidAskData {
                      lowestAsk
                      highestBid
                      lastSale
                      salesLast72Hours
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: { query: sku }
  };

  const searchRes = await fetch('https://stockx.com/p/e', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Origin': 'https://stockx.com',
      'Referer': 'https://stockx.com/',
      'apollographql-client-name': 'Iron',
      'apollographql-client-version': '2024.01.01.00',
    },
    body: JSON.stringify(query)
  });

  if (!searchRes.ok) {
    throw new Error(`GraphQL failed: ${searchRes.status}`);
  }

  const data = await searchRes.json();
  const edges = data?.data?.browse?.edges || [];

  if (edges.length === 0) {
    throw new Error('SKU_NOT_FOUND');
  }

  const product = edges.find(e => 
    e.node?.styleId?.toUpperCase() === sku.toUpperCase()
  )?.node || edges[0]?.node;

  if (!product) {
    throw new Error('SKU_NOT_FOUND');
  }

  return formatGraphQLResponse(product);
}

function formatResponse(product, marketData, source) {
  const variants = [];
  let totalSales72h = 0;
  let sizesWithBids = 0;
  const spreads = [];

  if (marketData?.variants) {
    marketData.variants.forEach(v => {
      const bid = v.highestBid || null;
      const ask = v.lowestAsk || null;
      const lastSale = v.lastSale || null;
      const sales72h = v.salesLast72Hours || 0;

      let spread = null, spreadPct = null, bidStrength = null;
      if (bid && ask && ask > 0) {
        spread = ask - bid;
        spreadPct = Math.round((spread / ask) * 1000) / 10;
        bidStrength = Math.round((bid / ask) * 1000) / 1000;
        spreads.push(spreadPct);
      }

      const liquidityScore = calculateLiquidityScore(spreadPct, bidStrength, sales72h, bid, ask, lastSale);

      totalSales72h += sales72h;
      if (bid && bid > 0) sizesWithBids++;

      variants.push({
        size: v.size || v.sizeUS || 'N/A',
        highestBid: bid,
        lowestAsk: ask,
        lastSale,
        salesLast72Hours: sales72h,
        spread,
        spreadPct,
        bidStrength,
        liquidityScore,
      });
    });
  }

  variants.sort((a, b) => b.liquidityScore - a.liquidityScore);
  return buildFinalResponse(product, variants, totalSales72h, sizesWithBids, spreads, source);
}

function formatGraphQLResponse(product) {
  const variants = [];
  let totalSales72h = 0;
  let sizesWithBids = 0;
  const spreads = [];

  if (product.variants) {
    product.variants.forEach(v => {
      const sizeDisplay = v.sizeChart?.displayOptions?.find(o => o.type === 'us')?.value 
        || v.sizeChart?.baseSize;

      if (sizeDisplay && v.market?.bidAskData) {
        const bid = v.market.bidAskData.highestBid || null;
        const ask = v.market.bidAskData.lowestAsk || null;
        const lastSale = v.market.bidAskData.lastSale || null;
        const sales72h = v.market.bidAskData.salesLast72Hours || 0;

        let spread = null, spreadPct = null, bidStrength = null;
        if (bid && ask && ask > 0) {
          spread = ask - bid;
          spreadPct = Math.round((spread / ask) * 1000) / 10;
          bidStrength = Math.round((bid / ask) * 1000) / 1000;
          spreads.push(spreadPct);
        }

        const liquidityScore = calculateLiquidityScore(spreadPct, bidStrength, sales72h, bid, ask, lastSale);

        totalSales72h += sales72h;
        if (bid && bid > 0) sizesWithBids++;

        variants.push({
          size: sizeDisplay,
          highestBid: bid,
          lowestAsk: ask,
          lastSale,
          salesLast72Hours: sales72h,
          spread,
          spreadPct,
          bidStrength,
          liquidityScore,
        });
      }
    });
  }

  variants.sort((a, b) => b.liquidityScore - a.liquidityScore);

  if (totalSales72h === 0) {
    totalSales72h = product.market?.bidAskData?.salesLast72Hours || 0;
  }

  const market = product.market?.bidAskData || {};
  let image = product.media?.imageUrl || product.media?.thumbUrl || '';

  return buildFinalResponse({
    title: product.title,
    styleId: product.styleId,
    id: product.id,
    image,
    lowestAsk: market.lowestAsk,
    highestBid: market.highestBid,
    lastSale: market.lastSale,
  }, variants, totalSales72h, sizesWithBids, spreads, 'graphql');
}

function calculateLiquidityScore(spreadPct, bidStrength, sales72h, bid, ask, lastSale) {
  let score = 0;

  if (spreadPct !== null) {
    if (spreadPct <= 5) score += 40;
    else if (spreadPct <= 10) score += 30;
    else if (spreadPct <= 15) score += 20;
    else score += 10;
  }

  if (bidStrength !== null) {
    if (bidStrength >= 0.95) score += 20;
    else if (bidStrength >= 0.90) score += 15;
    else if (bidStrength >= 0.85) score += 10;
    else if (bidStrength >= 0.80) score += 5;
  }

  if (sales72h >= 10) score += 30;
  else if (sales72h >= 5) score += 25;
  else if (sales72h >= 3) score += 20;
  else if (sales72h >= 1) score += 15;
  else if (bid && ask) score += 5;

  if (lastSale) score += 10;

  return Math.min(score, 100);
}

function buildFinalResponse(product, variants, totalSales72h, sizesWithBids, spreads, source) {
  const totalVariants = variants.length || 1;
  const sizesWithBidsPct = Math.round((sizesWithBids / totalVariants) * 100);

  const validSpreads = spreads.filter(s => s !== null).sort((a, b) => a - b);
  const medianSpreadPct = validSpreads.length > 0
    ? validSpreads[Math.floor(validSpreads.length / 2)]
    : null;

  const topScores = variants.slice(0, 10).map(v => v.liquidityScore);
  const overallLiquidityScore = topScores.length > 0
    ? Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length)
    : 0;

  const bestSizes = variants.filter(v => v.liquidityScore >= 60).slice(0, 5).map(v => v.size);
  const avoidSizes = variants.filter(v => v.liquidityScore < 40).slice(-5).map(v => v.size);

  let verdict = "DROP";
  if (medianSpreadPct !== null && medianSpreadPct <= 8 && sizesWithBidsPct >= 60 && totalSales72h >= 3) {
    verdict = "COP";
  } else if (medianSpreadPct !== null && medianSpreadPct <= 12 && totalSales72h >= 1) {
    verdict = "MAYBE";
  }

  return {
    title: product.title || 'Unknown Product',
    sku: product.styleId || '',
    productId: product.id || product.productId || '',
    image: product.image || '',
    lowestAsk: product.lowestAsk || 0,
    highestBid: product.highestBid || 0,
    lastSale: product.lastSale || 0,
    salesLast72Hours: totalSales72h,
    estimated90DaySales: totalSales72h * 30,
    verdict,
    overallLiquidityScore,
    medianSpreadPct,
    sizesWithBidsPct,
    bestSizes,
    avoidSizes,
    variants,
    source,
  };
}
