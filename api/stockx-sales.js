export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const year = req.query.year || new Date().getFullYear().toString();
  
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
    
    // Filter by selected year
    const yearOrders = allOrders.filter(o => {
      const date = o.createdAt || o.completedAt || '';
      return date.startsWith(year);
    });
    
    // Transform with images from SKU
    const sales = yearOrders.map(order => {
      const product = order.product || order.listing?.product || {};
      const variant = order.variant || order.listing?.variant || {};
      const payout = order.payout || {};
      
      const sku = product.styleId || product.sku || variant.styleId || order.styleId || '';
      const size = variant.size || variant.shoeSize || order.size || order.variantSize || '';
      const name = product.productName || product.title || product.name || order.productName || 'Unknown Product';
      
      // Build image URL from SKU
      const image = sku ? `https://images.stockx.com/images/${sku}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&trim=color&q=90` : '';
      
      const salePrice = order.amount || order.salePrice || order.price || payout.salePrice || 0;
      const payoutAmount = order.payoutAmount || payout.totalPayout || payout.payout || order.netPayout || 0;
      const fees = order.feeAmount || order.fees || payout.totalFees || Math.abs(salePrice - payoutAmount) || 0;
      const saleDate = (order.createdAt || order.completedAt || '').split('T')[0] || '';
      
      return {
        id: order.orderNumber || order.id,
        orderNumber: order.orderNumber || order.id || '',
        name,
        sku,
        size: String(size || ''),
        image,
        salePrice: Number(salePrice) || 0,
        fees: Math.abs(Number(fees)) || 0,
        saleDate,
        platform: 'StockX',
        payout: Number(payoutAmount) || 0
      };
    });
    
    // Remove duplicates
    const uniqueSales = [...new Map(sales.map(s => [s.orderNumber, s])).values()];
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length,
      year,
      totalFetched: allOrders.length
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
