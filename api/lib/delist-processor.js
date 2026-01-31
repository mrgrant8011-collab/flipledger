import { supabaseAdmin } from './token-manager.js';
import { delistEbayOffer } from './ebay-delist.js';
import { delistStockXListing } from './stockx-delist.js';

function normalizeSkuForMatch(sku) {
  return (sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeSize(size) {
  if (!size) return '';
  let normalized = size.toUpperCase().trim();
  normalized = normalized.replace(/^[WM]\s*/i, '');
  normalized = normalized.replace(/\s*\/\s*[WM]\s*[\d.]+/i, '');
  normalized = normalized.replace(/\s*(US|UK|EU|CM)$/i, '');
  normalized = normalized.replace(/[^A-Z0-9.]/g, '');
  return normalized;
}

export async function processDelistForSale(sale, tokens) {
  const { user_id, order_id, sku, size, name, platform } = sale;
  
  const soldOn = platform?.toLowerCase().includes('stockx') ? 'stockx' : 
                 platform?.toLowerCase().includes('ebay') ? 'ebay' : null;
  
  if (!soldOn) {
    return { status: 'skipped', reason: 'unknown_platform' };
  }
  
  const delistFrom = soldOn === 'stockx' ? 'ebay' : 'stockx';
  
  const crossListMatch = await findCrossListLink(user_id, sku, size, soldOn);
  
  let delistResult;
  let listingIdDelisted = null;
  
  if (crossListMatch.found) {
    if (delistFrom === 'ebay' && crossListMatch.link.ebay_offer_id) {
      listingIdDelisted = crossListMatch.link.ebay_offer_id;
      delistResult = await delistEbayOffer(tokens.ebayToken, listingIdDelisted);
    } else if (delistFrom === 'stockx' && crossListMatch.link.stockx_listing_id) {
      listingIdDelisted = crossListMatch.link.stockx_listing_id;
      delistResult = await delistStockXListing(tokens.stockxToken, listingIdDelisted);
    } else {
      delistResult = { success: false, notFound: true };
    }
    
    if (delistResult.success) {
      await updateCrossListLinkSold(crossListMatch.link.id, soldOn);
    }
  } else {
    delistResult = { success: false, notFound: true };
  }
  
  const status = delistResult.success ? 'success' :
                 delistResult.notFound || delistResult.alreadyRemoved ? 'not_found' : 'failed';
  
  await logDelistAttempt({
    user_id, sold_on: soldOn, delisted_from: delistFrom,
    item_name: name, item_sku: sku, item_size: size,
    sale_order_id: order_id, listing_id_delisted: listingIdDelisted,
    cross_list_link_id: crossListMatch.link?.id || null,
    status, error_message: delistResult.error || null
  });
  
  await markSaleProcessed(sale.id);
  
  return { status, soldOn, delistedFrom: delistFrom, listingId: listingIdDelisted, error: delistResult.error };
}

async function findCrossListLink(userId, sku, size, soldOn) {
  try {
    const normalizedSku = normalizeSkuForMatch(sku);
    const normalizedSize = normalizeSize(size);
    
    const { data: links, error } = await supabaseAdmin
      .from('cross_list_links')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');
    
    if (error || !links || links.length === 0) return { found: false };
    
    const matches = links.filter(link => {
      const linkSku = normalizeSkuForMatch(link.sku);
      const linkSize = normalizeSize(link.size);
      return linkSku === normalizedSku && linkSize === normalizedSize;
    });
    
    if (matches.length > 1) return { found: false, skipped: true, reason: 'multiple_matches' };
    if (matches.length === 1) return { found: true, link: matches[0] };
    return { found: false };
  } catch (err) {
    return { found: false };
  }
}

async function updateCrossListLinkSold(linkId, soldOn) {
  try {
    await supabaseAdmin.from('cross_list_links').update({
      status: 'sold', sold_on: soldOn, sold_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', linkId);
  } catch (err) {}
}

async function logDelistAttempt(data) {
  try {
    await supabaseAdmin.from('delist_log').insert({
      user_id: data.user_id, sold_on: data.sold_on, delisted_from: data.delisted_from,
      item_name: data.item_name, item_sku: data.item_sku, item_size: data.item_size,
      sale_order_id: data.sale_order_id, listing_id_delisted: data.listing_id_delisted,
      cross_list_link_id: data.cross_list_link_id, status: data.status, error_message: data.error_message
    });
  } catch (err) {}
}

async function markSaleProcessed(saleId) {
  try {
    await supabaseAdmin.from('pending_costs').update({ delist_processed: true }).eq('id', saleId);
  } catch (err) {}
}

export async function getUnprocessedSales(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('pending_costs')
      .select('*')
      .eq('user_id', userId)
      .eq('delist_processed', false)
      .order('created_at', { ascending: true });
    
    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}

export async function acquireLock(userId, lockDurationMinutes = 10) {
  try {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + lockDurationMinutes * 60 * 1000);
    
    const { data: existing } = await supabaseAdmin
      .from('auto_delist_locks')
      .select('locked_until')
      .eq('user_id', userId)
      .single();
    
    if (existing && new Date(existing.locked_until) > now) return false;
    
    await supabaseAdmin.from('auto_delist_locks').upsert({
      user_id: userId, locked_until: lockUntil.toISOString(), locked_by: `cron_${now.getTime()}`
    });
    
    return true;
  } catch (err) {
    return false;
  }
}

export async function releaseLock(userId) {
  try {
    await supabaseAdmin.from('auto_delist_locks').update({ locked_until: new Date().toISOString() }).eq('user_id', userId);
  } catch (err) {}
}
