// eBay Sales - Fetch sold items with TRUE Order Earnings
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
    
    // Build map of orderId -> sale data
    const salesMap = {};
    
    for (const order of orders) {
      // Only include completed/paid orders
      if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULLY_REFUNDED') {
        continue;
      }
      
      for (const lineItem of order.lineItems || []) {
        const orderId = order.orderId;
        const salePrice = parseFloat(lineItem.total?.value || lineItem.lineItemCost?.value || 0);
        
        salesMap[orderId] = {
          id: `ebay_${orderId}`,
          orderId: orderId,
          orderNumber: orderId,
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || lineItem.legacyItemId || '',
          size: '',
          quantity: lineItem.quantity || 1,
          salePrice: salePrice,
          grossAmount: salePrice, // Will update from Finances API
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyerUsername: order.buyer?.username || '',
          buyer: order.buyer?.username || '',
          // These will be calculated from ALL transactions
          totalCredits: 0,    // Money IN (sale amount)
          totalDebits: 0,     // Money OUT (fees, shipping labels, etc.)
          fees: 0,
          payout: 0,
          cost: 0,
          profit: 0,
          image: lineItem.image?.imageUrl || '',
          source: 'api',
          _transactions: []   // Store all transactions for debugging
        };
      }
    }
    
    // Fetch ALL transaction types from Finances API
    // This includes: SALE, NON_SALE_CHARGE, SHIPPING_LABEL, REFUND, etc.
    const transactionTypes = ['SALE', 'NON_SALE_CHARGE', 'SHIPPING_LABEL', 'REFUND', 'CREDIT', 'DISPUTE'];
    
    for (const txType of transactionTypes) {
      try {
        const txResponse = await fetch(
          `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionType:{${txType}},transactionDate:[${start}..${end}]&limit=200`,
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
          
          console.log(`${txType} transactions:`, transactions.length);
          
          for (const tx of transactions) {
            const orderId = tx.orderId;
            if (!orderId || !salesMap[orderId]) continue;
            
            const amount = parseFloat(tx.amount?.value || 0);
            const netAmount = parseFloat(tx.netAmount?.value || 0);
            const totalFee = Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
            const bookingEntry = tx.bookingEntry || '';
            
            // Track this transaction
            salesMap[orderId]._transactions.push({
              type: txType,
              amount: amount,
              netAmount: netAmount,
              fee: totalFee,
              booking: bookingEntry
            });
            
            // Sum up based on booking entry (CREDIT = money in, DEBIT = money out)
            if (bookingEntry === 'CREDIT') {
              salesMap[orderId].totalCredits += amount;
            } else if (bookingEntry === 'DEBIT') {
              salesMap[orderId].totalDebits += Math.abs(amount);
            }
            
            // For SALE transactions, get the gross amount
            if (txType === 'SALE' && amount > 0) {
              salesMap[orderId].grossAmount = amount;
              salesMap[orderId].salePrice = amount;
              salesMap[orderId].fees += totalFee;
            }
            
            // For fees and charges, add to total debits
            if (txType === 'NON_SALE_CHARGE' || txType === 'SHIPPING_LABEL') {
              salesMap[orderId].fees += Math.abs(amount);
            }
          }
        }
      } catch (err) {
        console.log(`Error fetching ${txType}:`, err.message);
      }
    }
    
    // Calculate TRUE payout (Order Earnings) for each sale
    const sales = Object.values(salesMap);
    
    for (const sale of sales) {
      // Order Earnings = Total Credits - Total Debits
      // OR = Gross Amount - All Fees
      if (sale.totalCredits > 0 || sale.totalDebits > 0) {
        sale.payout = sale.totalCredits - sale.totalDebits;
        sale._hasFinanceData = true;
      } else if (sale.fees > 0) {
        sale.payout = sale.salePrice - sale.fees;
        sale._hasFinanceData = true;
      } else {
        // Fallback: estimate at 85% (15% total fees including ads)
        sale.fees = sale.salePrice * 0.15;
        sale.payout = sale.salePrice * 0.85;
        sale._hasFinanceData = false;
      }
      
      sale.profit = sale.payout - sale.cost;
      
      // Clean up debug data
      delete sale._transactions;
      delete sale.totalCredits;
      delete sale.totalDebits;
      delete sale.grossAmount;
    }
    
    console.log('Total sales:', sales.length);
    console.log('Sales with Finance data:', sales.filter(s => s._hasFinanceData).length);
    
    if (sales.length > 0) {
      console.log('Sample sale:', {
        name: sales[0].name?.substring(0, 30),
        salePrice: sales[0].salePrice,
        fees: sales[0].fees,
        payout: sales[0].payout
      });
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
