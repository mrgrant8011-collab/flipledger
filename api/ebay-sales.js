// eBay Sales - Calculate TRUE Order Earnings (with Promoted Listing fees)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No auth header provided');
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  console.log('Token received, length:', accessToken.length);
  
  const { startDate, endDate } = req.query;
  const end = endDate || new Date().toISOString();
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  console.log('Date range:', start, 'to', end);
  
  try {
    // Step 1: Get orders from Fulfillment API
    console.log('Fetching orders from Fulfillment API...');
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
    
    console.log('Orders response status:', ordersResponse.status);
    
    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.log('Orders API error:', errorText);
      return res.status(ordersResponse.status).json({ error: 'Failed to fetch orders', details: errorText, status: ordersResponse.status });
    }
    
    const ordersData = await ordersResponse.json();
    const orders = ordersData.orders || [];
    
    // Build sales map
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
          // Will be set from transactions
          netAmount: 0,        // From SALE transaction (after eBay fees, BEFORE ad fees)
          promotedFee: 0,      // From NON_SALE_CHARGE (Promoted Listing fee)
          ebayFees: 0,
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
    
    // Step 2: Get SALE transactions
    const saleResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionType:{SALE},transactionDate:[${start}..${end}]&limit=200`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (saleResponse.ok) {
      const saleData = await saleResponse.json();
      const saleTx = saleData.transactions || [];
      
      console.log('SALE transactions:', saleTx.length);
      
      for (const tx of saleTx) {
        const orderId = tx.orderId;
        if (!orderId || !salesMap[orderId]) continue;
        
        const sale = salesMap[orderId];
        sale.salePrice = parseFloat(tx.amount?.value || sale.salePrice);
        sale.netAmount = parseFloat(tx.amount?.value || 0) - Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
        sale.ebayFees = Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
        
        console.log(`SALE ${orderId}: gross=${tx.amount?.value}, fees=${tx.totalFeeAmount?.value}, net=${sale.netAmount}`);
      }
    }
    
    // Step 3: Get NON_SALE_CHARGE transactions (Promoted Listing fees)
    const feeResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionType:{NON_SALE_CHARGE},transactionDate:[${start}..${end}]&limit=200`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (feeResponse.ok) {
      const feeData = await feeResponse.json();
      const feeTx = feeData.transactions || [];
      
      console.log('NON_SALE_CHARGE transactions:', feeTx.length);
      
      for (const tx of feeTx) {
        const orderId = tx.orderId;
        if (!orderId || !salesMap[orderId]) continue;
        
        // This is the Promoted Listing fee (or other non-sale charge)
        const feeAmount = Math.abs(parseFloat(tx.amount?.value || 0));
        const feeType = tx.feeType || tx.transactionMemo || '';
        
        console.log(`NON_SALE_CHARGE ${orderId}: amount=${feeAmount}, type=${feeType}`);
        
        // Add to promoted fee for this order
        salesMap[orderId].promotedFee += feeAmount;
      }
    }
    
    // Step 4: Calculate TRUE Order Earnings
    // Order Earnings = netAmount - promotedFee
    const sales = Object.values(salesMap);
    
    for (const sale of sales) {
      if (sale.netAmount > 0) {
        // TRUE PAYOUT = Net (after eBay fees) - Promoted Listing fee
        sale.payout = sale.netAmount - sale.promotedFee;
        sale.fees = sale.ebayFees + sale.promotedFee;
      } else {
        // Fallback estimate
        sale.fees = sale.salePrice * 0.15;
        sale.payout = sale.salePrice * 0.85;
      }
      
      sale.profit = sale.payout - sale.cost;
      
      console.log(`FINAL ${sale.orderId}: salePrice=${sale.salePrice}, ebayFees=${sale.ebayFees}, promotedFee=${sale.promotedFee}, PAYOUT=${sale.payout}`);
      
      // Clean up internal fields
      delete sale.netAmount;
      delete sale.promotedFee;
      delete sale.ebayFees;
    }
    
    res.status(200).json({ success: true, count: sales.length, sales });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
