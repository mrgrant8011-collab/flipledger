import { getValidToken, getUsersWithTokens, updateNextCheck, supabaseAdmin } from '../lib/token-manager.js';
import { acquireLock, releaseLock } from '../lib/delist-processor.js';
import { delistEbayOffer, reduceEbayQuantity } from '../lib/ebay-delist.js';
import { delistStockXListing } from '../lib/stockx-delist.js';

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://flipledgerhq.com';
}

function verifyCronSecret(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

function isRetryableErrorMessage(errorMessage = '') {
  const msg = (errorMessage || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('socket') ||
    msg.includes('rate limit') ||
    msg.includes('401') ||
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('temporar') ||
    msg.includes('unavailable') ||
    msg.includes('connection') ||
    msg.includes('reset from stale processing state')
  );
}

async function resetStaleProcessingJobs() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('delist_log')
      .update({
        status: 'failed',
        error_message: 'Reset from stale processing state',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'processing')
      .lt('updated_at', fifteenMinutesAgo)
      .select('id, order_number');
    if (error) {
      console.error('[Cron] Failed to reset stale jobs:', error.message);
      return;
    }
    if (data?.length > 0) {
      console.log(`[Cron] Reset ${data.length} stale processing job(s)`);
    }
  } catch (err) {
    console.error('[Cron] Failed to reset stale jobs:', err.message);
  }
}

