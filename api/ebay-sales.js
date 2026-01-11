// eBay Sales - Fetch sold items with fees
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  
  // Get date range from query params (default: last 90 days)
  const { startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString();
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Fetch orders (sold items) from Fulfillment API
    const ordersResponse = await fetch(
      `https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[${start}..${end}]&limit=200`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error('eBay orders error:', errorText);
      return res.status(ordersResponse.status).json({ error: 'Failed to fetch orders', details: errorText });
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    // Transform orders into sales format
    const sales = [];
    
    for (const order of orders) {
      // Only include completed/paid orders
      if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULLY_REFUNDED') {
        continue;
      }
      
      for (const lineItem of order.lineItems || []) {
        const sale = {
          id: `ebay-${order.orderId}-${lineItem.lineItemId}`,
          orderId: order.orderId,
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || lineItem.legacyItemId || '',
          size: '', // eBay doesn't always have size
          quantity: lineItem.quantity || 1,
          salePrice: parseFloat(lineItem.total?.value || lineItem.lineItemCost?.value || 0),
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyerUsername: order.buyer?.username || '',
          // We'll fetch fees separately or estimate
          fees: 0,
          cost: 0, // User needs to provide cost
          profit: 0,
          image: lineItem.image?.imageUrl || ''
        };
        
        sales.push(sale);
      }
    }
    
    // Try to fetch transaction fees from Finances API
    try {
      const financesResponse = await fetch(
        `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionType:{SALE},transactionDate:[${start}..${end}]&limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (financesResponse.ok) {
        const financesData = await financesResponse.json();
        const transactions = financesData.transactions || [];
        
        // Map fees to orders
        for (const tx of transactions) {
          const orderId = tx.orderId;
          const totalFees = (tx.totalFeeAmount?.value || 0) * -1; // Fees are negative
          
          // Find matching sale and add fees
          const matchingSale = sales.find(s => s.orderId === orderId);
          if (matchingSale) {
            matchingSale.fees = Math.abs(parseFloat(totalFees));
            matchingSale.profit = matchingSale.salePrice - matchingSale.fees - matchingSale.cost;
          }
        }
      }
    } catch (feesErr) {
      console.log('Could not fetch fees, using estimates:', feesErr.message);
      // Estimate fees at ~13% if we can't get real data
      for (const sale of sales) {
        if (sale.fees === 0) {
          sale.fees = sale.salePrice * 0.13;
          sale.profit = sale.salePrice - sale.fees - sale.cost;
        }
      }
    }
    
    res.status(200).json({
      success: true,
      count: sales.length,
      sales: sales
    });
    
  } catch (err) {
    console.error('eBay sales fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
