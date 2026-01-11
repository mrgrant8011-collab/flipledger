// eBay Sales - Calculate TRUE Order Earnings (matching CSV logic)
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
    // Step 1: Get orders from Fulfillment API
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
    
    // Build sales map - just basic info from orders
    const salesMap = {};
    for (const order of orders) {
      if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULLY_REFUNDED') continue;
      
      for (const lineItem of order.lineItems || []) {
        salesMap[order.orderId] = {
          id: `ebay_${order.orderId}`,
          orderId: order.orderId,
          orderNumber: order.orderId,
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || lineItem.legacyItemId || '',
          size: '',
          quantity: lineItem.quantity || 1,
          salePrice: parseFloat(lineItem.total?.value || 0),
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyer: order.buyer?.username || '',
          // For calculation - same as CSV
          grossAmount: 0,
          totalExpenses: 0,  // ALL fees combined
          fees: 0,
          payout: 0,
          cost: 0,
          profit: 0,
          image: lineItem.image?.imageUrl || '',
          source: 'api'
        };
      }
    }
    
    // Step 2: Get ALL transactions and sum by order
    // This matches how CSV calculates: Gross - Expenses = Order Earnings
    const txResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&limit=1000`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (txResponse.ok) {
      const txData = await txResponse.json();
      const transactions = txData.transactions || [];
      
      for (const tx of transactions) {
        const orderId = tx.orderId;
        if (!orderId || !salesMap[orderId]) continue;
        
        const sale = salesMap[orderId];
        const amount = parseFloat(tx.amount?.value || 0);
        const totalFee = Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
        const txType = tx.transactionType;
        const bookingEntry = tx.bookingEntry;
        
        // SALE transaction = gross amount + eBay fees
        if (txType === 'SALE') {
          sale.grossAmount = amount;
          sale.totalExpenses += totalFee;  // Add eBay fees
        }
        
        // NON_SALE_CHARGE = promoted listing fee and other fees
        // These are DEBIT entries that reduce your payout
        if (txType === 'NON_SALE_CHARGE' && bookingEntry === 'DEBIT') {
          sale.totalExpenses += Math.abs(amount);  // Add promoted fees
        }
      }
    }
    
    // Step 3: Calculate payout same as CSV: Gross - Expenses = Order Earnings
    const sales = Object.values(salesMap);
    
    for (const sale of sales) {
      if (sale.grossAmount > 0) {
        // ORDER EARNINGS = GROSS - ALL EXPENSES (same as CSV!)
        sale.payout = sale.grossAmount - sale.totalExpenses;
        sale.fees = sale.totalExpenses;
        sale.salePrice = sale.grossAmount;
      } else {
        // Fallback
        sale.fees = sale.salePrice * 0.15;
        sale.payout = sale.salePrice * 0.85;
      }
      
      sale.profit = sale.payout - sale.cost;
      
      // Clean up
      delete sale.grossAmount;
      delete sale.totalExpenses;
    }
    
    res.status(200).json({ success: true, count: sales.length, sales });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
