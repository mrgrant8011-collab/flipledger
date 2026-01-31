/**
 * SYNC AND DELIST CRON JOB
 * =========================
 * Runs every 5 minutes via Vercel Cron.
 * 
 * For each user with stored tokens:
 * 1. Acquire lock (prevents overlapping runs)
 * 2. Sync new sales from eBay and StockX
 * 3. Process unprocessed sales for auto-delisting
 * 4. Release lock
 * 
 * Failures are isolated - one user's failure doesn't affect others.
 * Sync failures don't prevent delist processing.
 */

import { getValidToken, getUsersWithTokens, supabaseAdmin } from '../lib/token-manager.js';
import { processDelistForSale, getUnprocessedSales, acquireLock, releaseLock } from '../lib/delist-processor.js';

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req) {
  const cronSecret = process.env.CRON_SECRET;
  
  // If no secret configured, allow in development
  if (!cronSecret) {
    console.log('[Cron] Warning: CRON_SECRET not configured');
    return true;
  }
  
  const authHeader = req.headers.authorization;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Fetch new sales from eBay for a user
 */
async function syncEbaySales(userId, accessToken) {
  try {
    console.log(`[Cron] Syncing eBay sales for user ${userId}...`);
    
    // Use a 7-day window for sales
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const url = `${process.env.VERCEL_URL || 'https://flipledger.vercel.app'}/api/ebay-sales?startDate=${startDate}&endDate=${endDate}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      console.error(`[Cron] eBay sales fetch failed: ${response.status}`);
      return { success: false, sales: [] };
    }
    
    const data = await response.json();
    const sales = data.sales || [];
    
    console.log(`[Cron] Fetched ${sales.length} eBay sales`);
    
    // Insert new sales into pending_costs (duplicates rejected by existing logic)
    let inserted = 0;
    for (const sale of sales) {
      try {
        const { error } = await supabaseAdmin
          .from('pending_costs')
          .insert({
            user_id: userId,
            name: sale.name,
            sku: sale.sku || '',
            size: sale.size || '',
            sale_price: sale.sale_price,
            platform: 'eBay',
            fees: sale.fees || 0,
            payout: sale.payout || null,
            sale_date: sale.sale_date,
            order_id: sale.order_id,
            image: sale.image || null,
            delist_processed: false
          });
        
        if (!error) {
          inserted++;
        }
        // Ignore duplicate errors - that's expected
      } catch (e) {
        // Ignore insert errors (duplicates)
      }
    }
    
    console.log(`[Cron] Inserted ${inserted} new eBay sales`);
    return { success: true, sales, inserted };
    
  } catch (err) {
    console.error('[Cron] eBay sync error:', err);
    return { success: false, sales: [], error: err.message };
  }
}

/**
 * Fetch new sales from StockX for a user
 */
async function syncStockXSales(userId, accessToken) {
  try {
    console.log(`[Cron] Syncing StockX sales for user ${userId}...`);
    
    const url = `${process.env.VERCEL_URL || 'https://flipledger.vercel.app'}/api/stockx-sales`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      console.error(`[Cron] StockX sales fetch failed: ${response.status}`);
      return { success: false, sales: [] };
    }
    
    const data = await response.json();
    const sales = data.sales || [];
    
    console.log(`[Cron] Fetched ${sales.length} StockX sales`);
    
    // Insert new sales into pending_costs
    let inserted = 0;
    for (const sale of sales) {
      try {
        const { error } = await supabaseAdmin
          .from('pending_costs')
          .insert({
            user_id: userId,
            name: sale.name,
            sku: sale.sku || '',
            size: sale.size || '',
            sale_price: sale.sale_price,
            platform: sale.platform || 'StockX',
            fees: sale.fees || 0,
            payout: sale.payout || null,
            sale_date: sale.sale_date,
            order_id: sale.order_id,
            image: sale.image || null,
            delist_processed: false
          });
        
        if (!error) {
          inserted++;
        }
      } catch (e) {
        // Ignore insert errors (duplicates)
      }
    }
    
    console.log(`[Cron] Inserted ${inserted} new StockX sales`);
    return { success: true, sales, inserted };
    
  } catch (err) {
    console.error('[Cron] StockX sync error:', err);
    return { success: false, sales: [], error: err.message };
  }
}

/**
 * Process a single user's sales and delists
 */
async function processUser(userId, platforms) {
  const result = {
    userId,
    locked: false,
    ebaySync: null,
    stockxSync: null,
    delists: { processed: 0, success: 0, failed: 0, skipped: 0 }
  };
  
  // STEP 1: Acquire lock
  const lockAcquired = await acquireLock(userId);
  if (!lockAcquired) {
    console.log(`[Cron] Skipping user ${userId} - already locked`);
    result.locked = true;
    return result;
  }
  
  try {
    // STEP 2: Get tokens
    const tokens = { ebayToken: null, stockxToken: null };
    
    if (platforms.includes('ebay')) {
      const ebayResult = await getValidToken(userId, 'ebay');
      if (ebayResult.success) {
        tokens.ebayToken = ebayResult.accessToken;
      } else {
        console.log(`[Cron] No valid eBay token for user ${userId}`);
      }
    }
    
    if (platforms.includes('stockx')) {
      const stockxResult = await getValidToken(userId, 'stockx');
      if (stockxResult.success) {
        tokens.stockxToken = stockxResult.accessToken;
      } else {
        console.log(`[Cron] No valid StockX token for user ${userId}`);
      }
    }
    
    // STEP 3: Sync sales (failures don't block delisting)
    if (tokens.ebayToken) {
      result.ebaySync = await syncEbaySales(userId, tokens.ebayToken);
    }
    
    if (tokens.stockxToken) {
      result.stockxSync = await syncStockXSales(userId, tokens.stockxToken);
    }
    
    // STEP 4: Process unprocessed sales for delisting
    // Only if we have BOTH tokens (need both to delist cross-platform)
    if (tokens.ebayToken && tokens.stockxToken) {
      const unprocessedSales = await getUnprocessedSales(userId);
      console.log(`[Cron] Found ${unprocessedSales.length} unprocessed sales for user ${userId}`);
      
      for (const sale of unprocessedSales) {
        try {
          const delistResult = await processDelistForSale(sale, tokens);
          result.delists.processed++;
          
          if (delistResult.status === 'success') {
            result.delists.success++;
          } else if (delistResult.status === 'skipped' || delistResult.status === 'not_found') {
            result.delists.skipped++;
          } else {
            result.delists.failed++;
          }
        } catch (err) {
          console.error(`[Cron] Error processing sale ${sale.id}:`, err);
          result.delists.failed++;
        }
      }
    } else {
      console.log(`[Cron] Skipping delist processing - need both eBay and StockX tokens`);
    }
    
  } finally {
    // STEP 5: Always release lock
    await releaseLock(userId);
  }
  
  return result;
}

/**
 * Main cron handler
 */
export default async function handler(req, res) {
  // Only allow GET (Vercel Cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Verify cron secret
  if (!verifyCronSecret(req)) {
    console.log('[Cron] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('[Cron] ═══════════════════════════════════════════════════');
  console.log('[Cron] SYNC AND DELIST CRON STARTED');
  console.log('[Cron] Time:', new Date().toISOString());
  console.log('[Cron] ═══════════════════════════════════════════════════');
  
  try {
    // Get all users with stored tokens
    const users = await getUsersWithTokens();
    console.log(`[Cron] Found ${users.length} users with tokens`);
    
    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users with tokens to process',
        timestamp: new Date().toISOString()
      });
    }
    
    // Process each user
    const results = [];
    for (const user of users) {
      console.log(`\n[Cron] Processing user ${user.userId} (platforms: ${user.platforms.join(', ')})`);
      
      try {
        const result = await processUser(user.userId, user.platforms);
        results.push(result);
      } catch (err) {
        console.error(`[Cron] Error processing user ${user.userId}:`, err);
        results.push({
          userId: user.userId,
          error: err.message
        });
      }
    }
    
    // Summary
    const summary = {
      usersProcessed: results.filter(r => !r.locked && !r.error).length,
      usersSkipped: results.filter(r => r.locked).length,
      usersErrored: results.filter(r => r.error).length,
      totalDelists: results.reduce((sum, r) => sum + (r.delists?.processed || 0), 0),
      successfulDelists: results.reduce((sum, r) => sum + (r.delists?.success || 0), 0)
    };
    
    console.log('\n[Cron] ═══════════════════════════════════════════════════');
    console.log('[Cron] CRON COMPLETED');
    console.log('[Cron] Summary:', JSON.stringify(summary));
    console.log('[Cron] ═══════════════════════════════════════════════════\n');
    
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      results
    });
    
  } catch (err) {
    console.error('[Cron] Fatal error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}
