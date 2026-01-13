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
        console.log(`[StockX] API Error:`, JSON.stringify(err));
        if (pageNumber === 1) {
          return res.status(response.status).json({ error: err.message || 'API Error' });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || [];
      
      // Log first order structure to see all available fields
      if (pageNumber === 1 && orders.length > 0) {
        console.log(`[StockX] Sample order keys:`, Object.keys(orders[0]));
        console.log(`[StockX] Sample product:`, JSON.stringify(orders[0].product));
        console.log(`[StockX] Total COMPLETED: ${data.count}`);
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
      
      let platform = 'StockX Standard';
      if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
      else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
      
      const sku = product.styleId || '';
      
      // Try to find image URL from various possible fields
      let image = '';
      if (product.image) {
        image = product.image;
      } else if (product.imageUrl) {
        image = product.imageUrl;
      } else if (product.media?.imageUrl) {
        image = product.media.imageUrl;
      } else if (product.media?.smallImageUrl) {
        image = product.media.smallImageUrl;
      } else if (product.thumbUrl) {
        image = product.thumbUrl;
      }
      
      return {
        id: order.orderNumber,
        name: product.productName || 'Unknown Product',
        sku,
        size: variant.variantValue || '',
        salePrice: parseFloat(order.amount) || 0,
        payout: parseFloat(payout.totalPayout) || 0,
        saleDate: (order.createdAt || '').split('T')[0],
        platform,
        image,
        productId: product.productId || ''
      };
    });
    
    const uniqueSales = [...new Map(sales.map(s => [s.id, s])).values()];
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
