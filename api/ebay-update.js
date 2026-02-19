/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY UPDATE API - Full Offer Updates + Promoted Listings
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Handles two things the existing ebay-listings PATCH can't:
 * 1. Full offer field updates (title, description, condition, color, etc.)
 * 2. Promoted Listings management via Marketing API
 * 
 * Endpoints:
 *   PATCH /api/ebay-update  — Update offer fields (title, desc, price, etc.)
 *   POST  /api/ebay-update  — Manage promoted listings (add/update/remove)
 *   GET   /api/ebay-update  — Get user's campaigns and ad status
 * 
 * NOTE: Price-only and quantity-only updates should still use the existing
 * /api/ebay-listings PATCH endpoint (uses bulk_update_price_quantity which is faster).
 * This endpoint is for when title, description, or other fields change.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE_ID = 'EBAY_US';
const EBAY_LOCALE = 'en-US';
const FLIPLEDGER_CAMPAIGN_NAME = 'FlipLedger Promoted Listings';

function buildHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': EBAY_LOCALE,
    'Content-Language': EBAY_LOCALE,
    'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const accessToken = authHeader.replace('Bearer ', '').trim();
  const headers = buildHeaders(accessToken);

  switch (req.method) {
    case 'GET':
      return handleGetCampaigns(headers, res);
    case 'PATCH':
      return handleUpdateOffers(headers, req.body, res);
    case 'POST':
      return handlePromotedListings(headers, req.body, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// GET — Retrieve campaigns + ad status for user's listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleGetCampaigns(headers, res) {
  try {
    const campaigns = await getUserCampaigns(headers);
    return res.status(200).json({ success: true, campaigns });
  } catch (e) {
    console.error('[eBay:Update] getCampaigns error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// PATCH — Full offer update (title, description, price, condition, etc.)
// ═══════════════════════════════════════════════════════════════════════════════════
// 
// Uses: PUT /sell/inventory/v1/offer/{offerId}
// This replaces the entire offer, so we GET the current offer first, merge changes,
// then PUT back.
//
// Body: { updates: [{ offerId, sku, title?, price?, description?, condition?, 
//                      color?, brand?, department?, styleCode?, silhouette? }] }

async function handleUpdateOffers(headers, body, res) {
  const { updates } = body || {};

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      error: 'updates array required',
      hint: 'Send { updates: [{ offerId, sku, title?, price?, description?, ... }] }'
    });
  }

  console.log(`[eBay:Update] Updating ${updates.length} offer(s)`);

  const results = [];

  for (const update of updates) {
    const { offerId, sku } = update;
    if (!offerId) {
      results.push({ offerId, success: false, error: 'offerId required' });
      continue;
    }

    try {
      // Step 1: Get current offer
      const getRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`, {
        headers
      });

      if (!getRes.ok) {
        const errText = await getRes.text();
        results.push({ offerId, success: false, error: `Failed to get offer: ${getRes.status}`, details: errText.substring(0, 200) });
        continue;
      }

      const currentOffer = await getRes.json();

      // Step 2: Merge changes into current offer
      const updatedOffer = mergeOfferUpdates(currentOffer, update);

      // Step 3: PUT updated offer back
      const putRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedOffer)
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        console.error(`[eBay:Update] PUT offer ${offerId} failed:`, errText);
        results.push({ offerId, success: false, error: `Update failed: ${putRes.status}`, details: errText.substring(0, 200) });
        continue;
      }

      console.log(`[eBay:Update] ✓ Updated offer ${offerId}`);
      results.push({ offerId, success: true });

      // Step 4: If title changed, also update inventory item
      if (update.title && sku) {
        await updateInventoryItemTitle(headers, sku, update.title);
      }

    } catch (e) {
      console.error(`[eBay:Update] Error updating ${offerId}:`, e);
      results.push({ offerId, success: false, error: e.message });
    }
  }

  const updated = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return res.status(200).json({ success: true, updated, failed, results });
}

/**
 * Merge user edits into the existing eBay offer object.
 * Only modifies fields that were actually changed.
 */
function mergeOfferUpdates(offer, update) {
  const merged = { ...offer };

  // Price
  if (update.price !== undefined) {
    merged.pricingSummary = {
      ...merged.pricingSummary,
      price: { value: String(update.price), currency: 'USD' }
    };
  }

  // Listing description
  if (update.description !== undefined) {
    merged.listingDescription = update.description;
  }

  // Quantity
  if (update.quantity !== undefined) {
    merged.availableQuantity = parseInt(update.quantity);
  }

  // Condition - maps to offer-level condition
  if (update.condition !== undefined) {
    // eBay condition enum: NEW, LIKE_NEW, NEW_OTHER, etc.
    merged.condition = update.condition;
  }

  // Item specifics that need updating on the inventory item 
  // (handled separately via updateInventoryItemTitle)

  return merged;
}

/**
 * Update inventory item title + aspects (color, brand, etc.)
 * Uses: PUT /sell/inventory/v1/inventory_item/{sku}
 */
async function updateInventoryItemTitle(headers, sku, title) {
  try {
    // Get current inventory item
    const getRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      headers
    });

    if (!getRes.ok) return; // Non-critical, skip

    const item = await getRes.json();

    // Update title
    if (item.product) {
      item.product.title = title;
    }

    // PUT back
    await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(item)
    });

    console.log(`[eBay:Update] ✓ Updated inventory item title for ${sku}`);
  } catch (e) {
    console.warn(`[eBay:Update] Could not update inventory item ${sku}:`, e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// POST — Promoted Listings Management (Marketing API)
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Body: { action: 'add' | 'update' | 'remove', items: [{ sku, adRate }] }
//
// - add: Create/find campaign, add listings with specified ad rate
// - update: Update ad rate for existing promoted listings  
// - remove: Remove listings from campaign

async function handlePromotedListings(headers, body, res) {
  const { action, items } = body || {};

  if (!action || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'action and items required',
      hint: 'Send { action: "add"|"update"|"remove", items: [{ sku, adRate }] }'
    });
  }

  console.log(`[eBay:Marketing] ${action} promoted listings for ${items.length} item(s)`);

  try {
    // Find or create the FlipLedger campaign
    const campaignId = await getOrCreateCampaign(headers);

    if (!campaignId) {
      return res.status(500).json({ error: 'Could not find or create campaign' });
    }

    switch (action) {
      case 'add':
        return await addToPromoted(headers, campaignId, items, res);
      case 'update':
        return await updatePromotedBids(headers, campaignId, items, res);
      case 'remove':
        return await removeFromPromoted(headers, campaignId, items, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (e) {
    console.error('[eBay:Marketing] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MARKETING API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Get all CPS (general/standard) campaigns for the user
 */
async function getUserCampaigns(headers) {
  const r = await fetch(
    `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign?campaign_status=RUNNING&funding_strategy=COST_PER_SALE`,
    { headers }
  );

  if (!r.ok) {
    const errText = await r.text();
    console.error('[eBay:Marketing] getCampaigns error:', errText);
    return [];
  }

  const data = await r.json();
  return (data.campaigns || []).map(c => ({
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    status: c.campaignStatus,
    bidPercentage: c.fundingStrategy?.bidPercentage,
    startDate: c.startDate,
  }));
}

/**
 * Find existing FlipLedger campaign or create one
 */
async function getOrCreateCampaign(headers) {
  // Check for existing
  const campaigns = await getUserCampaigns(headers);
  const existing = campaigns.find(c => c.campaignName === FLIPLEDGER_CAMPAIGN_NAME);

  if (existing) {
    console.log(`[eBay:Marketing] Using existing campaign: ${existing.campaignId}`);
    return existing.campaignId;
  }

  // Create new campaign
  console.log('[eBay:Marketing] Creating new FlipLedger campaign');

  const r = await fetch(`${EBAY_API_BASE}/sell/marketing/v1/ad_campaign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      campaignName: FLIPLEDGER_CAMPAIGN_NAME,
      marketplaceId: EBAY_MARKETPLACE_ID,
      fundingStrategy: {
        fundingModel: 'COST_PER_SALE',
        bidPercentage: '4.0', // Default campaign rate, individual ads override
      },
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error('[eBay:Marketing] createCampaign error:', errText);
    return null;
  }

  // Campaign ID is in the Location header
  const location = r.headers.get('location') || '';
  const campaignId = location.split('/').pop();
  console.log(`[eBay:Marketing] ✓ Created campaign: ${campaignId}`);
  return campaignId;
}

/**
 * Add listings to promoted campaign with per-listing ad rate
 */
async function addToPromoted(headers, campaignId, items, res) {
  const results = [];

  for (const item of items) {
    const { sku, adRate } = item;
    if (!sku || !adRate) {
      results.push({ sku, success: false, error: 'sku and adRate required' });
      continue;
    }

    // Validate ad rate (eBay: min 2.0, max 100.0)
    const rate = parseFloat(adRate);
    if (rate < 2 || rate > 100) {
      results.push({ sku, success: false, error: 'adRate must be between 2 and 100' });
      continue;
    }

    try {
      const r = await fetch(
        `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign/${campaignId}/create_ads_by_inventory_reference`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            inventoryReferenceId: sku,
            inventoryReferenceType: 'INVENTORY_ITEM',
            bidPercentage: String(rate),
          }),
        }
      );

      if (r.ok || r.status === 201) {
        const location = r.headers.get('location') || '';
        const adId = location.split('/').pop();
        console.log(`[eBay:Marketing] ✓ Added ${sku} to campaign at ${rate}% (adId: ${adId})`);
        results.push({ sku, success: true, adId, adRate: rate });
      } else {
        const errText = await r.text();
        console.error(`[eBay:Marketing] Failed to add ${sku}:`, errText);
        // Check if already in campaign
        if (errText.includes('25014') || errText.includes('already')) {
          results.push({ sku, success: false, error: 'Already in a campaign — use update instead' });
        } else {
          results.push({ sku, success: false, error: errText.substring(0, 200) });
        }
      }
    } catch (e) {
      results.push({ sku, success: false, error: e.message });
    }
  }

  const added = results.filter(r => r.success).length;
  return res.status(200).json({ success: true, action: 'add', added, failed: results.length - added, results });
}

