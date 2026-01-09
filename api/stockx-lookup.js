export default async function handler(req, res) {
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }
  
  try {
    // Search StockX for the product by SKU/Style ID
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(sku)}`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'x-api-key': process.env.STOCKX_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      // Try alternative endpoint
      const altUrl = `https://api.stockx.com/v2/catalog/products?query=${encodeURIComponent(sku)}`;
      const altResponse = await fetch(altUrl, {
        method: 'GET',
        headers: {
          'x-api-key': process.env.STOCKX_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!altResponse.ok) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const altData = await altResponse.json();
      const products = altData.products || altData.data || altData.results || [];
      
      if (products.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const product = products[0];
      return res.status(200).json({
        name: product.productName || product.title || product.name || '',
        image: product.imageUrl || product.image || product.media?.imageUrl || product.media?.smallImageUrl || '',
        sku: product.styleId || product.sku || sku,
        brand: product.brand || '',
        colorway: product.colorway || product.color || '',
        retailPrice: product.retailPrice || 0
      });
    }
    
    const data = await response.json();
    const products = data.products || data.data || data.results || data.hits || [];
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Find best match - exact SKU match first
    let product = products.find(p => 
      (p.styleId || p.sku || '').toLowerCase() === sku.toLowerCase()
    ) || products[0];
    
    const media = product.media || {};
    
    // Build image URL from SKU if not provided
    let imageUrl = product.imageUrl || product.image || product.thumbUrl || 
             media.imageUrl || media.smallImageUrl || media.thumbUrl || '';
    
    if (!imageUrl && (product.styleId || product.sku || sku)) {
      const styleId = product.styleId || product.sku || sku;
      imageUrl = `https://images.stockx.com/images/${styleId}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&trim=color&q=90`;
    }
    
    res.status(200).json({
      name: product.productName || product.title || product.name || product.shortDescription || '',
      image: imageUrl,
      sku: product.styleId || product.sku || sku,
      brand: product.brand || product.brandName || '',
      colorway: product.colorway || product.color || '',
      retailPrice: product.retailPrice || product.msrp || 0
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to lookup product: ' + error.message });
  }
}
