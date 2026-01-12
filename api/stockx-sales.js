export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const startDate = req.query.startDate || `${new Date().getFullYear()}-01-01`;
  const endDate = req.query.endDate || `${new Date().getFullYear()}-12-31`;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    let rawResponse = null;
    let usedEndpoint = '';
    
    // Try the history endpoint first
    const endpoints = [
      'https://api.stockx.com/v2/selling/orders/history',
      'https://api.stockx.com/v2/selling/orders/completed',
      'https://api.stockx.com/v2/selling/orders'
    ];
    
    for (const baseEndpoint of endpoints) {
      pageNumber = 1;
      hasMore = true;
      allOrders = [];
      
      console.log(`[StockX] Trying endpoint: ${baseEndpoint}`);
      
      while (hasMore && pageNumber <= 100) {
        const url = new URL(baseEndpoint);
        // Use correct parameter names from StockX API docs
        url.searchParams.set('pageNumber', pageNumber.toString());
        url.searchParams.set('pageSize', '100');
        
        console.log(`[StockX] Fetching page ${pageNumber}: ${url.toString()}`);
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'x-api-key': process.env.STOCKX_API_KEY,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`[StockX] Response status: ${response.status}`);
        
        if (!response.ok) {
          if (pageNumber === 1) {
            const err = await response.json().catch(() => ({}));
            console.log(`[StockX] Error on ${baseEndpoint}:`, JSON.stringify(err));
            // Try next endpoint
            break;
          }
          hasMore = false;
          break;
        }
        
        const data = await response.json();
        
        // Log the raw response structure on first page
        if (pageNumber === 1) {
          rawResponse = data;
          usedEndpoint = baseEndpoint;
          console.log(`[StockX] SUCCESS with endpoint: ${baseEndpoint}`);
          console.log(`[StockX] Raw response keys:`, Object.keys(data));
          console.log(`[StockX] Raw response sample:`, JSON.stringify(data).substring(0, 2000));
        }
        
        // Try multiple possible response structures
        const orders = data.orders || data.data || data.results || data.items || data.sales || data.orderItems || [];
        
        // If data itself is an array
        const ordersArray = Array.isArray(data) ? data : orders;
        
        console.log(`[StockX] Page ${pageNumber} - Found ${ordersArray.length} orders`);
        
        if (ordersArray.length === 0) {
          hasMore = false;
        } else {
          allOrders = [...allOrders, ...ordersArray];
          if (ordersArray.length < 100) hasMore = false;
          pageNumber++;
        }
      }
      
      // If we found orders, stop trying other endpoints
      if (allOrders.length > 0) {
        console.log(`[StockX] Found ${allOrders.length} orders using ${baseEndpoint}`);
        break;
      }
    }
    
    console.log(`[StockX] Total orders fetched: ${allOrders.length}`);
    
    // If no orders found, return debug info
    if (allOrders.length === 0) {
      return res.status(200).json({ 
        sales: [],
        total: 0,
        startDate,
        endDate,
        totalFetched: 0,
        debug: {
          message: 'No orders found in API response',
          triedEndpoints: endpoints,
          responseKeys: rawResponse ? Object.keys(rawResponse) : [],
          rawSample: rawResponse ? JSON.stringify(rawResponse).substring(0, 500) : null
        }
      });
    }
    
    // Log first order structure
    if (allOrders.length > 0) {
      console.log(`[StockX] First order keys:`, Object.keys(allOrders[0]));
      console.log(`[StockX] First order sample:`, JSON.stringify(allOrders[0]).substring(0, 1000));
    }
    
    // Filter by date range
    const filteredOrders = allOrders.filter(o => {
      const date = (o.createdAt || o.completedAt || o.orderDate || o.date || o.listingDate || '').split('T')[0];
      return date >= startDate && date <= endDate;
    });
    
    console.log(`[StockX] After date filter: ${filteredOrders.length} orders (${startDate} to ${endDate})`);
    
    // Transform with images from SKU
    const sales = filteredOrders.map(order => {
      const product = order.product || order.listing?.product || order.item || order.productInfo || {};
      const variant = order.variant || order.listing?.variant || order.variantInfo || {};
      const payout = order.payout || order.earnings || order.payoutInfo || {};
      
      const sku = product.styleId || product.sku || variant.styleId || order.styleId || order.sku || '';
      const size = variant.size || variant.shoeSize || variant.sizeUS || product.size || order.size || order.variantSize || order.shoeSize || variant.value || order.variantValue || '';
      const name = product.productName || product.title || product.name || order.productName || order.title || order.name || order.productTitle || 'Unknown Product';
      
      const salePrice = order.amount || order.salePrice || order.price || order.soldPrice || order.askPrice || payout.salePrice || 0;
      const payoutAmount = order.payoutAmount || order.payout || payout.totalPayout || payout.payout || order.netPayout || order.earnings || order.totalPayout || 0;
      const saleDate = (order.createdAt || order.completedAt || order.orderDate || order.date || order.listingDate || '').split('T')[0] || '';
      
      return {
        id: order.orderNumber || order.id || order.orderId || order.displayId,
        name,
        sku,
        size: String(size || ''),
        salePrice: Number(salePrice) || 0,
        payout: Number(payoutAmount) || 0,
        saleDate,
        platform: 'StockX'
      };
    });
    
    // Remove duplicates
    const uniqueSales = [...new Map(sales.map(s => [s.id, s])).values()];
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length,
      startDate,
      endDate,
      totalFetched: allOrders.length,
      endpoint: usedEndpoint
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
