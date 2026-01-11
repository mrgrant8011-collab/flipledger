// Debug endpoint - see raw eBay order data
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Get orders from Fulfillment API (this works)
    const ordersResponse = await fetch(
      `https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[${start}..${end}]&limit=50`,
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
      return res.status(ordersResponse.status).json({ 
        error: 'Fulfillment API Failed', 
        status: ordersResponse.status,
        details: errorText
      });
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    // Return first 3 orders with ALL their data
    res.status(200).json({
      totalOrders: orders.length,
      sampleOrders: orders.slice(0, 3).map(o => ({
        orderId: o.orderId,
        creationDate: o.creationDate,
        orderPaymentStatus: o.orderPaymentStatus,
        pricingSummary: o.pricingSummary,
        paymentSummary: o.paymentSummary,
        totalFeeBasisAmount: o.totalFeeBasisAmount,
        totalMarketplaceFee: o.totalMarketplaceFee,
        lineItems: o.lineItems?.map(li => ({
          title: li.title,
          lineItemId: li.lineItemId,
          legacyItemId: li.legacyItemId,
          total: li.total,
          lineItemCost: li.lineItemCost,
          deliveryCost: li.deliveryCost,
          lineItemFulfillmentInstructions: li.lineItemFulfillmentInstructions
        }))
      }))
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
