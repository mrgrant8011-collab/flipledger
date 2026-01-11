// eBay Sales - Fulfillment API for images + Finances API for exact payouts (including AD_FEE)
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
                totalFees: parseFloat(tx.totalFeeAmount?.value || 0),
                itemIds: (tx.orderLineItems || []).map(li => li.lineItemId)
              });
            }
          }
        }
      }
    } catch (e) {
      console.log('Finances SALE API failed:', e.message);
    }
    
    // 3. Get NON_SALE_CHARGE transactions (AD_FEE comes here!)
    let adFeesByItemId = new Map();
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
            // AD_FEE has feeType and references with ITEM_ID
            if (tx.feeType === 'AD_FEE' && tx.references) {
              for (const ref of tx.references) {
                if (ref.referenceType === 'ITEM_ID') {
                  const itemId = ref.referenceId;
                  const fee = parseFloat(tx.amount?.value || 0);
                  adFeesByItemId.set(itemId, (adFeesByItemId.get(itemId) || 0) + fee);
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
        const itemId = lineItem.legacyItemId || lineItem.lineItemId;
        
        let payout;
        let adFee = 0;
        let note = '';
        
        // Check if we have Finances API data for this order
        if (salesTxMap.has(order.orderId)) {
          const txData = salesTxMap.get(order.orderId);
          payout = txData.payout;
          
          // Look for AD_FEE for this item
          if (adFeesByItemId.has(itemId)) {
            adFee = adFeesByItemId.get(itemId);
            payout = payout - adFee; // Subtract ad fee from payout
            note = `Exact payout (AD_FEE: $${adFee.toFixed(2)} deducted)`;
          } else {
            note = 'Exact payout from Finances API';
          }
        } else {
          // Fallback to Fulfillment API
          payout = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
          
          // Still check for ad fees
          if (adFeesByItemId.has(itemId)) {
            adFee = adFeesByItemId.get(itemId);
            payout = payout - adFee;
            note = `Payout adjusted for AD_FEE: $${adFee.toFixed(2)}`;
          } else {
            note = 'Payout may exclude promoted listing fees';
          }
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
      financesApiWorked: financesWorked,
      adFeesFound: adFeesByItemId.size,
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