async function retryFailedJobs(userId, tokens, activeMappings) {
  try {
    const oneHourAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failedJobs, error } = await supabaseAdmin
      .from('delist_log')
      .select(`id, order_number, sold_on, delisted_from, cross_list_link_id,
        listing_id_delisted, item_sku, item_size, error_message, retry_count, updated_at`)
      .eq('user_id', userId)
      .eq('status', 'failed')
      .lt('retry_count', 3)
      .gt('updated_at', oneHourAgo)
      .order('updated_at', { ascending: true })
      .limit(10);
    if (error) {
      console.error('[Cron] Failed job lookup error:', error.message);
      return;
    }
    if (!failedJobs || failedJobs.length === 0) return;
    console.log(`[Cron] Found ${failedJobs.length} retryable failed job(s) for user ${userId}`);
    for (const job of failedJobs) {
      if (!isRetryableErrorMessage(job.error_message)) {
        console.log(`[Cron] Non-retryable failed job ${job.order_number}, skipping`);
        continue;
      }
      const match = activeMappings.find(m => m.id === job.cross_list_link_id);
      if (!match) {
        console.log(`[Cron] Retry skipped, mapping missing for ${job.order_number}`);
        continue;
      }
      try {
        const retryCount = (job.retry_count || 0) + 1;
        const { error: markProcessingError } = await supabaseAdmin
          .from('delist_log')
          .update({
            status: 'processing',
            retry_count: retryCount,
            error_message: `Retry attempt ${retryCount}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)
          .eq('status', 'failed');
        if (markProcessingError) {
          console.error(`[Cron] Retry claim failed for ${job.order_number}:`, markProcessingError.message);
          continue;
        }
        let delistResult = { success: false, error: 'Retry path did not run' };
        if (job.sold_on === 'stockx' && job.delisted_from === 'ebay' && match.ebay_offer_id) {
          delistResult = await reduceEbayQuantity(tokens.ebayToken, match.ebay_sku, 0, match.ebay_offer_id);
          if (!delistResult.success && !delistResult.alreadyRemoved && delistResult.liveQty <= 1) {
            delistResult = await delistEbayOffer(tokens.ebayToken, match.ebay_offer_id);
          }
        } else if (job.sold_on === 'ebay' && job.delisted_from === 'stockx' && match.stockx_listing_id) {
          delistResult = await delistStockXListing(tokens.stockxToken, match.stockx_listing_id);
          if (!delistResult.success && delistResult.error?.includes('401')) {
            await supabaseAdmin.from('user_tokens').update({ access_token: null, expires_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'stockx');
            console.error(`[Cron] StockX token expired during retry for user ${userId} — marked invalid`);
          }
        } else {
          delistResult = { success: false, error: 'Missing listing id for retry' };
        }
        if (delistResult.success || delistResult.alreadyRemoved) {
          await supabaseAdmin.from('cross_list_links').update({
            status: 'sold', sold_on: job.sold_on,
            sold_at: new Date().toISOString(), updated_at: new Date().toISOString()
          }).eq('id', match.id);
          await supabaseAdmin.from('delist_log').update({
            status: 'success', error_message: null, updated_at: new Date().toISOString()
          }).eq('id', job.id);
          console.log(`[Cron] Retry success for ${job.order_number}`);
        } else {
          await supabaseAdmin.from('delist_log').update({
            status: 'failed', error_message: delistResult.error || 'Retry failed',
            updated_at: new Date().toISOString()
          }).eq('id', job.id);
          console.error(`[Cron] Retry failed for ${job.order_number}: ${delistResult.error || 'Unknown error'}`);
        }
      } catch (err) {
        await supabaseAdmin.from('delist_log').update({
          status: 'failed', error_message: err.message, updated_at: new Date().toISOString()
        }).eq('id', job.id);
        console.error(`[Cron] Retry execution error for ${job.order_number}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Retry failed jobs error:', err.message);
  }
}

async function fetchStockXActiveOrders(accessToken) {
  const LOOKBACK_DAYS = 7;
  const MAX_PAGES = 20;
  const cutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  try {
    let allOrders = [];
    let pageNumber = 1;
    let shouldContinue = true;

    while (shouldContinue && pageNumber <= MAX_PAGES) {
      const url = `https://api.stockx.com/v2/selling/orders/active?pageSize=100&pageNumber=${pageNumber}&orderStatus=CREATED`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': process.env.STOCKX_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) break;
      const data = await res.json();
      const orders = data.orders || [];
      if (orders.length === 0) break;

      allOrders.push(...orders);

      const pageHasRelevantOrders = orders.some(order => {
        const createdMs = new Date(order.createdAt || order.updatedAt).getTime();
        return Number.isFinite(createdMs) && createdMs >= cutoffMs;
      });

      if (!pageHasRelevantOrders) {
        shouldContinue = false;
        break;
      }

      if (!data.hasNextPage || orders.length < 100) break;
      pageNumber++;
    }

    const relevantOrders = allOrders.filter(order => {
      const createdMs = new Date(order.createdAt || order.updatedAt).getTime();
      return Number.isFinite(createdMs) && createdMs >= cutoffMs;
    });

    console.log(`[Cron] StockX fetch: ${pageNumber} page(s), ${allOrders.length} total, ${relevantOrders.length} relevant (last ${LOOKBACK_DAYS} days)`);

    return relevantOrders;
  } catch (err) {
    console.error('[Cron] StockX active orders fetch error:', err.message);
    return [];
  }
}

async function processUser(userId, platforms) {
  const result = { userId, locked: false, activeMappings: 0, stockxSales: 0, ebaySales: 0, delisted: 0, failed: 0 };

  const lockAcquired = await acquireLock(userId);
  if (!lockAcquired) { result.locked = true; return result; }

  try {
    const tokens = { ebayToken: null, stockxToken: null };

    if (platforms.includes('ebay')) {
      const r = await getValidToken(userId, 'ebay');
      if (r.success) tokens.ebayToken = r.accessToken;
    }
    if (platforms.includes('stockx')) {
      const r = await getValidToken(userId, 'stockx');
      if (r.success) tokens.stockxToken = r.accessToken;
    }

    if (!tokens.ebayToken || !tokens.stockxToken) return result;

    const { data: activeMappings } = await supabaseAdmin
      .from('cross_list_links')
     .select('id, user_id, sku, size, status, stockx_listing_id, ebay_offer_id, ebay_sku')
      .eq('user_id', userId)
      .eq('status', 'active');

   if (!activeMappings || activeMappings.length === 0) return result;
    result.activeMappings = activeMappings.length;
   const sampleMappings = activeMappings.slice(0, 5).map(m => `${m.sku}/${m.size}`);
    console.log(`[Cron] Active mappings: ${activeMappings.length} | samples: ${sampleMappings.join(', ')}`);

    // Retry recent transient failures before processing fresh sales
    await retryFailedJobs(userId, tokens, activeMappings);

    // ═══════════════════════════════════════════════════════
    // DIRECTION 1: StockX confirmed sale → delist from eBay
    // ═══════════════════════════════════════════════════════
    try {
      const sxOrders = await fetchStockXActiveOrders(tokens.stockxToken);
      result.stockxSales = sxOrders.length;

      // Fetch already-processed order numbers to avoid double-processing
      const { data: processedOrders } = await supabaseAdmin
        .from('delist_log')
       .select('order_number, status')
        .eq('user_id', userId)
        .not('order_number', 'is', null)
        .limit(1000);
      const processedOrderNumbers = new Set(
        (processedOrders || [])
          .filter(o => o.status === 'success' || o.status === 'not_found')
          .map(o => o.order_number)
      );

     for (const order of sxOrders) {
        // Skip if already processed
        if (processedOrderNumbers.has(order.orderNumber)) {
          console.log(`[Cron] Skipping already-processed order: ${order.orderNumber}`);
          continue;
        }

        const variant = order.variant || {};
        const product = order.product || {};
        const orderSku = (product.styleId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const orderSize = (variant.variantValue || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        console.log(`[Cron] StockX order: ${order.orderNumber} | status=${order.status} | createdAt=${order.createdAt} | styleId: ${product.styleId} | size: ${variant.variantValue} | normalized: ${orderSku} / ${orderSize}`);

        const orderListingId = order.listingId || null;
        const orderAskId = order.askId || null;

        // Primary: match by listingId/askId (direct ID match)
        let match =
          (orderListingId && activeMappings.find(m => m.stockx_listing_id === orderListingId)) ||
          (orderAskId && activeMappings.find(m => m.stockx_listing_id === orderAskId)) ||
          null;

        // Fallback: styleId + size matching
        if (!match) {
          match = activeMappings.find(m => {
            const mSku = (m.sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const mSize = (m.size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return (mSku === orderSku || mSku.includes(orderSku) || orderSku.includes(mSku)) && mSize === orderSize;
          });
        }

        console.log(`[Cron] Order ${order.orderNumber} listingId=${orderListingId} askId=${orderAskId} -> match=${match ? match.id : 'NONE'}`);

      // Extra debug for AR3565
        if (orderSku.includes('AR3565')) {
          const ar3565 = activeMappings.filter(m => (m.sku || '').includes('AR3565'));
          console.log(`[Cron] AR3565 debug: found ${ar3565.length} mappings in array`);
          ar3565.forEach(m => {
            const mSku = (m.sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const mSize = (m.size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            console.log(`[Cron]   mapping: sku=${m.sku} normalized=${mSku} size=${m.size} normalized=${mSize} | vs order: ${orderSku}/${orderSize} | skuMatch=${mSku === orderSku || mSku.includes(orderSku) || orderSku.includes(mSku)} sizeMatch=${mSize === orderSize}`);
          });
        }
        console.log(`[Cron] Match result for ${orderSku}/${orderSize}: ${match ? `FOUND (id=${match.id}, ebay_offer_id=${match.ebay_offer_id})` : 'NO MATCH'}`);

       if (match && match.ebay_offer_id) {
          try {
            // CLAIM this order before doing anything — prevents double-processing
            const claim = await supabaseAdmin
              .from('delist_log')
              .upsert({
                user_id: userId, sold_on: 'stockx', delisted_from: 'ebay',
                order_number: order.orderNumber, status: 'processing',
                item_sku: match.sku, item_size: match.size,
                listing_id_delisted: match.ebay_offer_id,
                cross_list_link_id: match.id
              }, { onConflict: 'user_id,order_number', ignoreDuplicates: true })
              .select('status');

            if (claim.error) console.error('[Cron] D1 Claim error:', JSON.stringify(claim.error));
            const inserted = Array.isArray(claim.data) && claim.data.length === 1;
                if (!inserted) {
                  console.log(`[Cron] Skipping already-claimed order: ${order.orderNumber}`);
                  continue;
                }

            // QTY SUPPORT: Check how many active links share this eBay listing
            const { data: sharedLinks } = await supabaseAdmin
              .from('cross_list_links')
              .select('id')
              .eq('user_id', userId)
              .eq('ebay_offer_id', match.ebay_offer_id)
              .eq('status', 'active');

           const activeCount = sharedLinks ? sharedLinks.length : 0;
            let delistResult;

            console.log(`[Cron] eBay action: offer=${match.ebay_offer_id} activeCount=${activeCount}`);

            // Always attempt reduce — reduceEbayQuantity fetches real qty and decides
            delistResult = await reduceEbayQuantity(tokens.ebayToken, match.ebay_sku, 0, match.ebay_offer_id);

            // If reduce failed, only withdraw if last unit
            if (!delistResult.success && !delistResult.alreadyRemoved) {
              if (delistResult.liveQty <= 1) {
                console.log(`[Cron] Reduce failed, last unit — withdrawing offer=${match.ebay_offer_id}`);
                delistResult = await delistEbayOffer(tokens.ebayToken, match.ebay_offer_id);
              } else {
                console.error(`[Cron] Reduce failed but liveQty=${delistResult.liveQty} — NOT withdrawing to protect remaining inventory`);
              }
            }
            if (delistResult.success || delistResult.alreadyRemoved) {
              await supabaseAdmin.from('cross_list_links').update({
                status: 'sold', sold_on: 'stockx', sold_at: new Date().toISOString(), updated_at: new Date().toISOString()
              }).eq('id', match.id);

              await supabaseAdmin.from('delist_log').update({
                status: 'success', item_sku: match.sku, item_size: match.size,
                listing_id_delisted: match.ebay_offer_id, cross_list_link_id: match.id
              }).eq('user_id', userId).eq('order_number', order.orderNumber);

              result.delisted++;
              console.log(`[Cron] StockX sale → Delisted from eBay: ${match.sku} size ${match.size}`);
         } else {
              result.failed++;
              await supabaseAdmin.from('delist_log').update({ status: 'failed' })
                .eq('user_id', userId).eq('order_number', order.orderNumber);
              console.error(
                `[Cron] Delist FAILED user=${userId} sku=${match.sku} size=${match.size} ` +
                `offerId=${match.ebay_offer_id} ebay_sku=${match.ebay_sku} activeCount=${activeCount} -> ${JSON.stringify(delistResult)}`
              );
            
            }
          } catch (err) {
            result.failed++;
            console.error('[Cron] eBay delist failed:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('[Cron] StockX orders check error:', err.message);
    }

    // ═══════════════════════════════════════════════════════
    // DIRECTION 2: eBay confirmed sale → delist from StockX
    // ═══════════════════════════════════════════════════════
    try {
      const now = new Date().toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
     const salesUrl = `${getBaseUrl()}/api/ebay-sales?startDate=${weekAgo}&endDate=${now}&user_id=${userId}`;
      const salesRes = await fetch(salesUrl, { headers: { 'Authorization': `Bearer ${tokens.ebayToken}` } });

      if (salesRes.ok) {
        const salesData = await salesRes.json();
        const ebaySales = salesData.sales || [];
        result.ebaySales = ebaySales.length;

        // Fetch already-processed eBay order numbers
        const { data: processedEbayOrders } = await supabaseAdmin
          .from('delist_log')
          .select('order_number, status')
          .eq('user_id', userId)
          .eq('sold_on', 'ebay')
          .not('order_number', 'is', null);
    const processedEbayOrderNumbers = new Set(
      (processedEbayOrders || [])
        .filter(o => o.status === 'success' || o.status === 'not_found')
        .map(o => o.order_number)
    );
        for (const sale of ebaySales) {
          const saleQty = sale.quantity || 1;
          console.log(`[Cron] eBay sale: ${sale.order_id} | sku=${sale.sku} | size=${sale.size} | qty=${saleQty}`);

          // For single qty, quick skip if already processed
          if (saleQty === 1 && sale.order_id && processedEbayOrderNumbers.has(sale.order_id)) {
            console.log(`[Cron] Skipping already-processed eBay order: ${sale.order_id}`);
            continue;
          }

          const saleSku = (sale.sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const saleSize = (sale.size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Find ALL matching mappings for this SKU/size (not just the first)
          const allMatches = activeMappings.filter(m => {
            const mSku = (m.ebay_sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const mSize = (m.size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return m.stockx_listing_id && (mSku === saleSku || mSku.includes(saleSku) || saleSku.includes(mSku)) && mSize === saleSize;
          });

          if (allMatches.length === 0) {
            console.log(`[Cron] eBay sale ${sale.order_id} match: NO MATCH | saleSku=${saleSku} saleSize=${saleSize}`);
            continue;
          }

          console.log(`[Cron] eBay sale ${sale.order_id} matches: ${allMatches.length} for ${saleSku}/${saleSize} (qty=${saleQty})`);

          // Process each unit in the order
          const unitsToProcess = Math.min(saleQty, allMatches.length);
          for (let unitIdx = 0; unitIdx < unitsToProcess; unitIdx++) {
            const match = allMatches[unitIdx];

            // Claim key: base order_id for first unit, _u2/_u3 for additional
            const claimKey = unitIdx === 0 ? sale.order_id : `${sale.order_id}_u${unitIdx + 1}`;

            // Skip if this specific unit already processed
            if (processedEbayOrderNumbers.has(claimKey)) {
              console.log(`[Cron] Skipping already-processed eBay unit: ${claimKey}`);
              continue;
            }

            try {
              const claim = await supabaseAdmin
                .from('delist_log')
                .upsert({
                  user_id: userId, sold_on: 'ebay', delisted_from: 'stockx',
                  order_number: claimKey, status: 'processing',
                  item_sku: match.sku, item_size: match.size,
                  listing_id_delisted: match.stockx_listing_id,
                  cross_list_link_id: match.id
                }, { onConflict: 'user_id,order_number', ignoreDuplicates: true })
                .select('status');

              if (claim.error) console.error('[Cron] D2 Claim error:', JSON.stringify(claim.error));
              const inserted = Array.isArray(claim.data) && claim.data.length === 1;
              if (!inserted) {
                console.log(`[Cron] Skipping already-claimed eBay unit: ${claimKey}`);
                continue;
              }

              const delistResult = await delistStockXListing(tokens.stockxToken, match.stockx_listing_id);

              if (delistResult.success || delistResult.alreadyRemoved) {
                await supabaseAdmin.from('cross_list_links').update({
                  status: 'sold', sold_on: 'ebay', sold_at: new Date().toISOString(), updated_at: new Date().toISOString()
                }).eq('id', match.id);

                await supabaseAdmin.from('delist_log').update({
                  status: 'success'
                }).eq('user_id', userId).eq('order_number', claimKey);

                result.delisted++;
                console.log(`[Cron] eBay sale → Delisted from StockX: ${match.sku} size ${match.size} (unit ${unitIdx + 1}/${saleQty})`);
              } else {
                result.failed++;
                await supabaseAdmin.from('delist_log').update({
                  status: 'failed', error_message: delistResult.error || 'Unknown error'
                }).eq('user_id', userId).eq('order_number', claimKey);
                if (delistResult.error?.includes('401')) {
                  await supabaseAdmin.from('user_tokens').update({ access_token: null, expires_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'stockx');
                  console.error(`[Cron] StockX token expired for user ${userId} — marked invalid`);
                }
                console.error(`[Cron] StockX delist FAILED: ${match.sku} size ${match.size} -> ${JSON.stringify(delistResult)}`);
              }
            } catch (err) {
              result.failed++;
              await supabaseAdmin.from('delist_log').update({
                status: 'failed', error_message: err.message
              }).eq('user_id', userId).eq('order_number', claimKey);
              console.error('[Cron] StockX delist failed:', err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Cron] eBay sales check error:', err.message);
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
    await resetStaleProcessingJobs();
    const users = await getUsersWithTokens();
    if (users.length === 0) {
      return res.status(200).json({ success: true, message: 'No users with tokens', timestamp: new Date().toISOString() });
    }

   const results = [];
    for (const user of users) {
      try {
        const result = await processUser(user.userId, user.platforms);
        results.push(result);
        await updateNextCheck(user.userId, result.delisted > 0 || result.failed > 0);
      } catch (err) {
        results.push({ userId: user.userId, error: err.message });
        await updateNextCheck(user.userId, false);
      }
    }

    return res.status(200).json({ success: true, timestamp: new Date().toISOString(), results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
}
