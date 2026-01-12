// eBay Sales - v128 - Fetches images via Browse API
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
    
    // 4. Fetch images - Multiple methods for maximum coverage
    const uniqueItemIds = [...new Set(
      allOrders.flatMap(o => (o.lineItems || []).map(li => li.legacyItemId).filter(Boolean))
    )];
    
    const imageMap = new Map();
    const clientId = process.env.EBAY_CLIENT_ID;
    
    // First, check if lineItems already have images embedded
    for (const order of allOrders) {
      for (const li of order.lineItems || []) {
        const itemId = li.legacyItemId;
        if (!itemId || imageMap.has(itemId)) continue;
        
        // Check all possible image locations in lineItem
        const img = li.image?.imageUrl || li.imageUrl || li.pictureURL || 
                   li.galleryURL || li.thumbnailImageUrl || li.mainImage?.imageUrl ||
                   (li.images && li.images[0]?.imageUrl) ||
                   (li.pictureDetails?.pictureURL && li.pictureDetails.pictureURL[0]);
        if (img) imageMap.set(itemId, img);
      }
    }
    
    // METHOD 1: GetItem (Trading API) - works for seller's own ended items
    const remaining0 = uniqueItemIds.filter(id => !imageMap.has(id));
    const relistedMap = new Map(); // Track relisted item IDs
    
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
            // Try multiple image locations
            const picMatch = xml.match(/<PictureURL>([^<]+)<\/PictureURL>/);
            const galMatch = xml.match(/<GalleryURL>([^<]+)<\/GalleryURL>/);
            const varPicMatch = xml.match(/<VariationSpecificPictureSet>[\s\S]*?<PictureURL>([^<]+)<\/PictureURL>/);
            
            if (picMatch?.[1]) {
              imageMap.set(itemId, picMatch[1]);
            } else if (varPicMatch?.[1]) {
              imageMap.set(itemId, varPicMatch[1]);
            } else if (galMatch?.[1]) {
              imageMap.set(itemId, galMatch[1]);
            }
            
            // Check for relisted item ID - we can try that later
            const relistedMatch = xml.match(/<RelistedItemID>(\d+)<\/RelistedItemID>/);
            if (relistedMatch?.[1] && !imageMap.has(itemId)) {
              relistedMap.set(itemId, relistedMatch[1]);
            }
          }
        } catch (e) {}
      }));
    }
    
    // Try to get images from relisted items
    for (const [origId, relistedId] of relistedMap.entries()) {
      if (imageMap.has(origId)) continue;
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
  <ItemID>${relistedId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`
        });
        
        if (res.ok) {
          const xml = await res.text();
          const picMatch = xml.match(/<PictureURL>([^<]+)<\/PictureURL>/);
          const galMatch = xml.match(/<GalleryURL>([^<]+)<\/GalleryURL>/);
          if (picMatch?.[1]) {
            imageMap.set(origId, picMatch[1]);
          } else if (galMatch?.[1]) {
            imageMap.set(origId, galMatch[1]);
          }
        }
      } catch (e) {}
    }
    
    // METHOD 2: GetSellerTransactions - gets sold items with more detail (go back 6 months)
    const remaining1 = uniqueItemIds.filter(id => !imageMap.has(id));
    if (remaining1.length > 0) {
      // Try multiple 30-day windows since API limits to 30 days max
      const windows = [0, 30, 60, 90, 120, 150]; // Go back up to 180 days
      
      for (const daysBack of windows) {
        if (remaining1.filter(id => !imageMap.has(id)).length === 0) break;
        
        try {
          const endDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
          const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          
          const txRes = await fetch('https://api.ebay.com/ws/api.dll', {
            method: 'POST',
            headers: {
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
              'X-EBAY-API-CALL-NAME': 'GetSellerTransactions',
              'X-EBAY-API-IAF-TOKEN': accessToken,
              'Content-Type': 'text/xml'
            },
            body: `<?xml version="1.0" encoding="utf-8"?>
<GetSellerTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ModTimeFrom>${startDate.toISOString()}</ModTimeFrom>
  <ModTimeTo>${endDate.toISOString()}</ModTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <DetailLevel>ReturnAll</DetailLevel>
</GetSellerTransactionsRequest>`
          });
          
          if (txRes.ok) {
            const xml = await txRes.text();
            const txBlocks = xml.split('<Transaction>').slice(1);
            for (const block of txBlocks) {
              const itemIdMatch = block.match(/<ItemID>(\d+)<\/ItemID>/);
              const picMatch = block.match(/<PictureURL>([^<]+)<\/PictureURL>/) ||
                              block.match(/<GalleryURL>([^<]+)<\/GalleryURL>/);
              if (itemIdMatch?.[1] && picMatch?.[1] && !imageMap.has(itemIdMatch[1])) {
                imageMap.set(itemIdMatch[1], picMatch[1]);
              }
            }
          }
        } catch (e) {}
      }
    }
    
    // METHOD 3: Shopping API GetMultipleItems - public API, batch fetch up to 20
    const remaining2 = uniqueItemIds.filter(id => !imageMap.has(id));
    if (remaining2.length > 0) {
      for (let i = 0; i < remaining2.length; i += 20) {
        const batch = remaining2.slice(i, i + 20);
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
                if (!pic && item.Variations?.Pictures?.VariationSpecificPictureSet) {
                  const varSet = item.Variations.Pictures.VariationSpecificPictureSet;
                  const sets = Array.isArray(varSet) ? varSet : [varSet];
                  pic = sets[0]?.PictureURL?.[0];
                }
                if (pic) imageMap.set(item.ItemID, pic);
              }
            }
          }
        } catch (e) {}
      }
    }
    
    // METHOD 4: Browse API - for any still missing
    const remaining3 = uniqueItemIds.filter(id => !imageMap.has(id));
    for (let i = 0; i < remaining3.length; i += 10) {
      const batch = remaining3.slice(i, i + 10);
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
            const img = data.image?.imageUrl || data.primaryImage?.imageUrl || 
                       (data.additionalImages && data.additionalImages[0]?.imageUrl);
            if (img) imageMap.set(itemId, img);
          }
        } catch (e) {}
      }));
    }
    
    // METHOD 5: Shopping API GetSingleItem with all selectors
    const remaining4 = uniqueItemIds.filter(id => !imageMap.has(id));
    for (let i = 0; i < remaining4.length; i += 5) {
      const batch = remaining4.slice(i, i + 5);
      await Promise.all(batch.map(async (itemId) => {
        if (imageMap.has(itemId)) return;
        try {
          const res = await fetch(
            `https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${clientId}&siteid=0&version=967&ItemID=${itemId}&IncludeSelector=Details,ItemSpecifics,Variations`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.Item) {
              let pic = (data.Item.PictureURL && data.Item.PictureURL[0]) || data.Item.GalleryURL;
              if (!pic && data.Item.Variations?.Pictures?.VariationSpecificPictureSet) {
                const varSet = data.Item.Variations.Pictures.VariationSpecificPictureSet;
                const sets = Array.isArray(varSet) ? varSet : [varSet];
                pic = sets[0]?.PictureURL?.[0];
              }
              if (pic) imageMap.set(itemId, pic);
            }
          }
        } catch (e) {}
      }));
    }
    
    // METHOD 6: Try Inventory API by SKU if available
    const skuMap = new Map();
    allOrders.forEach(o => {
      (o.lineItems || []).forEach(li => {
        if (li.sku && li.legacyItemId && !imageMap.has(li.legacyItemId)) {
          skuMap.set(li.legacyItemId, li.sku);
        }
      });
    });
    
    for (const [itemId, sku] of skuMap.entries()) {
      if (imageMap.has(itemId)) continue;
      try {
        const res = await fetch(
          `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const img = data.product?.imageUrls?.[0];
          if (img) imageMap.set(itemId, img);
        }
      } catch (e) {}
    }
    
    // METHOD 7: Browse API search by item title - find image from similar listings
    const titleMap = new Map();
    allOrders.forEach(o => {
      (o.lineItems || []).forEach(li => {
        if (li.legacyItemId && li.title && !imageMap.has(li.legacyItemId)) {
          let searchTitle = li.title.substring(0, 50).replace(/[^\w\s]/g, ' ').trim();
          if (searchTitle.length > 10) {
            titleMap.set(li.legacyItemId, searchTitle);
          }
        }
      });
    });
    
    let searchCount = 0;
    for (const [itemId, title] of titleMap.entries()) {
      if (imageMap.has(itemId) || searchCount >= 20) continue;
      searchCount++;
      try {
        const searchRes = await fetch(
          `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(title)}&limit=1`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
            }
          }
        );
        if (searchRes.ok) {
          const data = await searchRes.json();
          if (data.itemSummaries && data.itemSummaries[0]) {
            const img = data.itemSummaries[0].image?.imageUrl || data.itemSummaries[0].thumbnailImages?.[0]?.imageUrl;
            if (img) imageMap.set(itemId, img);
          }
        }
      } catch (e) {}
    }
    
    // METHOD 8: Finding API findItemsByKeywords
    const remaining7 = [...titleMap.entries()].filter(([id]) => !imageMap.has(id)).slice(0, 15);
    for (const [itemId, title] of remaining7) {
      try {
        const findRes = await fetch(
          `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${clientId}&RESPONSE-DATA-FORMAT=JSON&keywords=${encodeURIComponent(title)}&paginationInput.entriesPerPage=1`
        );
        if (findRes.ok) {
          const data = await findRes.json();
          const items = data.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item;
          if (items && items[0]) {
            const img = items[0].galleryURL?.[0];
            if (img && !img.includes('no-image')) {
              imageMap.set(itemId, img);
            }
          }
        }
      } catch (e) {}
    }
    
    // 5. Build sales from orders
    const sales = [];
    for (const order of allOrders) {
      // Only include orders that were actually paid - skip cancelled, refunded, pending
      if (order.orderPaymentStatus !== 'PAID') continue;
      // Skip cancelled orders
      if (order.cancelStatus?.cancelState === 'CANCELED') continue;
      
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
          image: imageMap.get(itemId) || lineItem.image?.imageUrl || lineItem.imageUrl || 
                 lineItem.pictureURL || lineItem.galleryURL || lineItem.thumbnailImageUrl || '',
          source: 'api',
          note: note
        });
      }
    }
    
    res.status(200).json({ 
      success: true, 
      count: sales.length,
      imagesFound: imageMap.size,
      totalItems: uniqueItemIds.length,
      sales 
    });
    
  } catch (err) {
    console.error('eBay sales error:', err);
    res.status(500).json({ error: 'Failed to fetch sales', message: err.message });
  }
}
