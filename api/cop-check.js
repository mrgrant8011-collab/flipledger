// Cop Check API - Official StockX API v2 with Liquidity Analysis
// Uses your STOCKX_API_KEY - no scraping

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }
  
  const apiKey = process.env.STOCKX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'STOCKX_API_KEY not configured' });
  }
  
  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
  
  try {
    // Step 1: Search for product by SKU
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(sku)}`;
    const searchRes = await fetch(searchUrl, { headers });
    
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('Search failed:', searchRes.status, errText);
      return res.status(searchRes.status).json({ error: 'StockX search failed' });
    }
    
    const searchData = await searchRes.json();
    const products = searchData.products || [];
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'SKU_NOT_FOUND' });
    }
    
    // Find exact SKU match or use first result
    const product = products.find(p => 
      p.styleId?.toUpperCase() === sku.toUpperCase()
    ) || products[0];
    
    const productId = product.productId || product.id;
    
    if (!productId) {
      return res.status(404).json({ error: 'Product ID not found' });
    }
    
    // Step 2: Get variants (sizes)
    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants?country=US&currency=USD`;
    const variantsRes = await fetch(variantsUrl, { headers });
    
    let variantsData = [];
    if (variantsRes.ok) {
      const vData = await variantsRes.json();
      variantsData = vData.variants || [];
    }
    
    // Step 3: Get market data
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data?country=US&currency=USD`;
    const marketRes = await fetch(marketUrl, { headers });
    
    let marketData = {};
    if (marketRes.ok) {
      marketData = await marketRes.json();
    }
    
    // Process variants with liquidity calculations
    const variants = [];
    let totalSales72h = 0;
    let sizesWithBids = 0;
    const spreads = [];
    
    // Get per-variant market data if available
    const variantMarket = marketData.variants || [];
    
    variantsData.forEach(v => {
      const size = v.sizeChart?.displayOptions?.find(o => o.type === 'us')?.value 
        || v.sizeChart?.baseSize 
        || v.size;
      
      if (!size) return;
      
      // Find market data for this variant
      const vm = variantMarket.find(m => m.variantId === v.id) || {};
      
      const bid = vm.highestBid || vm.market?.highestBid || null;
      const ask = vm.lowestAsk || vm.market?.lowestAsk || null;
      const lastSale = vm.lastSale || vm.market?.lastSale || null;
      const sales72h = vm.salesLast72Hours || vm.market?.salesLast72Hours || 0;
      
      // Calculate spread metrics
      let spread = null;
      let spreadPct = null;
      let bidStrength = null;
      
      if (bid && ask && ask > 0) {
        spread = ask - bid;
        spreadPct = Math.round((spread / ask) * 1000) / 10;
        bidStrength = Math.round((bid / ask) * 1000) / 1000;
        spreads.push(spreadPct);
      }
      
      // Calculate liquidity score per size
      let liquidityScore = 0;
      
      // Spread score (tighter = better) - max 40 points
      if (spreadPct !== null) {
        if (spreadPct <= 5) liquidityScore += 40;
        else if (spreadPct <= 10) liquidityScore += 30;
        else if (spreadPct <= 15) liquidityScore += 20;
        else liquidityScore += 10;
      }
      
      // Bid strength bonus - max 20 points
      if (bidStrength !== null) {
        if (bidStrength >= 0.95) liquidityScore += 20;
        else if (bidStrength >= 0.90) liquidityScore += 15;
        else if (bidStrength >= 0.85) liquidityScore += 10;
        else if (bidStrength >= 0.80) liquidityScore += 5;
      }
      
      // Sales velocity bonus (72h sales) - max 30 points
      if (sales72h >= 10) liquidityScore += 30;
      else if (sales72h >= 5) liquidityScore += 25;
      else if (sales72h >= 3) liquidityScore += 20;
      else if (sales72h >= 1) liquidityScore += 15;
      else if (bid && ask) liquidityScore += 5;
      
      // Has last sale bonus - max 10 points
      if (lastSale) liquidityScore += 10;
      
      liquidityScore = Math.min(liquidityScore, 100);
      
      // Track stats
      totalSales72h += sales72h;
      if (bid && bid > 0) sizesWithBids++;
      
      variants.push({
        variantId: v.id,
        size: size,
        highestBid: bid,
        lowestAsk: ask,
        lastSale: lastSale,
        salesLast72Hours: sales72h,
        spread: spread,
        spreadPct: spreadPct,
        bidStrength: bidStrength,
        liquidityScore: liquidityScore,
      });
    });
    
    // Sort by liquidity score descending
    variants.sort((a, b) => b.liquidityScore - a.liquidityScore);
    
    // Calculate product-level metrics
    const totalVariants = variants.length || 1;
    const sizesWithBidsPct = Math.round((sizesWithBids / totalVariants) * 100);
    
    // Median spread
    const validSpreads = spreads.filter(s => s !== null).sort((a, b) => a - b);
    const medianSpreadPct = validSpreads.length > 0 
      ? validSpreads[Math.floor(validSpreads.length / 2)]
      : null;
    
    // Overall liquidity score (average of top sizes)
    const topScores = variants.slice(0, 10).map(v => v.liquidityScore);
    const overallLiquidityScore = topScores.length > 0
      ? Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length)
      : 0;
    
    // Best and avoid sizes
    const bestSizes = variants.filter(v => v.liquidityScore >= 60).slice(0, 5).map(v => v.size);
    const avoidSizes = variants.filter(v => v.liquidityScore < 40).slice(-5).map(v => v.size);
    
    // Use product-level sales if no per-size data
    if (totalSales72h === 0) {
      totalSales72h = marketData.salesLast72Hours || product.market?.salesLast72Hours || 0;
    }
    
    // Estimated 90-day sales
    const estimated90DaySales = totalSales72h * 30;
    
    // Sales velocity rating
    let salesVelocity = "Low";
    if (totalSales72h >= 20) salesVelocity = "Very High";
    else if (totalSales72h >= 10) salesVelocity = "High";
    else if (totalSales72h >= 5) salesVelocity = "Medium";
    
    // Determine verdict
    let verdict = "DROP";
    if (medianSpreadPct !== null && medianSpreadPct <= 8 && sizesWithBidsPct >= 60 && totalSales72h >= 3) {
      verdict = "COP";
    } else if (medianSpreadPct !== null && medianSpreadPct <= 12 && totalSales72h >= 1) {
      verdict = "MAYBE";
    }
    
    // Build image URL
    const image = product.media?.imageUrl 
      || product.media?.thumbUrl 
      || product.image 
      || '';
    
    // Product-level market data
    const productMarket = marketData.market || product.market || {};
    
    return res.status(200).json({
      // Basic info
      title: product.title || product.name,
      sku: product.styleId || sku,
      productId: productId,
      image: image,
      
      // Product-level prices
      lowestAsk: productMarket.lowestAsk || 0,
      highestBid: productMarket.highestBid || 0,
      lastSale: productMarket.lastSale || 0,
      
      // Sales volume
      salesLast72Hours: totalSales72h,
      estimated90DaySales: estimated90DaySales,
      salesVelocity: salesVelocity,
      
      // Liquidity metrics
      verdict: verdict,
      overallLiquidityScore: overallLiquidityScore,
      medianSpreadPct: medianSpreadPct,
      sizesWithBidsPct: sizesWithBidsPct,
      
      // Size recommendations
      bestSizes: bestSizes,
      avoidSizes: avoidSizes,
      
      // All variants with detailed data
      variants: variants,
      
      // Debug
      debug: { 
        cache: "MISS",
        totalVariants: totalVariants,
        sizesWithBids: sizesWithBids,
        source: "stockx-api-v2"
      }
    });
    
  } catch (error) {
    console.error('Cop Check Error:', error);
    return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
  }
}