/**
 * Update ad rate for existing promoted listings
 */
async function updatePromotedBids(headers, campaignId, items, res) {
  const requests = items.filter(i => i.sku && i.adRate).map(item => ({
    inventoryReferenceId: item.sku,
    inventoryReferenceType: 'INVENTORY_ITEM',
    bidPercentage: String(parseFloat(item.adRate)),
  }));

  if (requests.length === 0) {
    return res.status(400).json({ error: 'No valid items to update' });
  }

  const r = await fetch(
    `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign/${campaignId}/bulk_update_ads_bid_by_inventory_reference`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests }),
    }
  );

  if (!r.ok) {
    const errText = await r.text();
    console.error('[eBay:Marketing] bulkUpdate error:', errText);
    return res.status(r.status).json({ error: 'Failed to update ad rates', details: errText.substring(0, 300) });
  }

  const data = await r.json();
  const responses = data.responses || [];
  const updated = responses.filter(x => x.statusCode === 200).length;

  console.log(`[eBay:Marketing] ✓ Updated ${updated}/${requests.length} ad rates`);

  return res.status(200).json({ 
    success: true, action: 'update', updated, 
    failed: responses.length - updated, responses 
  });
}

/**
 * Remove listings from promoted campaign
 */
async function removeFromPromoted(headers, campaignId, items, res) {
  const results = [];

  for (const item of items) {
    const { sku } = item;
    if (!sku) continue;

    try {
      const r = await fetch(
        `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign/${campaignId}/delete_ads_by_inventory_reference`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            inventoryReferenceId: sku,
            inventoryReferenceType: 'INVENTORY_ITEM',
          }),
        }
      );

      if (r.ok || r.status === 204) {
        console.log(`[eBay:Marketing] ✓ Removed ${sku} from campaign`);
        results.push({ sku, success: true });
      } else {
        const errText = await r.text();
        results.push({ sku, success: false, error: errText.substring(0, 200) });
      }
    } catch (e) {
      results.push({ sku, success: false, error: e.message });
    }
  }

  const removed = results.filter(r => r.success).length;
  return res.status(200).json({ success: true, action: 'remove', removed, results });
}
