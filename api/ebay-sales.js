// eBay Sales - Fulfillment API for images + Finances API (apiz.ebay.com) for exact payouts
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  const { startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString();
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // 1. Get orders from Fulfillment API (for images and order details)
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
      return res.status(ordersResponse.status).json({ error: 'Failed to fetch orders', details: errorText });
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    // 2. Try to get transactions from Finances API (apiz.ebay.com!) for exact payouts
    let financesData = null;
    try {
      const financesResponse = await fetch(
        `https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&filter=transactionType:{SALE}&limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (financesResponse.ok) {
        financesData = await financesResponse.json();
      }
    } catch (e) {
      console.log('Finances API failed, using Fulfillment only');
    }
    
    // Build a map of orderId -> payout amount from Finances API
    const payoutMap = new Map();
    if (financesData && financesData.transactions) {
      for (const tx of financesData.transactions) {
        if (tx.orderId && tx.amount) {
          payoutMap.set(tx.orderId, parseFloat(tx.amount.value || 0));
        }
      }
    }
    
    // 3. Build sales from orders, using Finances payout if available
    const sales = [];
    for (const order of orders) {
      if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULLY_REFUNDED') continue;
      
      for (const lineItem of order.lineItems || []) {
        const salePrice = parseFloat(order.pricingSummary?.total?.value || lineItem.total?.value || 0);
        const fees = parseFloat(order.totalMarketplaceFee?.value || 0);
        
        // Use Finances API payout if available, otherwise fall back to totalDueSeller
        let payout;
        let note = '';
        
        if (payoutMap.has(order.orderId)) {
          payout = payoutMap.get(order.orderId);
          note = 'Exact payout from Finances API';
        } else {
          payout = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
          note = 'Payout excludes promoted listing fees (use CSV for exact)';
        }
        
        sales.push({
          id: `ebay_${order.orderId}`,
          orderId: order.orderId,
          orderNumber: order.orderId,
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || lineItem.legacyItemId || '',
          size: '',
          quantity: lineItem.quantity || 1,
          salePrice: salePrice,
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyer: order.buyer?.username || '',
          fees: fees,
          payout: payout,
          cost: 0,
          profit: payout,
          image: lineItem.image?.imageUrl || '',
          source: 'api',
          note: note
        });
      }
    }
    
    res.status(200).json({ 
      success: true, 
      count: sales.length, 
      financesApiWorked: payoutMap.size > 0,
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
