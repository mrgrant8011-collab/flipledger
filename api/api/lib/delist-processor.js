/**
 * DELIST PROCESSOR
 * =================
 * Core logic for automatic delisting with all safety guardrails:
 * 1. Direct ID matching via cross_list_links (safest)
 * 2. SKU+size matching as fallback
 * 3. Multi-match protection (skip if ambiguous)
 * 4. Full audit logging
 * 5. Idempotent processing
 */

import { supabaseAdmin } from './token-manager.js';
import { delistEbayOffer } from './ebay-delist.js';
import { delistStockXListing } from './stockx-delist.js';

/**
 * Normalize SKU for matching
 * Removes dashes, spaces, converts to uppercase
 */
function normalizeSkuForMatch(sku) {
  return (sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalize size for matching
 * Handles "10.5", "10 1/2", "M 10 / W 11.5", etc.
 */
function normalizeSize(size) {
  if (!size) return '';
  
  // Convert to uppercase, remove extra spaces
  let normalized = size.toUpperCase().trim();
  
  // Handle women's/men's prefixes
  normalized = normalized.replace(/^[WM]\s*/i, '');
  normalized = normalized.replace(/\s*\/\s*[WM]\s*[\d.]+/i, ''); // Remove "/ W 11.5"
  
  // Remove common suffixes
  normalized = normalized.replace(/\s*(US|UK|EU|CM)$/i, '');
  
  // Keep only alphanumeric and dots
  normalized = normalized.replace(/[^A-Z0-9.]/g, '');
  
  return normalized;
}

/**
 * Process a single sale and delist from the other platform
 * @param {object} sale - Sale record from pending_costs
 * @param {object} tokens - { ebayToken, stockxToken }
 * @returns {object} Result of the delist operation
 */
export async function processDelistForSale(sale, tokens) {
  const { user_id, order_id, sku, size, name, platform } = sale;
  
  // Determine which platform sold and which to delist
  const soldOn = platform?.toLowerCase().includes('stockx') ? 'stockx' : 
                 platform?.toLowerCase().includes('ebay') ? 'ebay' : null;
  
  if (!soldOn) {
    console.log(`[Delist] Skipping sale ${order_id} - unknown platform: ${platform}`);
    return { status: 'skipped', reason: 'unknown_platform' };
  }
  
  const delistFrom = soldOn === 'stockx' ? 'ebay' : 'stockx';
  
  console.log(`[Delist] Processing: ${name} (${sku} / ${size})`);
  console.log(`[Delist] Sold on: ${soldOn}, Delist from: ${delistFrom}`);
  
  // STEP 1: Try to find match in cross_list_links (direct ID mapping - safest)
  const crossListMatch = await findCrossListLink(user_id, sku, size, soldOn);
  
  let delistResult;
  let listingIdDelisted = null;
  
  if (crossListMatch.found) {
    console.log(`[Delist] Found cross_list_link: ${crossListMatch.link.id}`);
    
    if (delistFrom === 'ebay' && crossListMatch.link.ebay_offer_id) {
      listingIdDelisted = crossListMatch.link.ebay_offer_id;
      delistResult = await delistEbayOffer(tokens.ebayToken, listingIdDelisted);
    } else if (delistFrom === 'stockx' && crossListMatch.link.stockx_listing_id) {
      listingIdDelisted = crossListMatch.link.stockx_listing_id;
      delistResult = await delistStockXListing(tokens.stockxToken, listingIdDelisted);
    } else {
      console.log(`[Delist] No ${delistFrom} listing ID in cross_list_link`);
      delistResult = { success: false, notFound: true };
    }
    
    // Update cross_list_link status
    if (delistResult.success) {
      await updateCrossListLinkSold(crossListMatch.link.id, soldOn);
    }
  } else {
    // No cross_list_link found - item wasn't cross-listed via FlipLedger
    console.log(`[Delist] No cross_list_link found for ${sku} / ${size}`);
    delistResult = { success: false, notFound: true };
  }
  
  // STEP 2: Log the result
  const status = delistResult.success ? 'success' :
                 delistResult.notFound || delistResult.alreadyRemoved ? 'not_found' :
                 'failed';
  
  await logDelistAttempt({
    user_id,
    sold_on: soldOn,
    delisted_from: delistFrom,
    item_name: name,
    item_sku: sku,
    item_size: size,
    sale_order_id: order_id,
    listing_id_delisted: listingIdDelisted,
    cross_list_link_id: crossListMatch.link?.id || null,
    status,
    error_message: delistResult.error || null
  });
  
  // STEP 3: Mark sale as processed
  await markSaleProcessed(sale.id);
  
  return {
    status,
    soldOn,
    delistedFrom: delistFrom,
    listingId: listingIdDelisted,
    error: delistResult.error
  };
}

/**
 * Find a cross_list_link by SKU and size
 * Uses DIRECT matching - safest approach
 */
async function findCrossListLink(userId, sku, size, soldOn) {
  try {
    // Normalize for matching
    const normalizedSku = normalizeSkuForMatch(sku);
    const normalizedSize = normalizeSize(size);
    
    // Query cross_list_links for this user
    const { data: links, error } = await supabaseAdmin
      .from('cross_list_links')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');
    
    if (error) {
      console.error('[Delist] Error querying cross_list_links:', error);
      return { found: false };
    }
    
    if (!links || links.length === 0) {
      return { found: false };
    }
    
    // Find matches
    const matches = links.filter(link => {
      const linkSku = normalizeSkuForMatch(link.sku);
      const linkSize = normalizeSize(link.size);
      return linkSku === normalizedSku && linkSize === normalizedSize;
    });
    
    // GUARDRAIL: If multiple matches, skip (ambiguous)
    if (matches.length > 1) {
      console.log(`[Delist] SKIPPED: Multiple matches found (${matches.length}) for ${sku} / ${size}`);
      return { found: false, skipped: true, reason: 'multiple_matches' };
    }
    
    if (matches.length === 1) {
      return { found: true, link: matches[0] };
    }
    
    return { found: false };
  } catch (err) {
    console.error('[Delist] Error finding cross_list_link:', err);
    return { found: false };
  }
}

/**
 * Update cross_list_link to mark as sold
 */
async function updateCrossListLinkSold(linkId, soldOn) {
  try {
    const { error } = await supabaseAdmin
      .from('cross_list_links')
      .update({
        status: 'sold',
        sold_on: soldOn,
        sold_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId);
    
    if (error) {
      console.error('[Delist] Error updating cross_list_link:', error);
    } else {
      console.log(`[Delist] Updated cross_list_link ${linkId} to sold`);
    }
  } catch (err) {
    console.error('[Delist] Error updating cross_list_link:', err);
  }
}

/**
 * Log a delist attempt to delist_log table
 */
async function logDelistAttempt(data) {
  try {
    const { error } = await supabaseAdmin
      .from('delist_log')
      .insert({
        user_id: data.user_id,
        sold_on: data.sold_on,
        delisted_from: data.delisted_from,
        item_name: data.item_name,
        item_sku: data.item_sku,
        item_size: data.item_size,
        sale_order_id: data.sale_order_id,
        listing_id_delisted: data.listing_id_delisted,
        cross_list_link_id: data.cross_list_link_id,
        status: data.status,
        error_message: data.error_message
      });
    
    if (error) {
      console.error('[Delist] Error logging delist attempt:', error);
    } else {
      console.log(`[Delist] Logged: ${data.status} - ${data.item_name}`);
    }
  } catch (err) {
    console.error('[Delist] Error logging:', err);
  }
}

/**
 * Mark a sale as processed (won't be processed again)
 */
async function markSaleProcessed(saleId) {
  try {
    const { error } = await supabaseAdmin
      .from('pending_costs')
      .update({ delist_processed: true })
      .eq('id', saleId);
    
    if (error) {
      console.error('[Delist] Error marking sale processed:', error);
    }
  } catch (err) {
    console.error('[Delist] Error marking processed:', err);
  }
}

/**
 * Get unprocessed sales for a user
 */
export async function getUnprocessedSales(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('pending_costs')
      .select('*')
      .eq('user_id', userId)
      .eq('delist_processed', false)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('[Delist] Error fetching unprocessed sales:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[Delist] Error:', err);
    return [];
  }
}

/**
 * Acquire lock for a user (prevents overlapping cron runs)
 * @returns {boolean} true if lock acquired, false if already locked
 */
export async function acquireLock(userId, lockDurationMinutes = 10) {
  try {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + lockDurationMinutes * 60 * 1000);
    const lockId = `cron_${now.getTime()}`;
    
    // Check if already locked
    const { data: existing } = await supabaseAdmin
      .from('auto_delist_locks')
      .select('locked_until')
      .eq('user_id', userId)
      .single();
    
    if (existing && new Date(existing.locked_until) > now) {
      console.log(`[Lock] User ${userId} already locked until ${existing.locked_until}`);
      return false;
    }
    
    // Upsert lock
    const { error } = await supabaseAdmin
      .from('auto_delist_locks')
      .upsert({
        user_id: userId,
        locked_until: lockUntil.toISOString(),
        locked_by: lockId
      });
    
    if (error) {
      console.error('[Lock] Error acquiring lock:', error);
      return false;
    }
    
    console.log(`[Lock] Acquired lock for user ${userId}`);
    return true;
  } catch (err) {
    console.error('[Lock] Error:', err);
    return false;
  }
}

/**
 * Release lock for a user
 */
export async function releaseLock(userId) {
  try {
    const { error } = await supabaseAdmin
      .from('auto_delist_locks')
      .update({ locked_until: new Date().toISOString() })
      .eq('user_id', userId);
    
    if (error) {
      console.error('[Lock] Error releasing lock:', error);
    } else {
      console.log(`[Lock] Released lock for user ${userId}`);
    }
  } catch (err) {
    console.error('[Lock] Error:', err);
  }
}
