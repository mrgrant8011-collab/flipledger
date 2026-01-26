/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - Production Version 3.0
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * ENDPOINTS:
 *   GET    /api/ebay-listings              - Fetch all active eBay listings
 *   POST   /api/ebay-listings              - Create new listing(s)
 *   PATCH  /api/ebay-listings              - Update price/quantity
 *   DELETE /api/ebay-listings              - End/withdraw listings
 *   
 * POST PAYLOAD FORMATS:
 * 
 *   Single Listing:
 *   {
 *     mode: 'single',
 *     item: { sku, title, description, images[], price, quantity, size, brand, condition }
 *   }
 *   
 *   Multi-Variation Listing:
 *   {
 *     mode: 'variation',
 *     product: { sku, title, description, images[], brand },
 *     variants: [{ size, price, quantity }]
 *   }
 *   
 *   Bulk Single Listings (from CrossList.jsx):
 *   {
 *     products: [{
 *       sku, name, brand, image,
 *       sizes: [{ size, qty, price, stockxListingId }]
 *     }]
 *   }
 * 
 * WHY PREVIOUS ATTEMPTS FAILED:
 * 1. Location API was called AFTER inventory creation (must be first)
 * 2. Used url.parse() instead of URL API (deprecation warning)
 * 3. Didn't properly handle case where NO locations exist
 * 4. Created location with wrong payload structure
 * 5. Didn't verify location was ENABLED before using
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════════

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE_ID = 'EBAY_US';
const EBAY_LOCALE = 'en-US';

// Athletic Shoes category - change if selling different products
const DEFAULT_CATEGORY_ID = '15709';

// Price markup percentage (10% to cover eBay fees)
const PRICE_MARKUP = 1.10;

// Location key for auto-created location
const AUTO_LOCATION_KEY = 'flipledger-primary';

// ═══════════════════════════════════════════════════════════════════════════════════
// REQUIRED ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════════════════════════════════════

const REQUIRED_ENV = {
  EBAY_FULFILLMENT_POLICY_ID: 'Shipping policy from eBay Seller Hub',
  EBAY_PAYMENT_POLICY_ID: 'Payment policy from eBay Seller Hub', 
  EBAY_RETURN_POLICY_ID: 'Return policy from eBay Seller Hub'
};

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Build eBay API Headers
// CRITICAL: Must include Accept-Language to avoid error 25709
// ═══════════════════════════════════════════════════════════════════════════════════

function getEbayHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': EBAY_LOCALE,
    'Content-Language': EBAY_LOCALE,
    'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Parse eBay Error Response
// ═══════════════════════════════════════════════════════════════════════════════════

