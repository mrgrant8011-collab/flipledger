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
        const salePrice = parseFloat(lineItem.total?.value || lineItem.lineItemCost?.value || 0);
        
        const sale = {
          // Use same ID format as CSV import: 'ebay_' + orderNumber
          id: `ebay_${order.orderId}`,
          orderId: order.orderId,
          orderNumber: order.orderId, // Match CSV field name for duplicate detection
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || lineItem.legacyItemId || '',
          size: '', // eBay doesn't always have size
          quantity: lineItem.quantity || 1,
          salePrice: salePrice,
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyerUsername: order.buyer?.username || '',
          buyer: order.buyer?.username || '',
          // Fees will be updated below, payout calculated after
          fees: 0,
          payout: 0, // Will be: salePrice - fees
          cost: 0, // User needs to provide cost
          profit: 0,
          image: lineItem.image?.imageUrl || '',
          source: 'api'
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
        
        // Map fees and payout to orders
        for (const tx of transactions) {
          const orderId = tx.orderId;
          
          // Get actual values from eBay - same as CSV columns
          const totalFees = Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
          const netAmount = parseFloat(tx.netAmount?.value || 0); // This is "Net amount" - actual payout
          const grossAmount = parseFloat(tx.amount?.value || 0); // This is "Gross transaction amount"
          
          // Find matching sale and update with real data
          const matchingSale = sales.find(s => s.orderId === orderId);
          if (matchingSale) {
            // Use gross amount from Finances API if available (more accurate)
            if (grossAmount > 0) {
              matchingSale.salePrice = grossAmount;
            }
            matchingSale.fees = totalFees;
            // Use eBay's actual net amount (payout) - same as CSV "Net amount" column
            matchingSale.payout = netAmount > 0 ? netAmount : (matchingSale.salePrice - totalFees);
            matchingSale.profit = matchingSale.payout - matchingSale.cost;
          }
        }
      }
      
      // Also fetch NON_SALE_CHARGE transactions for promoted listing fees
      const adFeesResponse = await fetch(
        `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionType:{NON_SALE_CHARGE},transactionDate:[${start}..${end}]&limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (adFeesResponse.ok) {
        const adFeesData = await adFeesResponse.json();
        const adTransactions = adFeesData.transactions || [];
        
        // Map promoted listing fees to orders
        for (const tx of adTransactions) {
          const orderId = tx.orderId;
          const feeType = (tx.feeType || '').toLowerCase();
          const bookingEntry = (tx.bookingEntry || '').toLowerCase();
          
          // Check if this is a promoted listing fee
          if (orderId && (feeType.includes('ad') || feeType.includes('promot') || bookingEntry.includes('debit'))) {
            const adFeeAmount = Math.abs(parseFloat(tx.amount?.value || 0));
            
            // Find matching sale and add ad fee
            const matchingSale = sales.find(s => s.orderId === orderId);
            if (matchingSale && adFeeAmount > 0) {
              matchingSale.fees = (matchingSale.fees || 0) + adFeeAmount;
              matchingSale.payout = (matchingSale.payout || matchingSale.salePrice) - adFeeAmount;
              matchingSale.profit = matchingSale.payout - matchingSale.cost;
            }
          }
        }
      }
    } catch (feesErr) {
      console.log('Could not fetch fees from Finances API:', feesErr.message);
      // Fees will be estimated in the final loop below
    }
    
    // Ensure all sales have fees and payout calculated
    // If Finances API didn't provide data, estimate fees at 13%
    for (const sale of sales) {
      if (!sale.fees || sale.fees === 0) {
        sale.fees = sale.salePrice * 0.13;
      }
      if (!sale.payout || sale.payout === 0) {
        sale.payout = sale.salePrice - sale.fees;
      }
      sale.profit = sale.payout - sale.cost;
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
