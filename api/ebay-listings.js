/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - v5.0 Production
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Based on official eBay REST API documentation:
 * - https://developer.ebay.com/api-docs/sell/inventory/resources/location/methods/createInventoryLocation
 * - https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/createOrReplaceInventoryItem
 * 
 * Key fixes:
 * 1. Content-Language header REQUIRED for inventory items (per eBay docs)
 * 2. Accept-Language must be valid locale (en-US), NOT empty
 * 3. Location creation uses POST, not PUT
 * 4. Proper error parsing with full eBay error details
 * 5. Debug logging for env var visibility
 * 
 * Endpoints:
 *   GET    /api/ebay-listings              - List active eBay listings
 *   GET    /api/ebay-listings?debug=1      - Run diagnostics
 *   POST   /api/ebay-listings              - Create listings
 *   DELETE /api/ebay-listings              - End/withdraw listings
 *   PATCH  /api/ebay-listings              - Update price/quantity
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE_ID = 'EBAY_US';
const EBAY_LOCALE = 'en-US';
const DEFAULT_CATEGORY_ID = '15709'; // Athletic Shoes
const PRICE_MARKUP = 1.10; // 10% markup to cover eBay fees
const LOCATION_KEY = 'flipledger-warehouse';

// ═══════════════════════════════════════════════════════════════════════════════════
// HEADERS - Per eBay REST API Documentation
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Build required headers for eBay REST API calls
 * Per docs: Content-Language is REQUIRED for inventory items
 * Accept-Language must be valid (en-US), not empty or browser default
 */
function buildHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': EBAY_LOCALE,        // REQUIRED: Must be valid locale
    'Content-Language': EBAY_LOCALE,       // REQUIRED for inventory items
    'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ERROR PARSING - Extract full eBay error details
// ═══════════════════════════════════════════════════════════════════════════════════

