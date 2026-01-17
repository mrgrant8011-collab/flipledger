/**
 * FLIPLEDGER SYNC MODULE v2.0
 * ===========================
 * Unified sync functions for StockX and eBay
 * 
 * FEATURES:
 * 1. All sale details saved: price, fees, cost, payout, order_id
 * 2. All writes go through safeDatabase.js
 * 3. Bulletproof duplicate prevention
 * 4. Inventory auto-matching
 * 
 * USAGE:
 * import { syncStockXSales, syncEbaySales } from './syncModule';
 * 
 * // In your component:
 * const result = await syncStockXSales(user.id, stockxToken, { year: '2024' });
 * const result = await syncEbaySales(user.id, ebayToken, { year: '2024', month: '06' });
 */

import { safeBulkSavePendingCosts } from './safeDatabase';

// ============================================================
// STOCKX SYNC
// ============================================================

/**
 * Sync sales from StockX API
 * 
 * @param {string} userId - User's UUID
 * @param {string} token - StockX OAuth access token
 * @param {Object} options - Sync options
 * @param {string} options.year - Filter by year (e.g., '2024')
 * @param {string} [options.month] - Filter by month (e.g., '06' for June)
 * @param {Function} [options.onProgress] - Progress callback
 * 
 * @returns {Object} { success, saved, duplicates, errors, summary }
 */
export const syncStockXSales = async (userId, token, options = {}) => {
  const { year, month, onProgress } = options;
  
  if (!userId || !token) {
    return { success: false, error: 'User ID and token are required' };
  }
  
  try {
    onProgress?.({ status: 'fetching', message: 'Fetching sales from StockX...' });
    
    // 1. Fetch from StockX API
    const response = await fetch('/api/stockx-sales', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.sales || data.sales.length === 0) {
      return {
        success: true,
        saved: [],
        duplicates: [],
        errors: [],
        summary: { message: 'No sales found' }
      };
    }
    
    onProgress?.({ status: 'processing', message: `Processing ${data.sales.length} sales...` });
    
    // 2. Filter by year (required) and month (optional)
    let filtered = data.sales;
    
    if (year) {
      filtered = filtered.filter(s => s.sale_date && s.sale_date.startsWith(year));
    }
    
    if (month && month !== 'all') {
      const monthPrefix = `${year}-${month.padStart(2, '0')}`;
      filtered = filtered.filter(s => s.sale_date && s.sale_date.startsWith(monthPrefix));
    }
    
    if (filtered.length === 0) {
      return {
        success: true,
        saved: [],
        duplicates: [],
        errors: [],
        summary: { 
          message: `No sales found for ${month && month !== 'all' ? `${month}/${year}` : year}` 
        }
      };
    }
    
    onProgress?.({ status: 'saving', message: `Saving ${filtered.length} sales...` });
    
    // 3. Transform to safeDatabase format
    const itemsToSave = filtered.map(s => ({
      name: s.name,
      sku: s.sku || '',
      size: s.size || '',
      sale_price: s.sale_price,
      platform: s.platform || 'StockX',
      fees: s.fees || 0,
      payout: s.payout || null,
      sale_date: s.sale_date || null,
      order_id: s.order_id,  // CRITICAL for duplicate prevention
      image: s.image || null,
      note: `StockX ${s.inventory_type || 'Standard'}`
    }));
    
    // 4. Save using safe bulk save (handles duplicates automatically)
    const result = await safeBulkSavePendingCosts(userId, itemsToSave);
    
    return {
      success: true,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors,
      summary: {
        totalFetched: data.sales.length,
        filtered: filtered.length,
        saved: result.saved.length,
        duplicatesSkipped: result.duplicates.length,
        errored: result.errors.length,
        ...data.summary
      }
    };
    
  } catch (error) {
    console.error('[Sync] StockX sync error:', error);
    return { 
      success: false, 
      error: error.message,
      saved: [],
      duplicates: [],
      errors: []
    };
  }
};

// ============================================================
// EBAY SYNC
// ============================================================

