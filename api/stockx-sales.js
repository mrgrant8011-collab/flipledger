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
    
    // Simple pagination - fetch all pages
    while (hasMore && pageNumber <= 100) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('limit', '100');
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('page', pageNumber.toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'x-api-key': process.env.STOCKX_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (pageNumber === 1) {
          const err = await response.json().catch(() => ({}));
          return res.status(response.status).json({ error: err.message || 'API Error' });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || data.data || [];
      
      if (orders.length === 0) {
        hasMore = false;
      } else {
        allOrders = [...allOrders, ...orders];
        if (orders.length < 100) hasMore = false;
        pageNumber++;
      }
    }
    
    // Filter by date range
    const filteredOrders = allOrders.filter(o => {
      const date = (o.createdAt || o.completedAt || '').split('T')[0];
      return date >= startDate && date <= endDate;
    });
    
    // Transform with images from SKU
    const sales = filteredOrders.map(order => {
      const product = order.product || order.listing?.product || {};
      const variant = order.variant || order.listing?.variant || {};
      const payout = order.payout || {};
      
      const sku = product.styleId || product.sku || variant.styleId || order.styleId || '';
      const size = variant.size || variant.shoeSize || variant.sizeUS || product.size || order.size || order.variantSize || order.shoeSize || variant.value || '';
      const name = product.productName || product.title || product.name || order.productName || 'Unknown Product';
      
      const salePrice = order.amount || order.salePrice || order.price || payout.salePrice || 0;
      const payoutAmount = order.payoutAmount || payout.totalPayout || payout.payout || order.netPayout || 0;
      const saleDate = (order.createdAt || order.completedAt || '').split('T')[0] || '';
      
      return {
        id: order.orderNumber || order.id,
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
      totalFetched: allOrders.length
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