function parseEbayError(responseText) {
  try {
    const data = JSON.parse(responseText);
    
    // Standard eBay error format
    if (data.errors && Array.isArray(data.errors)) {
      return {
        summary: data.errors.map(e => `[${e.errorId}] ${e.message}`).join('; '),
        ebayErrors: data.errors.map(e => ({
          errorId: e.errorId,
          domain: e.domain,
          category: e.category,
          message: e.message,
          longMessage: e.longMessage,
          parameters: e.parameters
        })),
        raw: responseText
      };
    }
    
    // OAuth error format
    if (data.error_description) {
      return {
        summary: `${data.error}: ${data.error_description}`,
        ebayErrors: [{ errorId: data.error, message: data.error_description }],
        raw: responseText
      };
    }
    
    return { summary: responseText, ebayErrors: [], raw: responseText };
  } catch {
    return { summary: responseText, ebayErrors: [], raw: responseText };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ENV VAR VALIDATION - Debug logging + clean error response
// ═══════════════════════════════════════════════════════════════════════════════════

function validateAndLogEnv() {
  const envStatus = {
    EBAY_FULFILLMENT_POLICY_ID: !!process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: !!process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: !!process.env.EBAY_RETURN_POLICY_ID?.trim(),
    EBAY_CLIENT_ID: !!process.env.EBAY_CLIENT_ID?.trim(),
    EBAY_CLIENT_SECRET: !!process.env.EBAY_CLIENT_SECRET?.trim(),
    EBAY_RU_NAME: !!process.env.EBAY_RU_NAME?.trim(),
    // Optional
    EBAY_LOCATION_ADDRESS: !!process.env.EBAY_LOCATION_ADDRESS?.trim(),
    EBAY_LOCATION_CITY: !!process.env.EBAY_LOCATION_CITY?.trim(),
    EBAY_LOCATION_STATE: !!process.env.EBAY_LOCATION_STATE?.trim(),
    EBAY_LOCATION_ZIP: !!process.env.EBAY_LOCATION_ZIP?.trim()
  };

  // Log which env vars are present (NOT their values)
  console.log('[eBay] Environment variables status:', JSON.stringify(envStatus));

  const requiredPolicies = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID?.trim()
  };

  const missing = Object.entries(requiredPolicies)
    .filter(([_, val]) => !val)
    .map(([key]) => key);

  return {
    valid: missing.length === 0,
    missing,
    policies: missing.length === 0 ? requiredPolicies : null,
    envStatus
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ENSURE MERCHANT LOCATION - Core fix for error 25002
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Ensures a merchant location exists for the seller
 * 
 * Flow:
 * 1. GET /sell/inventory/v1/location - List all existing locations
 * 2. If found, return the first ENABLED location's key
 * 3. If none exist, POST /sell/inventory/v1/location/{key} to create one
 * 4. Return the merchantLocationKey for use in offers
 */
async function ensureMerchantLocation(headers) {
  console.log('[eBay:Location] Checking for existing merchant locations...');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: List all existing locations
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const listUrl = `${EBAY_API_BASE}/sell/inventory/v1/location?limit=100`;
    console.log('[eBay:Location] GET', listUrl);

    const listRes = await fetch(listUrl, { method: 'GET', headers });
    const listText = await listRes.text();

    console.log('[eBay:Location] List response:', listRes.status, listText.substring(0, 200));

    if (listRes.ok) {
      const listData = JSON.parse(listText);
      const locations = listData.locations || [];

      console.log(`[eBay:Location] Found ${locations.length} existing location(s)`);

      if (locations.length > 0) {
        // Prefer ENABLED locations
        const enabled = locations.find(l => l.merchantLocationStatus === 'ENABLED');
        if (enabled) {
          console.log('[eBay:Location] ✓ Using enabled location:', enabled.merchantLocationKey);
          return { success: true, locationKey: enabled.merchantLocationKey };
        }

        // Use first available
        console.log('[eBay:Location] Using first available:', locations[0].merchantLocationKey);
        return { success: true, locationKey: locations[0].merchantLocationKey };
      }
    } else {
      // Log error but continue to create
      const parsed = parseEbayError(listText);
      console.warn('[eBay:Location] List failed:', parsed.summary);
    }
  } catch (e) {
    console.warn('[eBay:Location] List exception:', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: No locations exist - create one
  // Per eBay docs: POST /sell/inventory/v1/location/{merchantLocationKey}
  // Required: postalCode + country OR city + stateOrProvince + country
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Location] No locations found, creating new location...');

  const address = {
    addressLine1: process.env.EBAY_LOCATION_ADDRESS || '100 Commerce Street',
    city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
    stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
    postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
    country: 'US'
  };

  // Per eBay docs: location object with address, locationTypes, name
  const locationPayload = {
    location: {
      address: address
    },
    locationTypes: ['WAREHOUSE'],
    name: 'FlipLedger Warehouse',
    merchantLocationStatus: 'ENABLED'
  };

  console.log('[eBay:Location] Creating with address:', address.city, address.stateOrProvince, address.postalCode);

  try {
    // eBay uses POST for createInventoryLocation (per official docs)
    const createUrl = `${EBAY_API_BASE}/sell/inventory/v1/location/${LOCATION_KEY}`;
    console.log('[eBay:Location] POST', createUrl);

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(locationPayload)
    });

    const createText = await createRes.text();
    console.log('[eBay:Location] Create response:', createRes.status, createText.substring(0, 300));

    // Success: 204 No Content or 200 OK
    if (createRes.ok || createRes.status === 204) {
      console.log('[eBay:Location] ✓ Location created:', LOCATION_KEY);
      return { success: true, locationKey: LOCATION_KEY, isNew: true };
    }

    // Handle specific errors
    const parsed = parseEbayError(createText);
    console.error('[eBay:Location] ✗ Create failed:', parsed.summary);

    return {
      success: false,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors,
      raw: parsed.raw
    };

  } catch (e) {
    console.error('[eBay:Location] ✗ Create exception:', e.message);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CREATE INVENTORY ITEM
// ═══════════════════════════════════════════════════════════════════════════════════

async function createInventoryItem(headers, sku, itemData) {
  console.log(`[eBay:Inventory] Creating inventory item: ${sku}`);

  const { title, brand, size, quantity, condition, image, description } = itemData;

  // Build aspects (required for category 15709 Athletic Shoes)
  const aspects = {
    'Brand': [brand || 'Unbranded'],
    'Type': ['Athletic']
  };

  if (size) {
    aspects['US Shoe Size'] = [String(size)];
    // Determine department from size
    if (String(size).toUpperCase().includes('W') || String(size).toUpperCase().includes('WOMEN')) {
      aspects['Department'] = ['Women'];
    } else if (parseFloat(size) < 4) {
      aspects['Department'] = ['Kids'];
    } else {
      aspects['Department'] = ['Men'];
    }
  }

  const inventoryItem = {
    availability: {
      shipToLocationAvailability: {
        quantity: parseInt(quantity) || 1
      }
    },
    condition: condition === 'NEW' || !condition ? 'NEW' : 'USED_EXCELLENT',
    product: {
      title: (title || 'Item').substring(0, 80),
      brand: brand || 'Unbranded',
      mpn: sku,
      aspects: aspects
    }
  };

  // Add description if provided
  if (description) {
    inventoryItem.product.description = description;
  }

  // Add image if provided - normalize URL
  if (image) {
    let imageUrl = image;
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    imageUrl = imageUrl.replace(/^http:\/\//i, 'https://');
    inventoryItem.product.imageUrls = [imageUrl];
  }

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    console.log('[eBay:Inventory] PUT', url);

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(inventoryItem)
    });

    // 200 OK or 204 No Content = success
    if (res.ok || res.status === 204) {
      console.log(`[eBay:Inventory] ✓ Created: ${sku}`);
      return { success: true, sku };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);
    console.error(`[eBay:Inventory] ✗ Failed (${res.status}):`, parsed.summary);

    return {
      success: false,
      sku,
      status: res.status,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors
    };

  } catch (e) {
    console.error(`[eBay:Inventory] ✗ Exception:`, e.message);
    return { success: false, sku, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CREATE OFFER
// ═══════════════════════════════════════════════════════════════════════════════════

async function createOffer(headers, sku, offerData, policies, merchantLocationKey) {
  console.log(`[eBay:Offer] Creating offer for: ${sku}`);

  const { price, quantity, description } = offerData;
  const { EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID } = policies;

  const ebayPrice = Math.ceil(parseFloat(price) * PRICE_MARKUP);

  const offerPayload = {
    sku: sku,
    marketplaceId: EBAY_MARKETPLACE_ID,
    format: 'FIXED_PRICE',
    availableQuantity: parseInt(quantity) || 1,
    categoryId: DEFAULT_CATEGORY_ID,
    listingDescription: description || `<p>Brand new, 100% authentic. Ships within 1-2 business days.</p>`,
    pricingSummary: {
      price: {
        value: String(ebayPrice),
        currency: 'USD'
      }
    },
    listingPolicies: {
      fulfillmentPolicyId: EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: EBAY_RETURN_POLICY_ID
    },
    merchantLocationKey: merchantLocationKey
  };

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer`;
    console.log('[eBay:Offer] POST', url);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(offerPayload)
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Offer] ✓ Created: ${data.offerId}`);
      return { success: true, offerId: data.offerId, sku, price: ebayPrice };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);

    // Check if offer already exists (error 25002 or 25001)
    const alreadyExists = parsed.ebayErrors?.some(e => 
      e.errorId === 25002 || e.errorId === 25001 || 
      e.message?.includes('already exists')
    );

    if (alreadyExists) {
      console.log(`[eBay:Offer] Offer may exist, searching for SKU: ${sku}`);
      const existing = await findOfferBySku(headers, sku);
      if (existing) {
        console.log(`[eBay:Offer] ✓ Found existing: ${existing.offerId} (${existing.status})`);
        return {
          success: true,
          offerId: existing.offerId,
          sku,
          price: ebayPrice,
          alreadyExisted: true,
          status: existing.status,
          listingId: existing.listingId
        };
      }
    }

    console.error(`[eBay:Offer] ✗ Failed (${res.status}):`, parsed.summary);
    return {
      success: false,
      sku,
      status: res.status,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors
    };

  } catch (e) {
    console.error(`[eBay:Offer] ✗ Exception:`, e.message);
    return { success: false, sku, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// FIND EXISTING OFFER BY SKU
// ═══════════════════════════════════════════════════════════════════════════════════

async function findOfferBySku(headers, sku) {
  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${EBAY_MARKETPLACE_ID}`;
    const res = await fetch(url, { method: 'GET', headers });

    if (res.ok) {
      const data = await res.json();
      if (data.offers?.length > 0) {
        const offer = data.offers[0];
        return {
          offerId: offer.offerId,
          status: offer.status,
          listingId: offer.listing?.listingId || null
        };
      }
    }
  } catch (e) {
    console.warn('[eBay:Offer] Find error:', e.message);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// PUBLISH OFFER
// ═══════════════════════════════════════════════════════════════════════════════════

async function publishOffer(headers, offerId) {
  console.log(`[eBay:Publish] Publishing offer: ${offerId}`);

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`;
    const res = await fetch(url, { method: 'POST', headers });

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
    console.error(`[eBay:Publish] ✗ Failed (${res.status}):`, parsed.summary);

    return {
      success: false,
      offerId,
      status: res.status,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors
    };

  } catch (e) {
    console.error(`[eBay:Publish] ✗ Exception:`, e.message);
    return { success: false, offerId, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CREATE SINGLE LISTING - Full flow
// ═══════════════════════════════════════════════════════════════════════════════════

async function createSingleListing(headers, item, config) {
  const { merchantLocationKey, policies } = config;

  // Build SKU from base SKU + size
  const baseSku = (item.sku || 'ITEM').replace(/[^a-zA-Z0-9\-]/g, '');
  const sizeClean = String(item.size || '').replace(/[^a-zA-Z0-9.]/g, '');
  const sku = item.size ? `${baseSku}-${sizeClean}`.substring(0, 50) : baseSku.substring(0, 50);

  // Build title with size
  const baseTitle = item.name || item.title || 'Item';
  const title = item.size 
    ? `${baseTitle} Size ${item.size}`.substring(0, 80)
    : baseTitle.substring(0, 80);

  console.log(`[eBay:Listing] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Listing] Creating: ${sku} @ $${item.price}`);

  // Step 1: Create Inventory Item
  const invResult = await createInventoryItem(headers, sku, {
    title,
    brand: item.brand,
    size: item.size,
    quantity: item.qty || item.quantity || 1,
    condition: item.condition || 'NEW',
    image: item.image,
    description: item.description
  });

  if (!invResult.success) {
    return {
      success: false,
      step: 'inventory',
      sku,
      baseSku,
      size: item.size,
      error: invResult.error,
      status: invResult.status,
      ebayErrors: invResult.ebayErrors
    };
  }

  // Step 2: Create Offer
  const offerResult = await createOffer(headers, sku, {
    price: item.price || 100,
    quantity: item.qty || item.quantity || 1,
    description: item.description
  }, policies, merchantLocationKey);

  if (!offerResult.success) {
    return {
      success: false,
      step: 'offer',
      sku,
      baseSku,
      size: item.size,
      error: offerResult.error,
      status: offerResult.status,
      ebayErrors: offerResult.ebayErrors
    };
  }

  // If already published, return early
  if (offerResult.alreadyExisted && offerResult.status === 'PUBLISHED') {
    return {
      success: true,
      sku,
      baseSku,
      size: item.size,
      offerId: offerResult.offerId,
      listingId: offerResult.listingId,
      ebayUrl: offerResult.listingId ? `https://www.ebay.com/itm/${offerResult.listingId}` : null,
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
      baseSku,
      size: item.size,
      offerId: offerResult.offerId,
      error: publishResult.error,
      status: publishResult.status,
      ebayErrors: publishResult.ebayErrors
    };
  }

  console.log(`[eBay:Listing] ✓ Complete: ${sku} → ${publishResult.listingId}`);

  return {
    success: true,
    sku,
    baseSku,
    size: item.size,
    offerId: offerResult.offerId,
    listingId: publishResult.listingId,
    ebayUrl: publishResult.ebayUrl,
    price: offerResult.price
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: GET - List or Diagnose
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleGet(headers, query, res) {
  // Debug/diagnose mode
  if (query.debug === '1' || query.diagnose === 'true') {
    const envCheck = validateAndLogEnv();
    const diag = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      tokenTest: {},
      locations: {},
      recommendation: ''
    };

    // Test token
    try {
      const testRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=1`, {
        method: 'GET', headers
      });
      const testText = await testRes.text();
      diag.tokenTest = {
        status: testRes.status,
        ok: testRes.ok,
        response: testText.substring(0, 300)
      };

      if (!testRes.ok) {
        diag.recommendation = 'Token invalid or expired. Re-authenticate with eBay.';
        return res.status(200).json(diag);
      }
    } catch (e) {
      diag.tokenTest = { error: e.message };
      diag.recommendation = 'Network error testing token';
      return res.status(200).json(diag);
    }

    // Test locations
    const locationResult = await ensureMerchantLocation(headers);
    diag.locations = locationResult;

    if (locationResult.success) {
      diag.recommendation = `✅ Location ready: "${locationResult.locationKey}". API should work.`;
    } else {
      diag.recommendation = `❌ Location failed: ${locationResult.error}. ` +
        `Try: 1) Create location manually in eBay Seller Hub → Shipping Settings, ` +
        `2) Set EBAY_LOCATION_* env vars, 3) Enable Business Policies in eBay account.`;
    }

    return res.status(200).json(diag);
  }

  // Normal: List active listings
  try {
    const listings = [];
    let offset = 0;

    while (offset < 1000) {
      const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=100&offset=${offset}`;
      const r = await fetch(url, { method: 'GET', headers });

      if (!r.ok) break;

      const d = await r.json();
      const items = d.inventoryItems || [];

      for (const item of items) {
        const offer = await findOfferBySku(headers, item.sku);
        if (offer?.status === 'PUBLISHED') {
          listings.push({
            sku: item.sku,
            offerId: offer.offerId,
            listingId: offer.listingId,
            title: item.product?.title,
            brand: item.product?.brand,
            size: item.product?.aspects?.['US Shoe Size']?.[0],
            image: item.product?.imageUrls?.[0],
            quantity: item.availability?.shipToLocationAvailability?.quantity,
            status: offer.status
          });
        }
      }

      if (items.length < 100) break;
      offset += 100;
    }

    return res.status(200).json({ success: true, listings, total: listings.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: POST - Create Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handlePost(headers, body, res) {
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');
  console.log('[eBay:POST] CREATE LISTINGS REQUEST');
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Validate environment
  // ─────────────────────────────────────────────────────────────────────────
  const envCheck = validateAndLogEnv();

  if (!envCheck.valid) {
    console.error('[eBay:POST] ✗ Missing env vars:', envCheck.missing);
    return res.status(400).json({
      success: false,
      error: 'Missing required environment variables',
      missing: envCheck.missing,
      hint: 'Set these in Vercel Environment Variables and REDEPLOY (env changes require redeploy)'
    });
  }

  const policies = envCheck.policies;
  console.log('[eBay:POST] ✓ Policies validated');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Ensure merchant location exists
  // ─────────────────────────────────────────────────────────────────────────
  const locationResult = await ensureMerchantLocation(headers);

  if (!locationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Merchant location required',
      message: locationResult.error,
      ebayErrors: locationResult.ebayErrors,
      raw: locationResult.raw,
      hint: 'Run GET /api/ebay-listings?debug=1 for diagnostics'
    });
  }

  const merchantLocationKey = locationResult.locationKey;
  console.log('[eBay:POST] ✓ Location:', merchantLocationKey);

  const config = { merchantLocationKey, policies };

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Parse products from request
  // ─────────────────────────────────────────────────────────────────────────
  const { products } = body || {};

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: products array required',
      hint: 'Send { products: [{ sku, name, brand, image, sizes: [{ size, price, qty }] }] }'
    });
  }

  console.log(`[eBay:POST] Processing ${products.length} product(s)...`);

  const results = {
    created: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    createdOffers: []
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Create listings for each product/size
  // ─────────────────────────────────────────────────────────────────────────
  for (const prod of products) {
    const sizes = prod.sizes || [];

    // Handle direct size property
    if (sizes.length === 0 && (prod.size || prod.price)) {
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
      const item = {
        sku: prod.sku,
        name: prod.name || prod.title,
        brand: prod.brand,
        image: prod.image,
        size: sizeData.size,
        price: sizeData.price || prod.price || 100,
        qty: sizeData.qty || sizeData.quantity || 1,
        condition: prod.condition || 'NEW',
        description: prod.description,
        stockxListingId: sizeData.stockxListingId
      };

      const result = await createSingleListing(headers, item, config);

      if (result.success) {
        results.created++;
        results.createdOffers.push({
          ebaySku: result.sku,
          baseSku: result.baseSku,
          size: result.size,
          offerId: result.offerId,
          listingId: result.listingId,
          ebayUrl: result.ebayUrl,
          stockxListingId: item.stockxListingId || null,
          price: result.price,
          alreadyExisted: result.alreadyExisted || false
        });
      } else {
        results.failed++;
        results.errors.push({
          sku: result.sku,
          baseSku: result.baseSku,
          size: result.size,
          step: result.step,
          status: result.status,
          error: result.error,
          ebayErrors: result.ebayErrors
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Return results
  // ─────────────────────────────────────────────────────────────────────────
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
      : `Failed to create listings. ${results.errors[0]?.error || 'See errors array for details.'}`
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: DELETE - End Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleDelete(headers, body, res) {
  const { offerIds } = body || {};

  if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'offerIds array required',
      hint: 'Send { offerIds: ["id1", "id2"] }'
    });
  }

  const results = { ended: 0, failed: 0, errors: [] };

  for (const offerId of offerIds) {
    try {
      const r = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
        { method: 'POST', headers }
      );

      if (r.ok || r.status === 204) {
        results.ended++;
        console.log(`[eBay:DELETE] ✓ Withdrawn: ${offerId}`);
      } else {
        const errText = await r.text();
        const parsed = parseEbayError(errText);
        results.failed++;
        results.errors.push({
          offerId,
          status: r.status,
          error: parsed.summary,
          ebayErrors: parsed.ebayErrors
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
// HANDLER: PATCH - Update Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handlePatch(headers, body, res) {
  const { updates } = body || {};

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'updates array required',
      hint: 'Send { updates: [{ sku, offerId, price?, quantity? }] }'
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
    const r = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/bulk_update_price_quantity`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ requests })
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      const parsed = parseEbayError(errText);
      return res.status(r.status).json({
        success: false,
        error: parsed.summary,
        ebayErrors: parsed.ebayErrors
      });
    }

    const data = await r.json();
    const responses = data.responses || [];

    return res.status(200).json({
      success: true,
      updated: responses.filter(x => x.statusCode === 200).length,
      failed: responses.filter(x => x.statusCode !== 200).length,
      responses
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      hint: 'Provide eBay access token as: Authorization: Bearer <token>'
    });
  }

  const accessToken = authHeader.replace('Bearer ', '');
  const headers = buildHeaders(accessToken);

  // Parse query params
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const query = Object.fromEntries(url.searchParams.entries());

  // Route to handler
  switch (req.method) {
    case 'GET':
      return handleGet(headers, query, res);
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
