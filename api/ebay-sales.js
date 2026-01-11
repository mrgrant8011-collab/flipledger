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
          grossAmount: 0,
          totalExpenses: 0,
          fees: 0,
          payout: 0,
          cost: 0,
          profit: 0,
          image: lineItem.image?.imageUrl || '',
          source: 'api'
        };
      }
    }
    
    console.log('Orders in salesMap:', Object.keys(salesMap));
    
    // Step 2: Get ALL transactions
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
      
      console.log('Total transactions:', transactions.length);
      
      for (const tx of transactions) {
        let orderId = tx.orderId;
        const txType = tx.transactionType;
        const bookingEntry = tx.bookingEntry;
        const memo = tx.transactionMemo || '';
        
        // Try to find orderId from references array
        if (!orderId && tx.references && tx.references.length > 0) {
          for (const ref of tx.references) {
            if (ref.referenceType === 'ORDER_ID' || ref.referenceType === 'ORDER') {
              orderId = ref.referenceId;
              break;
            }
          }
        }
        
        // Try to extract from memo
        if (!orderId && memo) {
          const match = memo.match(/order\s+(\d{2}-\d{5}-\d{5})/i);
          if (match) {
            orderId = match[1];
          }
        }
        
        // Log NON_SALE_CHARGE for debugging
        if (txType === 'NON_SALE_CHARGE') {
          console.log('NON_SALE_CHARGE:', {
            orderId: tx.orderId,
            extractedOrderId: orderId,
            amount: tx.amount?.value,
            memo: memo,
            references: tx.references,
            bookingEntry: bookingEntry,
            inSalesMap: orderId ? !!salesMap[orderId] : false
          });
        }
        
        if (!orderId || !salesMap[orderId]) continue;
        
        const sale = salesMap[orderId];
        const amount = parseFloat(tx.amount?.value || 0);
        const totalFee = Math.abs(parseFloat(tx.totalFeeAmount?.value || 0));
        
        if (txType === 'SALE') {
          sale.grossAmount = amount;
          sale.totalExpenses += totalFee;
          console.log(`SALE ${orderId}: gross=${amount}, ebayFees=${totalFee}`);
        }
        
        if (txType === 'NON_SALE_CHARGE') {
          const feeAmount = Math.abs(amount);
          sale.totalExpenses += feeAmount;
          console.log(`NON_SALE_CHARGE ${orderId}: promotedFee=${feeAmount}, newTotalExpenses=${sale.totalExpenses}`);
        }
      }
    }
    
    // Step 3: Calculate payout = Gross - Expenses
    const sales = Object.values(salesMap);
    
    for (const sale of sales) {
      if (sale.grossAmount > 0) {
        sale.payout = sale.grossAmount - sale.totalExpenses;
        sale.fees = sale.totalExpenses;
        sale.salePrice = sale.grossAmount;
        console.log(`FINAL ${sale.orderId}: gross=${sale.grossAmount}, expenses=${sale.totalExpenses}, payout=${sale.payout}`);
      } else {
        sale.fees = sale.salePrice * 0.15;
        sale.payout = sale.salePrice * 0.85;
      }
      
      sale.profit = sale.payout - sale.cost;
      delete sale.grossAmount;
      delete sale.totalExpenses;
    }
    
    res.status(200).json({ success: true, count: sales.length, sales });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
