// eBay Sales - v117 - Match AD_FEE by ORDER_ID (not Item ID!)
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
  const start = startDate || new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // 1. Get orders from Fulfillment API
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
    
    // 2. Get SALE transactions from Finances API
    let salesTxMap = new Map();
    let financesWorked = false;
    try {
      const salesResponse = await fetch(
        `https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&filter=transactionType:{SALE}&limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (salesResponse.ok) {
        const salesData = await salesResponse.json();
        financesWorked = true;
        if (salesData.transactions) {
          for (const tx of salesData.transactions) {
            if (tx.orderId && tx.amount) {
              salesTxMap.set(tx.orderId, {
                payout: parseFloat(tx.amount.value || 0),
                totalFees: parseFloat(tx.totalFeeAmount?.value || 0)
              });
            }
          }
        }
      }
    } catch (e) {
      console.log('Finances SALE API failed:', e.message);
    }
    
    // 3. Get NON_SALE_CHARGE transactions - map by ORDER_ID not Item ID!
    let adFeesByOrderId = new Map();
    try {
      const chargesResponse = await fetch(
        `https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&filter=transactionType:{NON_SALE_CHARGE}&limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        }
      );
      
      if (chargesResponse.ok) {
        const chargesData = await chargesResponse.json();
        if (chargesData.transactions) {
          for (const tx of chargesData.transactions) {
            if (tx.feeType === 'AD_FEE' && tx.references) {
              // Find ORDER_ID in references
              for (const ref of tx.references) {
                if (ref.referenceType === 'ORDER_ID') {
                  const orderId = ref.referenceId;
                  const fee = Math.abs(parseFloat(tx.amount?.value || 0));
                  adFeesByOrderId.set(orderId, (adFeesByOrderId.get(orderId) || 0) + fee);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('Finances NON_SALE_CHARGE API failed:', e.message);
    }
    
    // 4. Build sales from orders
    const sales = [];
    for (const order of orders) {
      if (order.orderPaymentStatus !== 'PAID' && order.orderPaymentStatus !== 'FULLY_REFUNDED') continue;
      
      for (const lineItem of order.lineItems || []) {
        const salePrice = parseFloat(order.pricingSummary?.total?.value || lineItem.total?.value || 0);
        const baseFees = parseFloat(order.totalMarketplaceFee?.value || 0);
        const itemId = lineItem.legacyItemId || '';
        
        let payout;
        let adFee = adFeesByOrderId.get(order.orderId) || 0;
        let note = '';
        
        // Use Finances API payout if available
        if (salesTxMap.has(order.orderId)) {
          payout = salesTxMap.get(order.orderId).payout;
          if (adFee > 0) {
            payout = payout - adFee;
            note = `Exact payout minus AD_FEE ($${adFee.toFixed(2)})`;
          } else {
            note = 'Exact payout from Finances API';
          }
        } else {
          // Fallback
          payout = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
          if (adFee > 0) {
            payout = payout - adFee;
            note = `Payout minus AD_FEE ($${adFee.toFixed(2)})`;
          } else {
            note = 'Payout (no AD_FEE found)';
          }
        }
        
        sales.push({
          id: `ebay_${order.orderId}`,
          orderId: order.orderId,
          platform: 'eBay',
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || itemId || '',
          size: '',
          quantity: lineItem.quantity || 1,
          salePrice: salePrice,
          saleDate: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          buyer: order.buyer?.username || '',
          fees: baseFees + adFee,
          payout: payout,
          adFee: adFee,
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
      financesWorked: financesWorked,
      adFeesMatched: adFeesByOrderId.size,
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
