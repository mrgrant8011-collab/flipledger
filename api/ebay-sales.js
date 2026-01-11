// eBay Sales - Calculate TRUE Order Earnings
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
    
    // Build sales map with order details
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
          // Will be calculated from transactions
          credits: 0,  // Money IN
          debits: 0,   // Money OUT (fees, etc)
          fees: 0,
          payout: 0,
          cost: 0,
          profit: 0,
          image: lineItem.image?.imageUrl || '',
          source: 'api'
        };
      }
    }
    
    console.log('Orders found:', Object.keys(salesMap).length);
    
    // Step 2: Get ALL transactions from Finances API
    // We need to get all types to calculate true Order Earnings
    const allTransactions = [];
    
    // Fetch transactions - this gets SALE, NON_SALE_CHARGE, etc all at once
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const txResponse = await fetch(
        `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&limit=200&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (!txResponse.ok) {
        console.log('Finances API error:', txResponse.status);
        break;
      }
      
      const txData = await txResponse.json();
      const transactions = txData.transactions || [];
      allTransactions.push(...transactions);
      
      // Check if there are more pages
      if (transactions.length < 200) {
        hasMore = false;
      } else {
        offset += 200;
      }
    }
    
    console.log('Total transactions fetched:', allTransactions.length);
    
    // Step 3: Process transactions and calculate Order Earnings
    // Order Earnings = Sum of CREDITS - Sum of DEBITS for each order
    for (const tx of allTransactions) {
      const orderId = tx.orderId;
      if (!orderId || !salesMap[orderId]) continue;
      
      const sale = salesMap[orderId];
      const amount = Math.abs(parseFloat(tx.amount?.value || 0));
      const bookingEntry = tx.bookingEntry; // CREDIT or DEBIT
      const txType = tx.transactionType;
      
      if (bookingEntry === 'CREDIT') {
        sale.credits += amount;
      } else if (bookingEntry === 'DEBIT') {
        sale.debits += amount;
      }
      
      // Track fees from totalFeeAmount
      if (tx.totalFeeAmount?.value) {
        sale.fees += Math.abs(parseFloat(tx.totalFeeAmount.value));
      }
      
      // Update salePrice from SALE transaction
      if (txType === 'SALE' && amount > 0) {
        sale.salePrice = amount;
      }
      
      console.log(`${orderId} | ${txType} | ${bookingEntry} | $${amount}`);
    }
    
    // Step 4: Calculate final payout (Order Earnings)
    const sales = Object.values(salesMap);
    
    for (const sale of sales) {
      if (sale.credits > 0 || sale.debits > 0) {
        // Order Earnings = Credits - Debits
        sale.payout = sale.credits - sale.debits;
      } else {
        // Fallback: estimate 85% payout
        sale.payout = sale.salePrice * 0.85;
        sale.fees = sale.salePrice * 0.15;
      }
      
      sale.profit = sale.payout - sale.cost;
      
      // Clean up
      delete sale.credits;
      delete sale.debits;
    }
    
    // Log sample for verification
    if (sales.length > 0) {
      console.log('=== SAMPLE SALE ===');
      console.log('Name:', sales[0].name?.substring(0, 40));
      console.log('Sale Price:', sales[0].salePrice);
      console.log('Fees:', sales[0].fees);
      console.log('Payout (Order Earnings):', sales[0].payout);
    }
    
    res.status(200).json({ success: true, count: sales.length, sales });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
