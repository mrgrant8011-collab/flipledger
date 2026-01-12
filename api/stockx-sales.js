export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    
    // Fetch up to 10 pages (1,000 orders)
    while (hasMore && pageNumber <= 10) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('pageNumber', pageNumber.toString());
      url.searchParams.set('pageSize', '100');
      
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
        console.log(`[StockX] Error:`, JSON.stringify(err));
        if (pageNumber === 1) {
          return res.status(response.status).json({ error: err.message || 'API Error' });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || [];
      
      if (pageNumber === 1) {
        console.log(`[StockX] Total orders in account: ${data.count}`);
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
    
    // Transform orders - only completed sales
    const sales = allOrders
      .filter(order => order.status === 'COMPLETED')
      .map(order => {
        const product = order.product || {};
        const variant = order.variant || {};
        const payout = order.payout || {};
        
        // Determine platform type
        let platform = 'StockX Standard';
        if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
        else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
        
        // Build image URL from SKU
        const sku = product.styleId || '';
        const image = sku ? `https://images.stockx.com/images/${sku}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90` : '';
        
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
    
    // Remove duplicates
    const uniqueSales = [...new Map(sales.map(s => [s.id, s])).values()];
    
    console.log(`[StockX] Returning ${uniqueSales.length} completed sales with images`);
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
