// eBay Sales - v116 with AD_FEE debug info
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
  // Go back further for AD_FEE (they can be charged days after sale)
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
    let financesError = null;
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
      } else {
        financesError = await salesResponse.text();
      }
    } catch (e) {
      financesError = e.message;
    }
    
    // 3. Get ALL NON_SALE_CHARGE transactions to find AD_FEE
    let adFeesByItemId = new Map();
    let adFeesRaw = [];
    let chargesError = null;
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
            // Collect ALL ad fees for debugging
            if (tx.feeType === 'AD_FEE') {
              adFeesRaw.push({
                transactionId: tx.transactionId,
                amount: tx.amount?.value,
                feeType: tx.feeType,
                references: tx.references,
                date: tx.transactionDate
              });
              
              if (tx.references) {
                for (const ref of tx.references) {
                  if (ref.referenceType === 'ITEM_ID') {
                    const itemId = ref.referenceId;
                    const fee = Math.abs(parseFloat(tx.amount?.value || 0));
                    adFeesByItemId.set(itemId, (adFeesByItemId.get(itemId) || 0) + fee);
                  }
                }
              }
            }
          }
        }
      } else {
        chargesError = await chargesResponse.text();
      }
    } catch (e) {
      chargesError = e.message;
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
        let adFee = adFeesByItemId.get(itemId) || 0;
        let note = '';
        
        // Use Finances API payout if available
        if (salesTxMap.has(order.orderId)) {
          payout = salesTxMap.get(order.orderId).payout;
          if (adFee > 0) {
            payout = payout - adFee;
            note = `Finances API payout minus AD_FEE ($${adFee.toFixed(2)})`;
          } else {
            note = `Finances API payout (no AD_FEE found for item ${itemId})`;
          }
        } else {
          // Fallback
          payout = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
          if (adFee > 0) {
            payout = payout - adFee;
            note = `Fulfillment payout minus AD_FEE ($${adFee.toFixed(2)})`;
          } else {
            note = `Fulfillment payout (no AD_FEE found for item ${itemId})`;
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
          itemId: itemId,
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
      debug: {
        financesWorked,
        financesError,
        chargesError,
        salesTxCount: salesTxMap.size,
        adFeesFound: adFeesByItemId.size,
        adFeesRaw: adFeesRaw.slice(0, 10), // First 10 for debugging
        adFeesByItemId: Object.fromEntries(adFeesByItemId)
      },
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
