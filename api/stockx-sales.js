export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    
    // Step 1: Fetch orders
    while (hasMore && pageNumber <= 10) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('pageNumber', pageNumber.toString());
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('orderStatus', 'COMPLETED');
      
      console.log(`[StockX] Fetching page ${pageNumber}`);
      
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
      
      if (pageNumber === 1) {
        console.log(`[StockX] Total COMPLETED: ${data.count}`);
        if (orders.length > 0) {
          console.log(`[StockX] Sample order product:`, JSON.stringify(orders[0].product));
        }
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
    
    // Step 2: Get unique SKUs
    const uniqueSkus = [...new Set(allOrders.map(o => o.product?.styleId).filter(Boolean))];
    console.log(`[StockX] Looking up ${uniqueSkus.length} unique SKUs`);
    
    // Step 3: Lookup images using catalog API with user auth
    const skuImages = {};
    
    for (let i = 0; i < uniqueSkus.length; i += 5) {
      const batch = uniqueSkus.slice(i, i + 5);
      
      await Promise.all(batch.map(async (sku) => {
        try {
          const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(sku)}`;
          const searchRes = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'x-api-key': process.env.STOCKX_API_KEY,
              'Content-Type': 'application/json'
            }
          });
          
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const products = searchData.products || searchData.data || searchData.results || searchData.hits || [];
            
            if (products.length > 0) {
              const product = products.find(p => 
                (p.styleId || '').toLowerCase() === sku.toLowerCase()
              ) || products[0];
              
              const media = product.media || {};
              const image = product.imageUrl || product.image || product.thumbUrl || 
                           media.imageUrl || media.smallImageUrl || media.thumbUrl || '';
              
              if (image) {
                skuImages[sku] = image;
              }
            }
          } else {
            const errData = await searchRes.json().catch(() => ({}));
            if (i === 0) {
              console.log(`[StockX] Catalog search error for ${sku}:`, searchRes.status, JSON.stringify(errData));
            }
          }
        } catch (e) {
          // Ignore individual lookup errors
        }
      }));
      
      // Small delay to avoid rate limiting
      if (i + 5 < uniqueSkus.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    
    console.log(`[StockX] Found images for ${Object.keys(skuImages).length} of ${uniqueSkus.length} SKUs`);
    
    // Step 4: Transform orders
    const sales = allOrders.map(order => {
      const product = order.product || {};
      const variant = order.variant || {};
      const payout = order.payout || {};
      
      let platform = 'StockX Standard';
      if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
      else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
      
      const sku = product.styleId || '';
      const image = skuImages[sku] || '';
      
      return {
        id: order.orderNumber,
        name: product.productName || 'Unknown Product',
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
    
    console.log(`[StockX] Returning ${uniqueSales.length} sales (${withImages} with images)`);
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