/**
 * Sync sales from eBay API
 * 
 * @param {string} userId - User's UUID
 * @param {string} token - eBay OAuth access token
 * @param {Object} options - Sync options
 * @param {string} options.year - Filter by year (e.g., '2024')
 * @param {string} [options.month] - Filter by month (e.g., '06' for June, or 'all')
 * @param {string} [options.refreshToken] - eBay refresh token for auto-refresh
 * @param {Function} [options.onTokenRefresh] - Callback when token is refreshed
 * @param {Function} [options.onProgress] - Progress callback
 * 
 * @returns {Object} { success, saved, duplicates, errors, summary }
 */
export const syncEbaySales = async (userId, token, options = {}) => {
  const { year, month, refreshToken, onTokenRefresh, onProgress } = options;
  
  if (!userId || !token) {
    return { success: false, error: 'User ID and token are required' };
  }
  
  if (!year) {
    return { success: false, error: 'Year is required' };
  }
  
  try {
    onProgress?.({ status: 'fetching', message: 'Fetching sales from eBay...' });
    
    // 1. Build date range
    let startDate, endDate;
    const yearInt = parseInt(year);
    
    if (!month || month === 'all') {
      startDate = `${yearInt}-01-01T00:00:00.000Z`;
      endDate = `${yearInt}-12-31T23:59:59.000Z`;
    } else {
      const monthInt = parseInt(month);
      const lastDay = new Date(yearInt, monthInt, 0).getDate();
      const monthStr = month.padStart(2, '0');
      startDate = `${yearInt}-${monthStr}-01T00:00:00.000Z`;
      endDate = `${yearInt}-${monthStr}-${lastDay}T23:59:59.000Z`;
    }
    
    // 2. Fetch from eBay API
    let currentToken = token;
    let response = await fetch(
      `/api/ebay-sales?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers: { 'Authorization': `Bearer ${currentToken}` } }
    );
    
    // Try token refresh if failed
    if (!response.ok && refreshToken) {
      onProgress?.({ status: 'refreshing', message: 'Refreshing eBay token...' });
      
      const refreshRes = await fetch('/api/ebay-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        currentToken = refreshData.access_token;
        onTokenRefresh?.(currentToken);
        
        response = await fetch(
          `/api/ebay-sales?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          { headers: { 'Authorization': `Bearer ${currentToken}` } }
        );
      }
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.sales || data.sales.length === 0) {
      return {
        success: true,
        saved: [],
        duplicates: [],
        errors: [],
        summary: { 
          message: `No sales found for ${month && month !== 'all' ? `${month}/${year}` : year}` 
        }
      };
    }
    
    onProgress?.({ status: 'processing', message: `Processing ${data.sales.length} sales...` });
    
    // 3. Transform to safeDatabase format
    const itemsToSave = data.sales.map(s => ({
      name: s.name,
      sku: s.sku || '',
      size: s.size || '',
      sale_price: s.sale_price,
      platform: 'eBay',
      fees: s.fees || 0,
      payout: s.payout || null,
      sale_date: s.sale_date || null,
      order_id: s.order_id,  // CRITICAL: already has 'ebay_' prefix
      image: s.image || null,
      buyer: s.buyer || null,
      ad_fee: s.ad_fee || null,
      note: s.payout_source || null
    }));
    
    onProgress?.({ status: 'saving', message: `Saving ${itemsToSave.length} sales...` });
    
    // 4. Save using safe bulk save (handles duplicates automatically)
    const result = await safeBulkSavePendingCosts(userId, itemsToSave);
    
    return {
      success: true,
      saved: result.saved,
      duplicates: result.duplicates,
      errors: result.errors,
      summary: {
        totalFetched: data.sales.length,
        saved: result.saved.length,
        duplicatesSkipped: result.duplicates.length,
        errored: result.errors.length,
        imagesFound: data.imagesFound,
        ...data.summary
      }
    };
    
  } catch (error) {
    console.error('[Sync] eBay sync error:', error);
    return { 
      success: false, 
      error: error.message,
      saved: [],
      duplicates: [],
      errors: []
    };
  }
};

