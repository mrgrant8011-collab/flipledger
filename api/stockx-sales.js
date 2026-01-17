/**
 * STOCKX SALES API v2.0
 * =====================
 * Fetches completed sales from StockX with FULL details:
 * - Order ID (for duplicate prevention)
 * - Sale price
 * - Platform fees
 * - Payout amount
 * - Product details (name, SKU, size)
 * - Sale date
 * - Platform type (Standard/Direct/Flex)
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  try {
    let allOrders = [];
    let pageNumber = 1;
    let hasMore = true;
    
    // Fetch all completed orders with pagination (up to 1000)
    while (hasMore && pageNumber <= 10) {
      const url = new URL('https://api.stockx.com/v2/selling/orders/history');
      url.searchParams.set('pageNumber', pageNumber.toString());
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('orderStatus', 'COMPLETED');
      
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
          return res.status(response.status).json({ 
            error: err.message || 'API Error',
            details: err
          });
        }
        break;
      }
      
      const data = await response.json();
      const orders = data.orders || [];
      
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
    
    console.log(`[StockX API] Fetched ${allOrders.length} completed orders`);
    
    // Transform orders to sales with FULL details
    const sales = allOrders.map(order => {
      const product = order.product || {};
      const variant = order.variant || {};
      const payout = order.payout || {};
      
      // Determine platform type
      let platform = 'StockX Standard';
      if (order.inventoryType === 'FLEX') platform = 'StockX Flex';
      else if (order.inventoryType === 'DIRECT') platform = 'StockX Direct';
      
      // Calculate fees (sale price - payout = total fees)
      const salePrice = parseFloat(order.amount) || 0;
      const totalPayout = parseFloat(payout.totalPayout) || 0;
      const fees = salePrice - totalPayout;
      
      // Extract all payout components if available
      const payoutBreakdown = {
        basePayout: parseFloat(payout.basePayout) || null,
        sellerFee: parseFloat(payout.sellerFee) || null,
        transactionFee: parseFloat(payout.transactionFee) || null,
        paymentProcessingFee: parseFloat(payout.paymentProcessingFee) || null,
        shippingFee: parseFloat(payout.shippingFee) || null,
        adjustments: parseFloat(payout.adjustments) || null
      };
      
      // Build image URL from product name
      let image = '';
      if (product.productName) {
        let nameForSlug = product.productName;
        // Add "Air" prefix for Jordan products if not already there
        if (/^Jordan\s/i.test(nameForSlug) && !/^Air\s+Jordan/i.test(nameForSlug)) {
          nameForSlug = 'Air ' + nameForSlug;
        }
        
        const slug = nameForSlug
          .replace(/\(Women's\)/gi, 'W')
          .replace(/\(Men's\)/gi, '')
          .replace(/\(GS\)/gi, 'GS')
          .replace(/\(PS\)/gi, 'PS')
          .replace(/\(TD\)/gi, 'TD')
          .replace(/\([^)]*\)/g, '')
          .replace(/'/g, '')
          .replace(/"/g, '')
          .replace(/&/g, 'and')
          .replace(/\+/g, 'Plus')
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        if (slug) {
          image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`;
        }
      }
      
      return {
        // CRITICAL: order_id for duplicate prevention
        order_id: order.orderNumber,
        
        // Product details
        name: product.productName || 'Unknown Product',
        sku: product.styleId || '',
        size: variant.variantValue || '',
        image: image,
        
        // Financial details - ALL preserved
        sale_price: salePrice,
        fees: fees > 0 ? fees : 0,
        payout: totalPayout,
        
        // Detailed fee breakdown (for debugging/display)
        fee_breakdown: payoutBreakdown,
        
        // Metadata
        sale_date: (order.createdAt || '').split('T')[0],
        platform: platform,
        inventory_type: order.inventoryType || 'STANDARD',
        
        // Raw order data for debugging
        _raw: {
          orderNumber: order.orderNumber,
          amount: order.amount,
          createdAt: order.createdAt,
          status: order.status
        }
      };
    });
    
    // Remove duplicates (same order number)
    const uniqueSales = [...new Map(sales.map(s => [s.order_id, s])).values()];
    
    // Summary stats
    const totalRevenue = uniqueSales.reduce((sum, s) => sum + s.sale_price, 0);
    const totalFees = uniqueSales.reduce((sum, s) => sum + s.fees, 0);
    const totalPayout = uniqueSales.reduce((sum, s) => sum + s.payout, 0);
    
    res.status(200).json({ 
      success: true,
      sales: uniqueSales,
      total: uniqueSales.length,
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalFees: totalFees.toFixed(2),
        totalPayout: totalPayout.toFixed(2),
        avgFeePercent: totalRevenue > 0 ? ((totalFees / totalRevenue) * 100).toFixed(1) : '0'
      }
    });
    
  } catch (error) {
    console.error(`[StockX API] Error:`, error.message);
    res.status(500).json({ 
      error: 'Failed to fetch StockX sales',
      message: error.message 
    });
  }
}
