// Debug endpoint - test both APIs
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
  
  const results = {
    fulfillmentAPI: null,
    financesAPI: null,
    financesAPIv2: null
  };
  
  try {
    // Test Fulfillment API
    const ordersResponse = await fetch(
      `https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[${start}..${end}]&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (ordersResponse.ok) {
      const data = await ordersResponse.json();
      results.fulfillmentAPI = {
        status: 'OK',
        orderCount: data.orders?.length || 0,
        sampleOrder: data.orders?.[0] ? {
          orderId: data.orders[0].orderId,
          totalDueSeller: data.orders[0].paymentSummary?.totalDueSeller?.value
        } : null
      };
    } else {
      results.fulfillmentAPI = {
        status: 'FAILED',
        code: ordersResponse.status,
        error: await ordersResponse.text()
      };
    }
    
    // Test Finances API - try without filter first
    const txResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/transaction?limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    results.financesAPI = {
      status: txResponse.ok ? 'OK' : 'FAILED',
      code: txResponse.status,
      response: await txResponse.text()
    };
    
    // Try seller_funds_summary endpoint
    const fundsResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/seller_funds_summary`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    results.financesAPIv2 = {
      status: fundsResponse.ok ? 'OK' : 'FAILED',
      code: fundsResponse.status,
      response: await fundsResponse.text()
    };
    
    res.status(200).json(results);
    
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
