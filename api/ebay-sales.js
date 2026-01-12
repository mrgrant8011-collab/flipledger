// eBay Sales - v122 - Pagination + Year/Month filters
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
  
  // Default to last 90 days if no dates provided
  const now = new Date();
  const end = endDate || now.toISOString();
  const start = startDate || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // 1. Get ALL orders with pagination
    let allOrders = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;
    
    while (hasMore) {
      const ordersUrl = `https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:[${start}..${end}]&limit=${limit}&offset=${offset}`;
      
      const ordersResponse = await fetch(ordersUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      });
      
      if (!ordersResponse.ok) {
        const errorText = await ordersResponse.text();
        return res.status(ordersResponse.status).json({ 
          error: 'Failed to fetch orders', 
          details: errorText,
          url: ordersUrl 
        });
      }
      
      const ordersData = await ordersResponse.json();
      const orders = ordersData.orders || [];
      allOrders = allOrders.concat(orders);
      
      // Check if there are more pages
      if (orders.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        // Safety limit - max 1000 orders
        if (offset >= 1000) hasMore = false;
      }
    }
    
    // 2. Get SALE transactions from Finances API (with pagination)
    let salesTxMap = new Map();
    let financesWorked = false;
    
    try {
      let txOffset = 0;
      let txHasMore = true;
      
      while (txHasMore) {
        const salesUrl = `https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&filter=transactionType:{SALE}&limit=${limit}&offset=${txOffset}`;
        
        const salesResponse = await fetch(salesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        });
        
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
            
            if (salesData.transactions.length < limit) {
              txHasMore = false;
            } else {
              txOffset += limit;
              if (txOffset >= 1000) txHasMore = false;
            }
          } else {
            txHasMore = false;
          }
        } else {
          txHasMore = false;
        }
      }
    } catch (e) {
      console.log('Finances SALE API failed:', e.message);
    }
    
    // 3. Get NON_SALE_CHARGE transactions (AD_FEE) with pagination
    let adFeesByOrderId = new Map();
    
    try {
      let chargeOffset = 0;
      let chargeHasMore = true;
      
      while (chargeHasMore) {
        const chargesUrl = `https://apiz.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&filter=transactionType:{NON_SALE_CHARGE}&limit=${limit}&offset=${chargeOffset}`;
        
        const chargesResponse = await fetch(chargesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
          }
        });
        
        if (chargesResponse.ok) {
          const chargesData = await chargesResponse.json();
          
          if (chargesData.transactions) {
            for (const tx of chargesData.transactions) {
              if (tx.feeType === 'AD_FEE' && tx.references) {
                for (const ref of tx.references) {
                  if (ref.referenceType === 'ORDER_ID') {
                    const orderId = ref.referenceId;
                    const fee = Math.abs(parseFloat(tx.amount?.value || 0));
                    adFeesByOrderId.set(orderId, (adFeesByOrderId.get(orderId) || 0) + fee);
                  }
                }
              }
            }
            
            if (chargesData.transactions.length < limit) {
              chargeHasMore = false;
            } else {
              chargeOffset += limit;
              if (chargeOffset >= 1000) chargeHasMore = false;
            }
          } else {
            chargeHasMore = false;
          }
        } else {
          chargeHasMore = false;
        }
      }
    } catch (e) {
      console.log('Finances NON_SALE_CHARGE API failed:', e.message);
    }
    
    // 4. Build sales from orders
    const sales = [];
    for (const order of allOrders) {
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
      dateRange: { start, end },
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