function parseEbayError(responseText) {
  try {
    const data = JSON.parse(responseText);
    if (data.errors && Array.isArray(data.errors)) {
      return {
        errorId: data.errors[0]?.errorId || 'UNKNOWN',
        message: data.errors.map(e => `[${e.errorId}] ${e.message}`).join('; '),
        errors: data.errors
      };
    }
    if (data.error_description) {
      return { message: data.error_description, errorId: data.error || 'UNKNOWN' };
    }
    return { message: responseText, errorId: 'UNKNOWN' };
  } catch {
    return { message: responseText, errorId: 'PARSE_ERROR' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Validate Environment Variables
// ═══════════════════════════════════════════════════════════════════════════════════

function validateEnvironment() {
  const missing = [];
  const values = {};
  
  for (const [key, description] of Object.entries(REQUIRED_ENV)) {
    const value = process.env[key]?.trim();
    if (!value) {
      missing.push({ key, description });
    } else {
      values[key] = value;
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    values
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Sanitize SKU for eBay (alphanumeric + dash only, max 50 chars)
// ═══════════════════════════════════════════════════════════════════════════════════

function sanitizeSku(baseSku, size = null) {
  let sku = (baseSku || 'ITEM').replace(/[^a-zA-Z0-9\-]/g, '');
  if (size !== null) {
    const cleanSize = String(size).replace(/[^a-zA-Z0-9.]/g, '');
    sku = `${sku}-${cleanSize}`;
  }
  return sku.substring(0, 50);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Normalize Image URLs to HTTPS
// ═══════════════════════════════════════════════════════════════════════════════════

function normalizeImageUrl(url) {
  if (!url) return null;
  let normalized = url;
  if (normalized.startsWith('//')) normalized = 'https:' + normalized;
  if (!normalized.startsWith('http')) normalized = 'https://' + normalized;
  normalized = normalized.replace(/^http:\/\//i, 'https://');
  return normalized;
}

function normalizeImages(images) {
  if (!images) return [];
  const arr = Array.isArray(images) ? images : [images];
  return arr.map(normalizeImageUrl).filter(Boolean).slice(0, 12); // eBay max 12 images
}

// ═══════════════════════════════════════════════════════════════════════════════════
// UTILITY: Generate HTML Description
// ═══════════════════════════════════════════════════════════════════════════════════

function generateDescription(item) {
  const { title, brand, size, sku, condition } = item;
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="font-size: 24px; margin-bottom: 8px;">${title || 'Item'}</h1>
  ${sku ? `<p style="color: #666; font-size: 14px; margin: 0 0 20px;">Style: ${sku}</p>` : ''}
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="font-size: 16px; margin: 0 0 12px; color: #333;">Product Details</h2>
    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
      ${brand ? `<tr><td style="padding: 6px 0; color: #666;">Brand</td><td style="padding: 6px 0; font-weight: 600;">${brand}</td></tr>` : ''}
      ${size ? `<tr><td style="padding: 6px 0; color: #666;">Size</td><td style="padding: 6px 0; font-weight: 600;">${size}</td></tr>` : ''}
      <tr><td style="padding: 6px 0; color: #666;">Condition</td><td style="padding: 6px 0; font-weight: 600;">${condition || 'Brand New'}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Authenticity</td><td style="padding: 6px 0; font-weight: 600;">100% Authentic Guaranteed</td></tr>
    </table>
  </div>
  
  <div style="margin-bottom: 20px;">
    <h2 style="font-size: 16px; margin: 0 0 8px;">Shipping</h2>
    <p style="font-size: 14px; color: #555; margin: 0;">Ships within 1-2 business days. Double-boxed for protection.</p>
  </div>
  
  <div style="margin-bottom: 20px;">
    <h2 style="font-size: 16px; margin: 0 0 8px;">Returns</h2>
    <p style="font-size: 14px; color: #555; margin: 0;">Please see our return policy for details.</p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="font-size: 12px; color: #999; text-align: center;">Listed via FlipLedger</p>
</body>
</html>
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Ensure Merchant Location Exists
// This is THE critical function - must work before any listing can be created
// ═══════════════════════════════════════════════════════════════════════════════════

async function ensureMerchantLocation(headers) {
  console.log('[eBay:Location] Starting merchant location check...');
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 1: List ALL existing merchant locations
  // ─────────────────────────────────────────────────────────────────────────────────
  
  let existingLocations = [];
  
  try {
    const listUrl = new URL(`${EBAY_API_BASE}/sell/inventory/v1/location`);
    listUrl.searchParams.set('limit', '100');
    
    console.log('[eBay:Location] Fetching existing locations...');
    
    const listRes = await fetch(listUrl.toString(), {
      method: 'GET',
      headers
    });
    
    if (listRes.ok) {
      const data = await listRes.json();
      existingLocations = data.locations || [];
      console.log(`[eBay:Location] Found ${existingLocations.length} existing location(s)`);
      
      // Log location details for debugging
      existingLocations.forEach((loc, i) => {
        console.log(`[eBay:Location]   ${i + 1}. ${loc.merchantLocationKey} (${loc.merchantLocationStatus})`);
      });
    } else {
      const errText = await listRes.text();
      console.warn('[eBay:Location] List locations failed:', listRes.status, errText);
    }
  } catch (e) {
    console.warn('[eBay:Location] List locations error:', e.message);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 2: Find an ENABLED location to use
  // ─────────────────────────────────────────────────────────────────────────────────
  
  if (existingLocations.length > 0) {
    // Prefer ENABLED locations
    const enabledLocation = existingLocations.find(
      loc => loc.merchantLocationStatus === 'ENABLED'
    );
    
    if (enabledLocation) {
      console.log('[eBay:Location] ✓ Using enabled location:', enabledLocation.merchantLocationKey);
      return {
        success: true,
        locationKey: enabledLocation.merchantLocationKey,
        isNew: false
      };
    }
    
    // If no enabled, try to enable the first one
    const firstLocation = existingLocations[0];
    console.log('[eBay:Location] No enabled locations, trying to enable:', firstLocation.merchantLocationKey);
    
    try {
      const enableRes = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/location/${firstLocation.merchantLocationKey}/enable`,
        { method: 'POST', headers }
      );
      
      if (enableRes.ok || enableRes.status === 204) {
        console.log('[eBay:Location] ✓ Enabled existing location:', firstLocation.merchantLocationKey);
        return {
          success: true,
          locationKey: firstLocation.merchantLocationKey,
          isNew: false
        };
      }
    } catch (e) {
      console.warn('[eBay:Location] Enable location failed:', e.message);
    }
    
    // Use it anyway even if not enabled (some accounts allow this)
    console.log('[eBay:Location] Using first available location:', firstLocation.merchantLocationKey);
    return {
      success: true,
      locationKey: firstLocation.merchantLocationKey,
      isNew: false
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 3: No locations exist - create one
  // ─────────────────────────────────────────────────────────────────────────────────
  
  console.log('[eBay:Location] No locations found, creating new location...');
  
  // Build address from env vars or defaults
  const address = {
    addressLine1: process.env.EBAY_LOCATION_ADDRESS || '100 Main Street',
    city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
    stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
    postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
    country: 'US'
  };
  
  console.log('[eBay:Location] Creating with address:', address.city, address.stateOrProvince, address.postalCode);
  
  // eBay Inventory API location payload
  const locationPayload = {
    location: {
      address: address
    },
    locationTypes: ['WAREHOUSE'],
    name: 'Primary Warehouse',
    merchantLocationStatus: 'ENABLED'
  };
  
  try {
    const createRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/location/${AUTO_LOCATION_KEY}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(locationPayload)
      }
    );
    
    // 200, 201, 204 are all success for PUT
    if (createRes.ok || createRes.status === 204) {
      console.log('[eBay:Location] ✓ Created new location:', AUTO_LOCATION_KEY);
      return {
        success: true,
        locationKey: AUTO_LOCATION_KEY,
        isNew: true
      };
    }
    
    // Handle specific errors
    const errText = await createRes.text();
    const parsed = parseEbayError(errText);
    
    console.error('[eBay:Location] ✗ Create failed:', createRes.status);
    console.error('[eBay:Location] Error:', parsed.message);
    
    // If 409 Conflict, location might already exist with different case
    if (createRes.status === 409) {
      console.log('[eBay:Location] Conflict - trying to fetch the location directly...');
      
      const getRes = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/location/${AUTO_LOCATION_KEY}`,
        { method: 'GET', headers }
      );
      
      if (getRes.ok) {
        console.log('[eBay:Location] ✓ Location exists after all:', AUTO_LOCATION_KEY);
        return {
          success: true,
          locationKey: AUTO_LOCATION_KEY,
          isNew: false
        };
      }
    }
    
    return {
      success: false,
      error: parsed.message,
      errorId: parsed.errorId
    };
    
  } catch (e) {
    console.error('[eBay:Location] ✗ Create exception:', e.message);
    return {
      success: false,
      error: e.message,
      errorId: 'EXCEPTION'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Create/Update Inventory Item
// ═══════════════════════════════════════════════════════════════════════════════════

async function ensureInventoryItem(headers, sku, itemData) {
  console.log(`[eBay:Inventory] Creating inventory item: ${sku}`);
  
  const {
    title,
    description,
    images,
    brand,
    size,
    quantity = 1,
    condition = 'NEW',
    mpn,
    color,
    gender
  } = itemData;
  
  // Build product aspects
  const aspects = {
    'Brand': [brand || 'Unbranded']
  };
  
  if (size) aspects['US Shoe Size'] = [String(size)];
  if (mpn) aspects['Style Code'] = [mpn];
  if (color) aspects['Color'] = [color];
  
  // Determine department from size or gender
  if (gender === 'women' || String(size).toUpperCase().includes('W')) {
    aspects['Department'] = ['Women'];
  } else if (gender === 'kids' || parseFloat(size) < 4) {
    aspects['Department'] = ['Kids'];
  } else {
    aspects['Department'] = ['Men'];
  }
  
  aspects['Type'] = ['Athletic'];
  
  // Build inventory item payload
  const inventoryItem = {
    availability: {
      shipToLocationAvailability: {
        quantity: parseInt(quantity) || 1
      }
    },
    condition: condition === 'NEW' ? 'NEW' : 'USED_EXCELLENT',
    product: {
      title: (title || 'Item').substring(0, 80),
      description: description || generateDescription(itemData),
      brand: brand || 'Unbranded',
      mpn: mpn || sku,
      aspects: aspects
    }
  };
  
  // Add images if provided
  const normalizedImages = normalizeImages(images);
  if (normalizedImages.length > 0) {
    inventoryItem.product.imageUrls = normalizedImages;
  }
  
  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(inventoryItem)
      }
    );
    
    if (res.ok || res.status === 204) {
      console.log(`[eBay:Inventory] ✓ Inventory item created: ${sku}`);
      return { success: true, sku };
    }
    
    const errText = await res.text();
    const parsed = parseEbayError(errText);
    console.error(`[eBay:Inventory] ✗ Failed: ${res.status}`, parsed.message);
    
    return {
      success: false,
      sku,
      error: parsed.message,
      errorId: parsed.errorId
    };
    
  } catch (e) {
    console.error(`[eBay:Inventory] ✗ Exception:`, e.message);
    return { success: false, sku, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Create Offer for Inventory Item
// ═══════════════════════════════════════════════════════════════════════════════════

async function ensureOffer(headers, sku, offerData, policies) {
  console.log(`[eBay:Offer] Creating offer for: ${sku}`);
  
  const {
    price,
    quantity = 1,
    merchantLocationKey,
    categoryId = DEFAULT_CATEGORY_ID,
    description
  } = offerData;
  
  const {
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId
  } = policies;
  
  // Calculate eBay price with markup
  const ebayPrice = Math.ceil(parseFloat(price) * PRICE_MARKUP);
  
  const offerPayload = {
    sku: sku,
    marketplaceId: EBAY_MARKETPLACE_ID,
    format: 'FIXED_PRICE',
    availableQuantity: parseInt(quantity) || 1,
    categoryId: categoryId,
    listingDescription: description,
    pricingSummary: {
      price: {
        value: String(ebayPrice),
        currency: 'USD'
      }
    },
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId
    },
    merchantLocationKey
  };
  
  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(offerPayload)
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Offer] ✓ Offer created: ${data.offerId}`);
      return {
        success: true,
        offerId: data.offerId,
        sku,
        price: ebayPrice
      };
    }
    
    const errText = await res.text();
    const parsed = parseEbayError(errText);
    
    // Check if offer already exists (error 25002)
    if (parsed.errors?.some(e => e.errorId === 25002 || e.errorId === 25001)) {
      console.log(`[eBay:Offer] Offer may already exist for ${sku}, searching...`);
      
      const existingOffer = await findOfferBySku(headers, sku);
      if (existingOffer) {
        console.log(`[eBay:Offer] ✓ Found existing offer: ${existingOffer.offerId}`);
        return {
          success: true,
          offerId: existingOffer.offerId,
          sku,
          price: ebayPrice,
          alreadyExisted: true,
          status: existingOffer.status
        };
      }
    }
    
    console.error(`[eBay:Offer] ✗ Failed: ${res.status}`, parsed.message);
    return {
      success: false,
      sku,
      error: parsed.message,
      errorId: parsed.errorId
    };
    
  } catch (e) {
    console.error(`[eBay:Offer] ✗ Exception:`, e.message);
    return { success: false, sku, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Find Existing Offer by SKU
// ═══════════════════════════════════════════════════════════════════════════════════

async function findOfferBySku(headers, sku) {
  try {
    const url = new URL(`${EBAY_API_BASE}/sell/inventory/v1/offer`);
    url.searchParams.set('sku', sku);
    url.searchParams.set('marketplace_id', EBAY_MARKETPLACE_ID);
    
    const res = await fetch(url.toString(), { method: 'GET', headers });
    
    if (res.ok) {
      const data = await res.json();
      const offers = data.offers || [];
      
      if (offers.length > 0) {
        return {
          offerId: offers[0].offerId,
          status: offers[0].status,
          listingId: offers[0].listing?.listingId || null
        };
      }
    }
  } catch (e) {
    console.warn(`[eBay:Offer] Find offer error:`, e.message);
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Publish Offer (Make Listing Live)
// ═══════════════════════════════════════════════════════════════════════════════════

async function publishOffer(headers, offerId) {
  console.log(`[eBay:Publish] Publishing offer: ${offerId}`);
  
  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
      {
        method: 'POST',
        headers
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Publish] ✓ Published! Listing ID: ${data.listingId}`);
      return {
        success: true,
        offerId,
        listingId: data.listingId,
        ebayUrl: `https://www.ebay.com/itm/${data.listingId}`
      };
    }
    
    const errText = await res.text();
    const parsed = parseEbayError(errText);
    console.error(`[eBay:Publish] ✗ Failed: ${res.status}`, parsed.message);
    
    return {
      success: false,
      offerId,
      error: parsed.message,
      errorId: parsed.errorId
    };
    
  } catch (e) {
    console.error(`[eBay:Publish] ✗ Exception:`, e.message);
    return { success: false, offerId, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CORE: Create Single Listing (Full Flow)
// ═══════════════════════════════════════════════════════════════════════════════════

async function createSingleListing(headers, item, config) {
  const { merchantLocationKey, policies } = config;
  
  const sku = sanitizeSku(item.sku, item.size);
  const title = item.size 
    ? `${item.title || item.name || 'Item'} Size ${item.size}`.substring(0, 80)
    : (item.title || item.name || 'Item').substring(0, 80);
  
  console.log(`[eBay:Single] === Creating listing: ${sku} ===`);
  
  // Step 1: Create Inventory Item
  const invResult = await ensureInventoryItem(headers, sku, {
    title,
    description: item.description || generateDescription({ ...item, title, sku: item.sku }),
    images: item.images || (item.image ? [item.image] : []),
    brand: item.brand,
    size: item.size,
    quantity: item.quantity || item.qty || 1,
    condition: item.condition || 'NEW',
    mpn: item.sku,
    color: item.color,
    gender: item.gender
  });
  
  if (!invResult.success) {
    return { success: false, step: 'inventory', sku, error: invResult.error };
  }
  
  // Step 2: Create Offer
  const offerResult = await ensureOffer(headers, sku, {
    price: item.price || 100,
    quantity: item.quantity || item.qty || 1,
    merchantLocationKey,
    description: item.description || generateDescription({ ...item, title, sku: item.sku })
  }, policies);
  
  if (!offerResult.success) {
    return { success: false, step: 'offer', sku, error: offerResult.error };
  }
  
  // If offer already published, return success
  if (offerResult.alreadyExisted && offerResult.status === 'PUBLISHED') {
    const existingOffer = await findOfferBySku(headers, sku);
    return {
      success: true,
      sku,
      offerId: offerResult.offerId,
      listingId: existingOffer?.listingId || null,
      ebayUrl: existingOffer?.listingId ? `https://www.ebay.com/itm/${existingOffer.listingId}` : null,
      price: offerResult.price,
      alreadyExisted: true
    };
  }
  
  // Step 3: Publish Offer
  const publishResult = await publishOffer(headers, offerResult.offerId);
  
  if (!publishResult.success) {
    return { 
      success: false, 
      step: 'publish', 
      sku, 
      offerId: offerResult.offerId,
      error: publishResult.error 
    };
  }
  
  console.log(`[eBay:Single] ✓ Complete: ${sku} → ${publishResult.listingId}`);
  
  return {
    success: true,
    sku,
    offerId: offerResult.offerId,
    listingId: publishResult.listingId,
    ebayUrl: publishResult.ebayUrl,
    price: offerResult.price
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: GET - Fetch All Active Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleGet(headers, res) {
  try {
    const listings = [];
    let offset = 0;
    const limit = 100;
    
    // Fetch all inventory items
    while (offset < 1000) {
      const url = new URL(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));
      
      const response = await fetch(url.toString(), { method: 'GET', headers });
      
      if (!response.ok) {
        if (offset === 0) {
          const errText = await response.text();
          return res.status(response.status).json({
            success: false,
            error: 'Failed to fetch inventory',
            details: parseEbayError(errText).message
          });
        }
        break;
      }
      
      const data = await response.json();
      const items = data.inventoryItems || [];
      
      // Get offers for each item
      for (const item of items) {
        const offer = await findOfferBySku(headers, item.sku);
        if (offer && offer.status === 'PUBLISHED') {
          const aspects = item.product?.aspects || {};
          listings.push({
            sku: item.sku,
            offerId: offer.offerId,
            listingId: offer.listingId,
            title: item.product?.title || 'eBay Item',
            brand: item.product?.brand || '',
            size: aspects['US Shoe Size']?.[0] || '',
            image: item.product?.imageUrls?.[0] || '',
            quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
            status: offer.status
          });
        }
      }
      
      if (items.length < limit) break;
      offset += limit;
    }
    
    console.log(`[eBay:GET] Found ${listings.length} active listings`);
    
    return res.status(200).json({
      success: true,
      listings,
      total: listings.length
    });
    
  } catch (error) {
    console.error('[eBay:GET] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch listings',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: POST - Create Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handlePost(headers, body, res) {
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');
  console.log('[eBay:POST] CREATE LISTINGS REQUEST');
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 1: Validate Environment
  // ─────────────────────────────────────────────────────────────────────────────────
  
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    console.error('[eBay:POST] ✗ Missing env vars:', envCheck.missing.map(m => m.key));
    return res.status(400).json({
      success: false,
      error: 'Configuration error',
      message: 'Missing required environment variables',
      missing: envCheck.missing
    });
  }
  
  const policies = {
    fulfillmentPolicyId: envCheck.values.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicyId: envCheck.values.EBAY_PAYMENT_POLICY_ID,
    returnPolicyId: envCheck.values.EBAY_RETURN_POLICY_ID
  };
  
  console.log('[eBay:POST] ✓ Environment validated');
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 2: Ensure Merchant Location
  // ─────────────────────────────────────────────────────────────────────────────────
  
  const locationResult = await ensureMerchantLocation(headers);
  
  if (!locationResult.success) {
    console.error('[eBay:POST] ✗ Location failed:', locationResult.error);
    return res.status(400).json({
      success: false,
      error: 'Merchant location required',
      message: locationResult.error,
      errorId: locationResult.errorId,
      hint: 'Create a location in eBay Seller Hub → Account → Shipping Settings → Ship From Location'
    });
  }
  
  const merchantLocationKey = locationResult.locationKey;
  console.log('[eBay:POST] ✓ Location ready:', merchantLocationKey);
  
  const config = { merchantLocationKey, policies };
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // STEP 3: Parse Request Body
  // ─────────────────────────────────────────────────────────────────────────────────
  
  const { mode, item, product, variants, products } = body || {};
  
  console.log('[eBay:POST] Request mode:', mode || (products ? 'bulk' : 'unknown'));
  
  const results = {
    created: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    createdOffers: []
  };
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // MODE: Single Listing
  // ─────────────────────────────────────────────────────────────────────────────────
  
  if (mode === 'single' && item) {
    console.log('[eBay:POST] Processing single listing...');
    
    const result = await createSingleListing(headers, item, config);
    
    if (result.success) {
      results.created = 1;
      results.createdOffers.push({
        ebaySku: result.sku,
        baseSku: item.sku,
        size: item.size,
        offerId: result.offerId,
        listingId: result.listingId,
        ebayUrl: result.ebayUrl,
        price: result.price
      });
    } else {
      results.failed = 1;
      results.errors.push({
        sku: result.sku,
        step: result.step,
        error: result.error
      });
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // MODE: Variation Listing (Future - currently creates single listings per size)
  // ─────────────────────────────────────────────────────────────────────────────────
  
  else if (mode === 'variation' && product && variants) {
    console.log('[eBay:POST] Processing variation listing (as individual singles)...');
    
    // Note: True multi-variation listings require eBay Inventory Item Groups API
    // For now, we create individual listings per size
    
    for (const variant of variants) {
      const variantItem = {
        ...product,
        sku: product.sku,
        title: product.title || product.name,
        size: variant.size,
        price: variant.price,
        quantity: variant.quantity || variant.qty || 1
      };
      
      const result = await createSingleListing(headers, variantItem, config);
      
      if (result.success) {
        results.created++;
        results.createdOffers.push({
          ebaySku: result.sku,
          baseSku: product.sku,
          size: variant.size,
          offerId: result.offerId,
          listingId: result.listingId,
          ebayUrl: result.ebayUrl,
          price: result.price
        });
      } else {
        results.failed++;
        results.errors.push({
          sku: result.sku,
          baseSku: product.sku,
          size: variant.size,
          step: result.step,
          error: result.error
        });
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // MODE: Bulk Products (from CrossList.jsx)
  // ─────────────────────────────────────────────────────────────────────────────────
  
  else if (products && Array.isArray(products)) {
    console.log(`[eBay:POST] Processing ${products.length} products (bulk mode)...`);
    
    for (const prod of products) {
      const sizes = prod.sizes || [];
      
      // Handle products with direct size property
      if (sizes.length === 0 && prod.size) {
        sizes.push({
          size: prod.size,
          qty: prod.qty || prod.quantity || 1,
          price: prod.price,
          stockxListingId: prod.stockxListingId
        });
      }
      
      if (sizes.length === 0) {
        console.warn(`[eBay:POST] Product ${prod.sku} has no sizes, skipping`);
        results.skipped++;
        continue;
      }
      
      for (const sizeData of sizes) {
        const itemToList = {
          sku: prod.sku,
          title: prod.name || prod.title,
          brand: prod.brand,
          image: prod.image,
          images: prod.images,
          size: sizeData.size,
          price: sizeData.price || prod.price || 100,
          quantity: sizeData.qty || sizeData.quantity || 1,
          condition: prod.condition || 'NEW',
          color: prod.color,
          gender: prod.gender
        };
        
        const result = await createSingleListing(headers, itemToList, config);
        
        if (result.success) {
          results.created++;
          results.createdOffers.push({
            ebaySku: result.sku,
            baseSku: prod.sku,
            size: sizeData.size,
            offerId: result.offerId,
            listingId: result.listingId,
            ebayUrl: result.ebayUrl,
            stockxListingId: sizeData.stockxListingId || null,
            price: result.price,
            alreadyExisted: result.alreadyExisted || false
          });
        } else {
          results.failed++;
          results.errors.push({
            sku: result.sku,
            baseSku: prod.sku,
            size: sizeData.size,
            step: result.step,
            error: result.error
          });
        }
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // Invalid request
  // ─────────────────────────────────────────────────────────────────────────────────
  
  else {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: 'Expected one of: { mode: "single", item: {...} } | { mode: "variation", product: {...}, variants: [...] } | { products: [...] }',
      received: Object.keys(body || {})
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────────
  // Return Results
  // ─────────────────────────────────────────────────────────────────────────────────
  
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');
  console.log(`[eBay:POST] RESULTS: ${results.created} created, ${results.failed} failed, ${results.skipped} skipped`);
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');
  
  const success = results.created > 0;
  
  return res.status(success ? 200 : 400).json({
    success,
    created: results.created,
    failed: results.failed,
    skipped: results.skipped,
    errors: results.errors,
    createdOffers: results.createdOffers,
    message: success
      ? `Successfully created ${results.created} listing(s)`
      : `Failed to create listings. ${results.errors[0]?.error || 'See errors for details.'}`
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: PATCH - Update Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handlePatch(headers, body, res) {
  const { updates } = body || {};
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      message: 'Expected { updates: [{ sku, offerId, price?, quantity? }] }'
    });
  }
  
  const requests = updates.map(u => ({
    sku: u.sku,
    shipToLocationAvailability: u.quantity !== undefined 
      ? { quantity: parseInt(u.quantity) } 
      : undefined,
    offers: [{
      offerId: u.offerId,
      availableQuantity: u.quantity !== undefined ? parseInt(u.quantity) : undefined,
      price: u.price !== undefined 
        ? { value: String(u.price), currency: 'USD' } 
        : undefined
    }]
  }));
  
  try {
    const bulkRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/bulk_update_price_quantity`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ requests })
      }
    );
    
    if (!bulkRes.ok) {
      const errText = await bulkRes.text();
      return res.status(bulkRes.status).json({
        success: false,
        error: 'Bulk update failed',
        message: parseEbayError(errText).message
      });
    }
    
    const data = await bulkRes.json();
    const responses = data.responses || [];
    
    return res.status(200).json({
      success: true,
      updated: responses.filter(r => r.statusCode === 200).length,
      failed: responses.filter(r => r.statusCode !== 200).length,
      responses
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Update failed',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: DELETE - End/Withdraw Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleDelete(headers, body, res) {
  const { offerIds } = body || {};
  
  if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      message: 'Expected { offerIds: ["id1", "id2", ...] }'
    });
  }
  
  const results = { ended: 0, failed: 0, errors: [] };
  
  for (const offerId of offerIds) {
    try {
      const withdrawRes = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
        { method: 'POST', headers }
      );
      
      if (withdrawRes.ok || withdrawRes.status === 204) {
        results.ended++;
        console.log(`[eBay:DELETE] ✓ Withdrawn: ${offerId}`);
      } else {
        const errText = await withdrawRes.text();
        results.failed++;
        results.errors.push({
          offerId,
          error: parseEbayError(errText).message
        });
      }
    } catch (e) {
      results.failed++;
      results.errors.push({ offerId, error: e.message });
    }
  }
  
  return res.status(200).json({
    success: results.ended > 0,
    ended: results.ended,
    failed: results.failed,
    errors: results.errors
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Provide eBay access token as: Authorization: Bearer <token>'
    });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  const headers = getEbayHeaders(accessToken);
  
  // Route
  switch (req.method) {
    case 'GET':
      return handleGet(headers, res);
    case 'POST':
      return handlePost(headers, req.body, res);
    case 'PATCH':
      return handlePatch(headers, req.body, res);
    case 'DELETE':
      return handleDelete(headers, req.body, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowed: ['GET', 'POST', 'PATCH', 'DELETE']
      });
  }
}