// ============================================================
// CSV IMPORT HELPERS
// ============================================================

/**
 * Import StockX sales from CSV data
 * 
 * @param {string} userId - User's UUID
 * @param {Array} csvRows - Parsed CSV rows
 * @param {Object} options - Import options
 * @param {string} [options.year] - Filter by year
 * @param {string} [options.month] - Filter by month
 * 
 * @returns {Object} { success, saved, duplicates, errors }
 */
export const importStockXCSV = async (userId, csvRows, options = {}) => {
  const { year, month } = options;
  
  if (!userId || !csvRows || csvRows.length === 0) {
    return { success: false, error: 'User ID and CSV data are required' };
  }
  
  // Filter by date if specified
  let filtered = csvRows;
  
  if (year && year !== 'all') {
    filtered = filtered.filter(row => {
      const date = row['Sale Date'] || row['Date'] || row['Order Date'] || '';
      return date.includes(year);
    });
  }
  
  if (month && month !== 'all') {
    filtered = filtered.filter(row => {
      const date = row['Sale Date'] || row['Date'] || row['Order Date'] || '';
      const parts = date.split(/[-/]/);
      if (parts.length >= 2) {
        const m = parts[0].length === 4 ? parts[1] : parts[0];
        return m.padStart(2, '0') === month.padStart(2, '0');
      }
      return false;
    });
  }
  
  // Transform to safeDatabase format
  const itemsToSave = filtered.map(row => {
    const orderNum = row['Order Number'] || row['Order'] || row['Order ID'] || '';
    const salePrice = parseFloat(String(row['Sale Price'] || row['Price'] || '0').replace(/[$,]/g, '')) || 0;
    const payout = parseFloat(String(row['Payout'] || row['Total Payout'] || '0').replace(/[$,]/g, '')) || 0;
    const fees = salePrice - payout;
    
    // Parse date
    let saleDate = row['Sale Date'] || row['Date'] || row['Order Date'] || '';
    if (saleDate.includes('/')) {
      const parts = saleDate.split('/');
      if (parts.length === 3) {
        const [m, d, y] = parts;
        saleDate = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    
    // Build image URL
    const name = row['Product'] || row['Product Name'] || row['Item'] || 'Unknown';
    let image = '';
    if (name) {
      const slug = name
        .replace(/\(Women's\)/gi, 'W')
        .replace(/\(Men's\)/gi, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/'/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214`;
    }
    
    return {
      name: name,
      sku: row['Style'] || row['SKU'] || row['Style ID'] || '',
      size: row['Size'] || '',
      sale_price: salePrice,
      platform: 'StockX',
      fees: fees > 0 ? fees : 0,
      payout: payout || null,
      sale_date: saleDate || null,
      order_id: orderNum || `stockx_csv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      image: image
    };
  }).filter(item => item.sale_price > 0);
  
  // Save using safe bulk save
  const result = await safeBulkSavePendingCosts(userId, itemsToSave);
  
  return {
    success: true,
    saved: result.saved,
    duplicates: result.duplicates,
    errors: result.errors
  };
};

/**
 * Import eBay sales from CSV data
 * 
 * @param {string} userId - User's UUID
 * @param {Array} csvRows - Parsed CSV rows
 * @param {Object} options - Import options
 * @param {string} [options.year] - Filter by year
 * @param {string} [options.month] - Filter by month
 * 
 * @returns {Object} { success, saved, duplicates, errors }
 */
export const importEbayCSV = async (userId, csvRows, options = {}) => {
  const { year, month } = options;
  
  if (!userId || !csvRows || csvRows.length === 0) {
    return { success: false, error: 'User ID and CSV data are required' };
  }
  
  // Filter by date if specified
  let filtered = csvRows;
  
  if (year && year !== 'all') {
    filtered = filtered.filter(row => {
      const date = row['Transaction creation date'] || row['Date'] || row['Order Date'] || '';
      return date.includes(year);
    });
  }
  
  if (month && month !== 'all') {
    filtered = filtered.filter(row => {
      const date = row['Transaction creation date'] || row['Date'] || row['Order Date'] || '';
      const parts = date.split(/[-/]/);
      if (parts.length >= 2) {
        const m = parts[0].length === 4 ? parts[1] : parts[0];
        return m.padStart(2, '0') === month.padStart(2, '0');
      }
      return false;
    });
  }
  
  // Group by order number (eBay CSVs can have multiple rows per order)
  const orderMap = new Map();
  
  for (const row of filtered) {
    const orderNum = row['Order number'] || row['Order ID'] || row['Order'] || '';
    if (!orderNum) continue;
    
    if (!orderMap.has(orderNum)) {
      orderMap.set(orderNum, {
        name: row['Item title'] || row['Title'] || 'eBay Item',
        salePrice: 0,
        fees: 0,
        payout: 0,
        saleDate: row['Transaction creation date'] || row['Date'] || '',
        buyer: row['Buyer username'] || row['Buyer'] || ''
      });
    }
    
    const order = orderMap.get(orderNum);
    
    // Add amounts (handling different column names)
    const gross = parseFloat(String(row['Gross transaction amount'] || row['Total'] || '0').replace(/[$,]/g, '')) || 0;
    const fee = parseFloat(String(row['Fee amount'] || row['eBay fee'] || '0').replace(/[$,]/g, '')) || 0;
    const net = parseFloat(String(row['Net amount'] || row['Net'] || '0').replace(/[$,]/g, '')) || 0;
    
    order.salePrice += Math.abs(gross);
    order.fees += Math.abs(fee);
    order.payout += net > 0 ? net : (Math.abs(gross) - Math.abs(fee));
  }
  
  // Transform to safeDatabase format
  const itemsToSave = Array.from(orderMap.entries()).map(([orderNum, order]) => {
    // Parse date
    let saleDate = order.saleDate;
    if (saleDate && saleDate.includes('/')) {
      const parts = saleDate.split('/');
      if (parts.length === 3) {
        const [m, d, y] = parts;
        saleDate = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    
    return {
      name: order.name,
      sku: '',
      size: '',
      sale_price: order.salePrice,
      platform: 'eBay',
      fees: order.fees,
      payout: order.payout,
      sale_date: saleDate ? saleDate.split(' ')[0] : null,
      order_id: `ebay_${orderNum}`,
      buyer: order.buyer
    };
  }).filter(item => item.sale_price > 0);
  
  // Save using safe bulk save
  const result = await safeBulkSavePendingCosts(userId, itemsToSave);
  
  return {
    success: true,
    saved: result.saved,
    duplicates: result.duplicates,
    errors: result.errors
  };
};

// ============================================================
// HELPER: Transform pending cost to display format
// ============================================================

/**
 * Transform a saved pending cost record to display format
 * Use this after saving to update local React state
 * 
 * @param {Object} record - Database record from Supabase
 * @returns {Object} Display format for React state
 */
export const transformPendingForDisplay = (record) => ({
  id: record.id,
  name: record.name,
  sku: record.sku,
  size: record.size,
  salePrice: parseFloat(record.sale_price) || 0,
  platform: record.platform,
  fees: parseFloat(record.fees) || 0,
  payout: parseFloat(record.payout) || 0,
  saleDate: record.sale_date,
  orderId: record.order_id,
  image: record.image,
  buyer: record.buyer,
  adFee: record.ad_fee
});

/**
 * Transform a saved sale record to display format
 * 
 * @param {Object} record - Database record from Supabase
 * @returns {Object} Display format for React state
 */
export const transformSaleForDisplay = (record) => ({
  id: record.id,
  name: record.name,
  sku: record.sku,
  size: record.size,
  cost: parseFloat(record.cost) || 0,
  salePrice: parseFloat(record.sale_price) || 0,
  platform: record.platform,
  fees: parseFloat(record.fees) || 0,
  payout: parseFloat(record.payout) || 0,
  profit: parseFloat(record.profit) || 0,
  saleDate: record.sale_date,
  orderId: record.order_id,
  image: record.image
});
