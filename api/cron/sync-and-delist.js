import { getValidToken, getUsersWithTokens, supabaseAdmin } from '../lib/token-manager.js';
import { processDelistForSale, getUnprocessedSales, acquireLock, releaseLock } from '../lib/delist-processor.js';

function verifyCronSecret(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

async function syncEbaySales(userId, accessToken) {
  try {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${process.env.VERCEL_URL || 'https://flipledger.vercel.app'}/api/ebay-sales?startDate=${startDate}&endDate=${endDate}`;
    
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!response.ok) return { success: false, sales: [] };
    
    const data = await response.json();
    const sales = data.sales || [];
    
    let inserted = 0;
    for (const sale of sales) {
      try {
        const { error } = await supabaseAdmin.from('pending_costs').insert({
          user_id: userId, name: sale.name, sku: sale.sku || '', size: sale.size || '',
          sale_price: sale.sale_price, platform: 'eBay', fees: sale.fees || 0,
          payout: sale.payout || null, sale_date: sale.sale_date, order_id: sale.order_id,
          image: sale.image || null, delist_processed: false
        });
        if (!error) inserted++;
      } catch (e) {}
    }
    
    return { success: true, sales, inserted };
  } catch (err) {
    return { success: false, sales: [], error: err.message };
  }
}

async function syncStockXSales(userId, accessToken) {
  try {
    const url = `${process.env.VERCEL_URL || 'https://flipledger.vercel.app'}/api/stockx-sales`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!response.ok) return { success: false, sales: [] };
    
    const data = await response.json();
    const sales = data.sales || [];
    
    let inserted = 0;
    for (const sale of sales) {
      try {
        const { error } = await supabaseAdmin.from('pending_costs').insert({
          user_id: userId, name: sale.name, sku: sale.sku || '', size: sale.size || '',
          sale_price: sale.sale_price, platform: sale.platform || 'StockX', fees: sale.fees || 0,
          payout: sale.payout || null, sale_date: sale.sale_date, order_id: sale.order_id,
          image: sale.image || null, delist_processed: false
        });
        if (!error) inserted++;
      } catch (e) {}
    }
    
    return { success: true, sales, inserted };
  } catch (err) {
    return { success: false, sales: [], error: err.message };
  }
}

async function processUser(userId, platforms) {
  const result = { userId, locked: false, ebaySync: null, stockxSync: null, delists: { processed: 0, success: 0, failed: 0, skipped: 0 } };
  
  const lockAcquired = await acquireLock(userId);
  if (!lockAcquired) { result.locked = true; return result; }
  
  try {
    const tokens = { ebayToken: null, stockxToken: null };
    
    if (platforms.includes('ebay')) {
      const ebayResult = await getValidToken(userId, 'ebay');
      if (ebayResult.success) tokens.ebayToken = ebayResult.accessToken;
    }
    
    if (platforms.includes('stockx')) {
      const stockxResult = await getValidToken(userId, 'stockx');
      if (stockxResult.success) tokens.stockxToken = stockxResult.accessToken;
    }
    
    if (tokens.ebayToken) result.ebaySync = await syncEbaySales(userId, tokens.ebayToken);
    if (tokens.stockxToken) result.stockxSync = await syncStockXSales(userId, tokens.stockxToken);
    
    if (tokens.ebayToken && tokens.stockxToken) {
      const unprocessedSales = await getUnprocessedSales(userId);
      
      for (const sale of unprocessedSales) {
        try {
          const delistResult = await processDelistForSale(sale, tokens);
          result.delists.processed++;
          if (delistResult.status === 'success') result.delists.success++;
          else if (delistResult.status === 'skipped' || delistResult.status === 'not_found') result.delists.skipped++;
          else result.delists.failed++;
        } catch (err) {
          result.delists.failed++;
        }
      }
    }
  } finally {
    await releaseLock(userId);
  }
  
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const users = await getUsersWithTokens();
    if (users.length === 0) {
      return res.status(200).json({ success: true, message: 'No users with tokens', timestamp: new Date().toISOString() });
    }
    
    const results = [];
    for (const user of users) {
      try {
        const result = await processUser(user.userId, user.platforms);
        results.push(result);
      } catch (err) {
        results.push({ userId: user.userId, error: err.message });
      }
    }
    
    const summary = {
      usersProcessed: results.filter(r => !r.locked && !r.error).length,
      usersSkipped: results.filter(r => r.locked).length,
      usersErrored: results.filter(r => r.error).length,
      totalDelists: results.reduce((sum, r) => sum + (r.delists?.processed || 0), 0),
      successfulDelists: results.reduce((sum, r) => sum + (r.delists?.success || 0), 0)
    };
    
    return res.status(200).json({ success: true, timestamp: new Date().toISOString(), summary, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
}
