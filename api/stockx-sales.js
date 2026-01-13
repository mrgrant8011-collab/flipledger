export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    
    while (hasMore && pageNumber <= 10) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('pageNumber', pageNumber.toString());
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('orderStatus', 'COMPLETED');
      
      console.log(`[StockX] Fetching page ${pageNumber}`);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'x-api-key': process.env.STOCKX_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (pageNumber === 1) {
          return res.status(response.status).json({ error: err.message || 'API Error' });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || [];
      
      if (pageNumber === 1) {
        console.log(`[StockX] Total COMPLETED: ${data.count}`);
      }
      
      if (orders.length === 0) {
        hasMore = false;
      } else {
        allOrders = [...allOrders, ...orders];
        if (!data.hasNextPage || orders.length < 100) {
          hasMore = false;
        } else {
          pageNumber++;
        }
      }
    }
    
    console.log(`[StockX] Fetched ${allOrders.length} orders`);
    
    // Helper to create StockX image URL slug
    function createImageSlug(productName) {
      if (!productName) return '';
      
      return productName
        .replace(/\(Women's\)/gi, 'W')           // Women's -> W
        .replace(/\(Men's\)/gi, '')               // Remove Men's
        .replace(/\(GS\)/gi, 'GS')               // Keep GS
        .replace(/\(PS\)/gi, 'PS')               // Keep PS  
        .replace(/\(TD\)/gi, 'TD')               // Keep TD
        .replace(/\([^)]*\)/g, '')               // Remove other parentheses
        .replace(/'/g, '')                        // Remove apostrophes
        .replace(/"/g, '')                        // Remove quotes
        .replace(/&/g, 'and')                     // & -> and
        .replace(/\+/g, 'Plus')                   // + -> Plus
        .replace(/[^a-zA-Z0-9\s-]/g, '')         // Remove special chars
        .trim()
        .replace(/\s+/g, '-')                     // Spaces -> hyphens
        .replace(/-+/g, '-')                      // Remove duplicate hyphens
        .replace(/^-|-$/g, '');                   // Remove leading/trailing hyphens
    }
    
    const sales = allOrders.map(order => {
      const product = order.product || {};
      const variant = order.variant || {};
      const payout = order.payout || {};
      
      let platform = 'StockX Standard';
      if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
      else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
      
      const sku = product.styleId || '';
      const productName = product.productName || '';
      const slug = createImageSlug(productName);
      
      // StockX image URL
      const image = slug ? `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color` : '';
      
      return {
        id: order.orderNumber,
        name: productName || 'Unknown Product',
        sku,
        size: variant.variantValue || '',
        salePrice: parseFloat(order.amount) || 0,
        payout: parseFloat(payout.totalPayout) || 0,
        saleDate: (order.createdAt || '').split('T')[0],
        platform,
        image
      };
    });
    
    // Log sample for debugging
    if (sales.length > 0) {
      console.log(`[StockX] Sample: "${sales[0].name}" -> ${sales[0].image}`);
    }
    
    const uniqueSales = [...new Map(sales.map(s => [s.id, s])).values()];
    
    res.status(200).json({ 
      sales: uniqueSales,
      total: uniqueSales.length
    });
    
  } catch (error) {
    console.log(`[StockX] Error:`, error.message);
    res.status(500).json({ error: 'Failed: ' + error.message });
  }
}
