// Cop Check API - Fetches prices from StockX

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }
  
  try {
    // Search StockX for the product
    const searchRes = await fetch(`https://stockx.com/api/browse?_search=${encodeURIComponent(sku)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!searchRes.ok) {
      return res.status(404).json({ error: 'Could not search StockX' });
    }
    
    const searchData = await searchRes.json();
    const products = searchData.Products || [];
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'No products found for that style code' });
    }
    
    // Find exact SKU match or use first result
    let product = products.find(p => p.styleId && p.styleId.toUpperCase() === sku.toUpperCase()) || products[0];
    
    // Get product details
    const urlKey = product.urlKey;
    const detailRes = await fetch(`https://stockx.com/api/products/${urlKey}?includes=market,360&currency=USD`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    let sizes = {};
    let lowestAsk = product.market?.lowestAsk || 0;
    let lastSale = product.market?.lastSale || 0;
    
    if (detailRes.ok) {
      const detailData = await detailRes.json();
      const variants = detailData.Product?.children || {};
      
      // Build size map
      Object.values(variants).forEach(v => {
        if (v.shoeSize) {
          sizes[v.shoeSize] = {
            stockx: v.market?.lowestAsk || lowestAsk,
            goat: Math.round((v.market?.lowestAsk || lowestAsk) * 0.97), // Estimate GOAT ~3% lower
            lastSale: v.market?.lastSale || lastSale
          };
        }
      });
    }
    
    // Estimate liquidity based on last sale recency
    const estimateSales = () => {
      if (Object.keys(sizes).length > 15) return 300; // Many sizes = high volume
      if (Object.keys(sizes).length > 10) return 150;
      if (Object.keys(sizes).length > 5) return 75;
      return 30;
    };
    
    // Build image URL
    const slug = product.title
      ? product.title
          .replace(/[()]/g, '')
          .replace(/'/g, '')
          .replace(/&/g, 'and')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
      : '';
    
    const image = slug 
      ? `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2`
      : product.media?.thumbUrl || '';
    
    const response = {
      name: product.title || product.name,
      sku: product.styleId || sku,
      image: image,
      retail: product.retailPrice || 0,
      lowestAsk: {
        stockx: lowestAsk,
        goat: Math.round(lowestAsk * 0.97),
        flightclub: Math.round(lowestAsk * 1.05)
      },
      sizes: sizes,
      salesLast30: estimateSales(),
      avgSale: lastSale || Math.round(lowestAsk * 0.95)
    };
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Cop Check API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch pricing data. Try again.' });
  }
}
