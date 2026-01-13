export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    
    while (hasMore && pageNumber <= 10) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('pageNumber', pageNumber.toString());
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('orderStatus', 'COMPLETED');
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'x-api-key': process.env.STOCKX_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (pageNumber === 1) {
          return res.status(response.status).json({ error: err.message || 'API Error' });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || [];
      
      // LOG EVERYTHING FROM FIRST ORDER
      if (pageNumber === 1 && orders.length > 0) {
        const o = orders[0];
        console.log(`[StockX] === FULL ORDER STRUCTURE ===`);
        console.log(`[StockX] Order keys: ${Object.keys(o).join(', ')}`);
        console.log(`[StockX] Product keys: ${Object.keys(o.product || {}).join(', ')}`);
        console.log(`[StockX] Variant keys: ${Object.keys(o.variant || {}).join(', ')}`);
        console.log(`[StockX] Full product: ${JSON.stringify(o.product)}`);
        console.log(`[StockX] Full variant: ${JSON.stringify(o.variant)}`);
        
        // Check every possible image field
        const p = o.product || {};
        const v = o.variant || {};
        const m = p.media || {};
        
        console.log(`[StockX] --- Checking all image fields ---`);
        console.log(`[StockX] product.image: ${p.image}`);
        console.log(`[StockX] product.imageUrl: ${p.imageUrl}`);
        console.log(`[StockX] product.thumbUrl: ${p.thumbUrl}`);
        console.log(`[StockX] product.thumbnailUrl: ${p.thumbnailUrl}`);
        console.log(`[StockX] product.primaryImage: ${p.primaryImage}`);
        console.log(`[StockX] product.squareImage: ${p.squareImage}`);
        console.log(`[StockX] product.media: ${JSON.stringify(m)}`);
        console.log(`[StockX] product.urlKey: ${p.urlKey}`);
        console.log(`[StockX] product.slug: ${p.slug}`);
        console.log(`[StockX] product.productId: ${p.productId}`);
        console.log(`[StockX] product.styleId: ${p.styleId}`);
        console.log(`[StockX] product.productName: ${p.productName}`);
        console.log(`[StockX] variant.image: ${v.image}`);
        console.log(`[StockX] order.image: ${o.image}`);
      }
      
      if (orders.length === 0) {
        hasMore = false;
      } else {
        allOrders = [...allOrders, ...orders];
        if (!data.hasNextPage || orders.length < 100) {
          hasMore = false;
        } else {
          pageNumber++;
        }
      }
    }
    
    console.log(`[StockX] Fetched ${allOrders.length} orders`);
    
    const sales = allOrders.map(order => {
      const product = order.product || {};
      const variant = order.variant || {};
      const payout = order.payout || {};
      const media = product.media || {};
      
      let platform = 'StockX Standard';
      if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
      else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
      
      const sku = product.styleId || '';
      const productName = product.productName || '';
      
      // Try EVERY possible image source
      let image = 
        product.image ||
        product.imageUrl ||
        product.thumbUrl ||
        product.thumbnailUrl ||
        product.primaryImage ||
        product.squareImage ||
        media.imageUrl ||
        media.smallImageUrl ||
        media.thumbUrl ||
        variant.image ||
        order.image ||
        '';
      
      // If no direct image, try URL patterns
      if (!image) {
        const urlKey = product.urlKey || product.slug || '';
        const productId = product.productId || '';
        
        if (urlKey) {
          image = `https://images.stockx.com/images/${urlKey}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        } else if (productId) {
          image = `https://images.stockx.com/images/${productId}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        } else if (sku) {
          image = `https://images.stockx.com/images/${sku}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        }
      }
      
      return {
        id: order.orderNumber,
        name: productName || 'Unknown Product',
        sku,
        size: variant.variantValue || '',
        salePrice: parseFloat(order.amount) || 0,
        payout: parseFloat(payout.totalPayout) || 0,
        saleDate: (order.createdAt || '').split('T')[0],
        platform,
        image
      };
    });
    
    const uniqueSales = [...new Map(sales.map(s => [s.id, s])).values()];
    const withImages = uniqueSales.filter(s => s.image).length;
    
    console.log(`[StockX] Returning ${uniqueSales.length} sales (${withImages} with image URLs)`);
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
