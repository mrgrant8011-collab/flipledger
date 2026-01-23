/**
 * EBAY SALES API v2.0
 * ===================
 * Fetches completed sales from eBay with FULL details:
 * - Order ID (for duplicate prevention)
 * - Sale price (gross)
 * - Platform fees (base + ad fees)
 * - Payout amount (net)
 * - Product details
 * - Buyer info
 * - Sale date
 * - Images
 * 
 * IMPORTANT: Returns order_id in format "ebay_{orderId}" for namespace safety
 */

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
    // =========================================
    // 1. FETCH ALL ORDERS (with pagination)
    // =========================================
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
      
      if (orders.length < limit || offset >= 1000) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
    
    console.log(`[eBay API] Fetched ${allOrders.length} orders`);
    
    // =========================================
    // 2. FETCH SALE TRANSACTIONS (Finances API)
    // =========================================
    let salesTxMap = new Map();
    
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
          
          if (salesData.transactions) {
            for (const tx of salesData.transactions) {
              if (tx.orderId && tx.amount) {
                salesTxMap.set(tx.orderId, {
                  payout: parseFloat(tx.amount.value || 0),
                  totalFees: parseFloat(tx.totalFeeAmount?.value || 0),
                  transactionId: tx.transactionId
                });
              }
            }
            
            if (salesData.transactions.length < limit || txOffset >= 1000) {
              txHasMore = false;
            } else {
              txOffset += limit;
            }
          } else {
            txHasMore = false;
          }
        } else {
          txHasMore = false;
        }
      }
    } catch (e) {
      console.log('[eBay API] Finances SALE API failed:', e.message);
    }
    
    // =========================================
    // 3. FETCH AD FEE TRANSACTIONS
    // =========================================
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
            
            if (chargesData.transactions.length < limit || chargeOffset >= 1000) {
              chargeHasMore = false;
            } else {
              chargeOffset += limit;
            }
          } else {
            chargeHasMore = false;
          }
        } else {
          chargeHasMore = false;
        }
      }
    } catch (e) {
      console.log('[eBay API] Finances NON_SALE_CHARGE API failed:', e.message);
    }
    
    // =========================================
    // 4. FETCH IMAGES (Multiple Methods)
    // =========================================
    const uniqueItemIds = [...new Set(
      allOrders.flatMap(o => (o.lineItems || []).map(li => li.legacyItemId).filter(Boolean))
    )];
    
    const imageMap = new Map();
    const clientId = process.env.EBAY_CLIENT_ID;
    
    // Check if lineItems already have images embedded
    for (const order of allOrders) {
      for (const li of order.lineItems || []) {
        const itemId = li.legacyItemId;
        if (!itemId || imageMap.has(itemId)) continue;
        
        const img = li.image?.imageUrl || li.imageUrl || li.pictureURL || 
                   li.galleryURL || li.thumbnailImageUrl || li.mainImage?.imageUrl ||
                   (li.images && li.images[0]?.imageUrl);
        if (img) imageMap.set(itemId, img);
      }
    }
    
    // Method 1: GetItem (Trading API)
    const remaining0 = uniqueItemIds.filter(id => !imageMap.has(id));
    for (let i = 0; i < remaining0.length; i += 10) {
      const batch = remaining0.slice(i, i + 10);
      await Promise.all(batch.map(async (itemId) => {
        if (imageMap.has(itemId)) return;
        try {
          const res = await fetch('https://api.ebay.com/ws/api.dll', {
            method: 'POST',
            headers: {
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
              'X-EBAY-API-CALL-NAME': 'GetItem',
              'X-EBAY-API-IAF-TOKEN': accessToken,
              'Content-Type': 'text/xml'
            },
            body: `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`
          });
          
          if (res.ok) {
            const xml = await res.text();
            const picMatch = xml.match(/<PictureURL>([^<]+)<\/PictureURL>/);
            const galMatch = xml.match(/<GalleryURL>([^<]+)<\/GalleryURL>/);
            if (picMatch?.[1]) imageMap.set(itemId, picMatch[1]);
            else if (galMatch?.[1]) imageMap.set(itemId, galMatch[1]);
          }
        } catch (e) {}
      }));
    }
    
    // Method 2: Shopping API GetMultipleItems
    const remaining1 = uniqueItemIds.filter(id => !imageMap.has(id));
    if (remaining1.length > 0 && clientId) {
      for (let i = 0; i < remaining1.length; i += 20) {
        const batch = remaining1.slice(i, i + 20);
        try {
          const shopRes = await fetch(
            `https://open.api.ebay.com/shopping?callname=GetMultipleItems&responseencoding=JSON&appid=${clientId}&siteid=0&version=967&ItemID=${batch.join(',')}&IncludeSelector=Details,Variations`
          );
          if (shopRes.ok) {
            const data = await shopRes.json();
            const items = Array.isArray(data.Item) ? data.Item : (data.Item ? [data.Item] : []);
            for (const item of items) {
              if (item.ItemID && !imageMap.has(item.ItemID)) {
                let pic = (item.PictureURL && item.PictureURL[0]) || item.GalleryURL;
                if (pic) imageMap.set(item.ItemID, pic);
              }
            }
          }
        } catch (e) {}
      }
    }
    
    // Method 3: Browse API
    const remaining2 = uniqueItemIds.filter(id => !imageMap.has(id));
    for (let i = 0; i < remaining2.length; i += 10) {
      const batch = remaining2.slice(i, i + 10);
      await Promise.all(batch.map(async (itemId) => {
        if (imageMap.has(itemId)) return;
        try {
          const res = await fetch(
            `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${itemId}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
              }
            }
          );
          if (res.ok) {
            const data = await res.json();
            const img = data.image?.imageUrl || data.primaryImage?.imageUrl;
            if (img) imageMap.set(itemId, img);
          }
        } catch (e) {}
      }));
    }
    
    console.log(`[eBay API] Found images for ${imageMap.size}/${uniqueItemIds.length} items`);
    
    // =========================================
    // 5. BUILD SALES WITH FULL DETAILS
    // =========================================
    const sales = [];
    
    for (const order of allOrders) {
      // Only include PAID orders - skip cancelled, refunded, pending
      if (order.orderPaymentStatus !== 'PAID') continue;
      if (order.cancelStatus?.cancelState === 'CANCELED') continue;
    
       for (const lineItem of order.lineItems || []) {
  const salePrice = parseFloat(order.pricingSummary?.total?.value || lineItem.total?.value || 0);
  
  // Try variationAspects first
  let size = lineItem.variationAspects?.find(v => v.name.toLowerCase().includes('size'))?.value || '';
  
  // If no size from variationAspects, try to parse from title
  if (!size && lineItem.title) {
    const sizeMatch = lineItem.title.match(/(?:Size|Sz)[:\s]*(\d+\.?\d*y?)/i);
    if (sizeMatch) {
      size = sizeMatch[1];
    }
  }
        const baseFees = parseFloat(order.totalMarketplaceFee?.value || 0);
        const itemId = lineItem.legacyItemId || '';
        const adFee = adFeesByOrderId.get(order.orderId) || 0;
        
        // Calculate payout
        let payout;
        let payoutSource;
        
        if (salesTxMap.has(order.orderId)) {
          payout = salesTxMap.get(order.orderId).payout;
          if (adFee > 0) {
            payout = payout - adFee;
            payoutSource = 'Finances API (minus AD_FEE)';
          } else {
            payoutSource = 'Finances API';
          }
        } else {
          payout = parseFloat(order.paymentSummary?.totalDueSeller?.value || 0);
          if (adFee > 0) {
            payout = payout - adFee;
            payoutSource = 'Order API (minus AD_FEE)';
          } else {
            payoutSource = 'Order API';
          }
        }
        
        // Total fees = base fees + ad fees
        const totalFees = baseFees + adFee;
        
        sales.push({
          // CRITICAL: order_id with ebay_ prefix for namespace safety
          order_id: `ebay_${order.orderId}`,
          
          // Original eBay order ID (for reference)
          ebay_order_id: order.orderId,
          
          // Product details
          name: lineItem.title || 'eBay Item',
          sku: lineItem.sku || itemId || '',
         size, (lineItem.variationAspects?.find(v => v.name.toLowerCase().includes('size'))?.value) || '',
          image: imageMap.get(itemId) || lineItem.image?.imageUrl || '',
          
          // Financial details - ALL preserved
          sale_price: salePrice,
          fees: totalFees,
          payout: payout,
          
          // Fee breakdown
          base_fees: baseFees,
          ad_fee: adFee,
          
          // Metadata
          sale_date: order.creationDate ? order.creationDate.split('T')[0] : new Date().toISOString().split('T')[0],
          platform: 'eBay',
          buyer: order.buyer?.username || '',
          quantity: lineItem.quantity || 1,
          
          // Source info for debugging
          payout_source: payoutSource,
          item_id: itemId,
          
          // Raw reference
          _raw: {
            orderId: order.orderId,
            orderPaymentStatus: order.orderPaymentStatus,
            creationDate: order.creationDate
          }
        });
      }
    }
    
    // Summary stats
    const totalRevenue = sales.reduce((sum, s) => sum + s.sale_price, 0);
    const totalFees = sales.reduce((sum, s) => sum + s.fees, 0);
    const totalPayout = sales.reduce((sum, s) => sum + s.payout, 0);
    const totalAdFees = sales.reduce((sum, s) => sum + s.ad_fee, 0);
    
    res.status(200).json({ 
      success: true,
      sales: sales,
      count: sales.length,
      imagesFound: imageMap.size,
      totalItems: uniqueItemIds.length,
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalFees: totalFees.toFixed(2),
        totalAdFees: totalAdFees.toFixed(2),
        totalPayout: totalPayout.toFixed(2),
        avgFeePercent: totalRevenue > 0 ? ((totalFees / totalRevenue) * 100).toFixed(1) : '0'
      }
    });
    
  } catch (err) {
    console.error('[eBay API] Error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch eBay sales', 
      message: err.message 
    });
  }
}
