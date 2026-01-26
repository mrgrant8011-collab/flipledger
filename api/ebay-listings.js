/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - Production Version
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Endpoints:
 *   GET    - Fetch all active eBay listings
 *   POST   - Create new listings (cross-list from StockX/inventory)
 *   PATCH  - Bulk update price/quantity
 *   DELETE - End/withdraw listings
 * 
 * Payload Format (POST):
 *   {
 *     products: [{
 *       sku: string,           // StockX styleId (e.g., "DD9315-005")
 *       name: string,          // Product name
 *       brand: string,         // Brand name
 *       image: string,         // Primary image URL
 *       sizes: [{
 *         size: string,        // Size value (e.g., "10", "9W")
 *         qty: number,         // Quantity (default: 1)
 *         price: number,       // Your asking price
 *         stockxListingId: string|null  // For oversell prevention mapping
 *       }]
 *     }],
 *     useVariations: boolean   // Optional: true = multi-variation listing (future)
 *   }
 * 
 * Data Flow:
 *   StockX Listing → CrossList.jsx → This API → eBay Inventory API
 *   
 * Image Sourcing:
 *   - Primary: product.image from StockX (passed from frontend)
 *   - Fallback: StockX CDN via styleId pattern
 *   - Must be HTTPS, min 500x500px recommended
 * 
 * Description Generation:
 *   - Auto-generated from product name, size, brand
 *   - Includes authenticity guarantee, shipping info
 *   - HTML formatted for eBay display
 * 
 * Pricing:
 *   - Base: sizeData.price (your StockX ask price)
 *   - eBay markup: 10% added to cover fees (configurable)
 *   - Final: Math.ceil(basePrice * 1.10)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE = 'EBAY_US';

// Price markup to cover eBay fees (10% = 1.10)
const EBAY_PRICE_MARKUP = 1.10;

// Default category for Athletic Shoes
const DEFAULT_CATEGORY_ID = '15709';

// Required environment variables
const REQUIRED_ENV_VARS = [
  'EBAY_FULFILLMENT_POLICY_ID',
  'EBAY_PAYMENT_POLICY_ID',
  'EBAY_RETURN_POLICY_ID'
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Validate Environment Variables
// ═══════════════════════════════════════════════════════════════════════════

function validateEnvVars() {
  const missing = [];
  const values = {};
  
  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName]?.trim();
    if (!value) {
      missing.push(varName);
    } else {
      values[varName] = value;
    }
  }
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required environment variables: ${missing.join(', ')}`,
      missing
    };
  }
  
  return { valid: true, values };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build eBay API Headers
// CRITICAL: Never forward browser headers - eBay rejects them
// ═══════════════════════════════════════════════════════════════════════════

function buildEbayHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
    'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Parse eBay Error Response
// ═══════════════════════════════════════════════════════════════════════════

function parseEbayError(errorBody) {
  try {
    const parsed = JSON.parse(errorBody);
    if (parsed.errors && Array.isArray(parsed.errors)) {
      return {
        message: parsed.errors.map(e => `${e.errorId}: ${e.message}`).join('; '),
        errors: parsed.errors,
        raw: errorBody
      };
    }
    if (parsed.error_description) {
      return { message: parsed.error_description, raw: errorBody };
    }
    return { message: errorBody, raw: errorBody };
  } catch {
    return { message: errorBody, raw: errorBody };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Ensure Merchant Location Exists
// Creates 'flipledger-warehouse' location if it doesn't exist
// ═══════════════════════════════════════════════════════════════════════════

async function ensureMerchantLocation(headers) {
  const LOCATION_KEY = 'flipledger-warehouse';
  
  // Step 1: Check if our location already exists
  try {
    const checkRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/location/${LOCATION_KEY}`,
      { method: 'GET', headers }
    );
    
    if (checkRes.ok) {
      console.log('[eBay] ✓ Merchant location exists:', LOCATION_KEY);
      return LOCATION_KEY;
    }
    
    if (checkRes.status !== 404) {
      const err = await checkRes.text();
      console.warn('[eBay] Location check returned:', checkRes.status, err);
    }
  } catch (e) {
    console.warn('[eBay] Location check error:', e.message);
  }
  
  // Step 2: Try to create the location
  const locationData = {
    location: {
      address: {
        addressLine1: process.env.EBAY_LOCATION_ADDRESS || '123 Warehouse St',
        city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
        stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
        postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
        country: 'US'
      }
    },
    locationTypes: ['WAREHOUSE'],
    name: 'FlipLedger Warehouse',
    merchantLocationStatus: 'ENABLED'
  };
  
  console.log('[eBay] Creating merchant location:', LOCATION_KEY);
  
  const createRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/location/${LOCATION_KEY}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(locationData)
    }
  );
  
  if (createRes.ok || createRes.status === 204 || createRes.status === 200) {
    console.log('[eBay] ✓ Merchant location created');
    return LOCATION_KEY;
  }
  
  // Step 3: If creation failed, try to find ANY existing location
  console.log('[eBay] Location creation failed, searching for existing...');
  
  const listRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/location?limit=10`,
    { method: 'GET', headers }
  );
  
  if (listRes.ok) {
    const listData = await listRes.json();
    const locations = listData.locations || [];
    
    const enabled = locations.find(l => l.merchantLocationStatus === 'ENABLED');
    if (enabled) {
      console.log('[eBay] ✓ Using existing location:', enabled.merchantLocationKey);
      return enabled.merchantLocationKey;
    }
    
    if (locations.length > 0) {
      console.log('[eBay] ✓ Using first available location:', locations[0].merchantLocationKey);
      return locations[0].merchantLocationKey;
    }
  }
  
  // Step 4: No location available - throw detailed error
  const errBody = await createRes.text().catch(() => 'Unknown error');
  const parsed = parseEbayError(errBody);
  
  throw new Error(
    `Merchant location required but could not be created. ` +
    `Go to eBay Seller Hub → Account → Business Policies → Shipping → Create a shipping location. ` +
    `eBay error: ${parsed.message}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate eBay SKU
// ═══════════════════════════════════════════════════════════════════════════

function generateEbaySku(baseSku, size) {
  const cleanSku = (baseSku || 'ITEM').replace(/[^a-zA-Z0-9\-]/g, '');
  const cleanSize = String(size || '?').replace(/[^a-zA-Z0-9.]/g, '');
  return `${cleanSku}-${cleanSize}`.substring(0, 50);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Generate HTML Description
// ═══════════════════════════════════════════════════════════════════════════

function generateDescription(product, size) {
  const name = product.name || 'Item';
  const brand = product.brand || 'Brand';
  const sku = product.sku || '';
  
  return `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333; margin-bottom: 10px;">${brand} ${name}</h2>
  <p style="color: #666; font-size: 14px;">Style: ${sku} | Size: ${size}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
  <h3 style="color: #333;">Product Details</h3>
  <ul style="color: #555; line-height: 1.8;">
    <li><strong>Brand:</strong> ${brand}</li>
    <li><strong>Size:</strong> ${size}</li>
    <li><strong>Style Code:</strong> ${sku}</li>
    <li><strong>Condition:</strong> Brand New, Deadstock</li>
    <li><strong>Authenticity:</strong> 100% Authentic Guaranteed</li>
  </ul>
  
  <h3 style="color: #333;">Shipping</h3>
  <p style="color: #555;">Ships within 1-2 business days. Items are carefully packaged with double-boxing for safe delivery.</p>
  
  <h3 style="color: #333;">Returns</h3>
  <p style="color: #555;">Please see our return policy for details. We stand behind every item we sell.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #888; font-size: 12px; text-align: center;">Listed via FlipLedger</p>
</div>
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Normalize Image URLs
// ═══════════════════════════════════════════════════════════════════════════

function normalizeImageUrls(product) {
  const urls = [];
  
  if (product.image) {
    let url = product.image;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!url.startsWith('http')) url = 'https://' + url;
    url = url.replace('http://', 'https://');
    urls.push(url);
  }
  
  if (product.images && Array.isArray(product.images)) {
    for (const img of product.images) {
      if (urls.length >= 12) break;
      let url = img;
      if (url.startsWith('//')) url = 'https:' + url;
      if (!url.startsWith('http')) url = 'https://' + url;
      url = url.replace('http://', 'https://');
      if (!urls.includes(url)) urls.push(url);
    }
  }
  
  return urls;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Find Existing Offer for SKU
// ═══════════════════════════════════════════════════════════════════════════

async function findExistingOffer(headers, sku) {
  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${EBAY_MARKETPLACE}`,
      { method: 'GET', headers }
    );
    
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
    console.warn('[eBay] Find existing offer error:', e.message);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Create Single Listing (Inventory + Offer + Publish)
// ═══════════════════════════════════════════════════════════════════════════

async function createSingleListing(headers, product, sizeData, config) {
  const {
    merchantLocationKey,
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId
  } = config;
  
  const ebaySku = generateEbaySku(product.sku, sizeData.size);
  const basePrice = parseFloat(sizeData.price) || parseFloat(product.price) || 100;
  const ebayPrice = Math.ceil(basePrice * EBAY_PRICE_MARKUP);
  const quantity = parseInt(sizeData.qty) || 1;
  
  console.log(`[eBay] Creating: ${ebaySku} @ $${ebayPrice} x${quantity}`);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Create/Update Inventory Item
  // ─────────────────────────────────────────────────────────────────────────
  
  const imageUrls = normalizeImageUrls(product);
  const productTitle = `${product.name || 'Item'} Size ${sizeData.size}`.substring(0, 80);
  const brand = product.brand || 'Nike';
  
  // Build aspects - filter out undefined values
  const aspects = {
    'Brand': [brand],
    'US Shoe Size': [String(sizeData.size)],
    'Style Code': [product.sku || 'N/A'],
    'Type': ['Athletic'],
    'Department': [product.gender === 'women' || String(sizeData.size).includes('W') ? 'Women' : 'Men']
  };
  if (product.color) aspects['Color'] = [product.color];
  
  const inventoryItem = {
    availability: {
      shipToLocationAvailability: { quantity }
    },
    condition: 'NEW',
    product: {
      title: productTitle,
      brand: brand,
      mpn: product.sku || ebaySku,
      description: generateDescription(product, sizeData.size),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      aspects
    }
  };
  
  try {
    const invRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(ebaySku)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(inventoryItem)
      }
    );
    
    if (!invRes.ok && invRes.status !== 204) {
      const errText = await invRes.text();
      const parsed = parseEbayError(errText);
      console.error(`[eBay] ✗ Inventory failed: ${invRes.status}`, parsed.message);
      return {
        success: false,
        ebaySku,
        step: 'inventory',
        error: parsed.message,
        errorDetails: parsed.errors
      };
    }
    
    console.log(`[eBay] ✓ Inventory: ${ebaySku}`);
    
  } catch (e) {
    console.error(`[eBay] ✗ Inventory exception:`, e.message);
    return { success: false, ebaySku, step: 'inventory', error: e.message };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Create Offer
  // ─────────────────────────────────────────────────────────────────────────
  
  const offer = {
    sku: ebaySku,
    marketplaceId: EBAY_MARKETPLACE,
    format: 'FIXED_PRICE',
    listingDescription: generateDescription(product, sizeData.size),
    availableQuantity: quantity,
    categoryId: DEFAULT_CATEGORY_ID,
    pricingSummary: {
      price: { value: String(ebayPrice), currency: 'USD' }
    },
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId
    },
    merchantLocationKey
  };
  
  let offerId;
  
  try {
    const offerRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(offer)
      }
    );
    
    if (!offerRes.ok) {
      const errText = await offerRes.text();
      const parsed = parseEbayError(errText);
      console.error(`[eBay] ✗ Offer failed: ${offerRes.status}`, parsed.message);
      
      // Check if offer already exists
      if (parsed.errors?.some(e => e.errorId === 25002 || e.errorId === 25001)) {
        const existingOffer = await findExistingOffer(headers, ebaySku);
        if (existingOffer) {
          console.log(`[eBay] Found existing offer: ${existingOffer.offerId}`);
          offerId = existingOffer.offerId;
          
          if (existingOffer.status === 'PUBLISHED') {
            return {
              success: true,
              ebaySku,
              offerId: existingOffer.offerId,
              listingId: existingOffer.listingId,
              price: ebayPrice,
              alreadyExisted: true
            };
          }
        }
      }
      
      if (!offerId) {
        return {
          success: false,
          ebaySku,
          step: 'offer',
          error: parsed.message,
          errorDetails: parsed.errors
        };
      }
    } else {
      const offerData = await offerRes.json();
      offerId = offerData.offerId;
      console.log(`[eBay] ✓ Offer: ${offerId}`);
    }
    
  } catch (e) {
    console.error(`[eBay] ✗ Offer exception:`, e.message);
    return { success: false, ebaySku, step: 'offer', error: e.message };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Publish Offer
  // ─────────────────────────────────────────────────────────────────────────
  
  try {
    const publishRes = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
      { method: 'POST', headers }
    );
    
    if (!publishRes.ok) {
      const errText = await publishRes.text();
      const parsed = parseEbayError(errText);
      console.error(`[eBay] ✗ Publish failed: ${publishRes.status}`, parsed.message);
      return {
        success: false,
        ebaySku,
        offerId,
        step: 'publish',
        error: parsed.message,
        errorDetails: parsed.errors
      };
    }
    
    const publishData = await publishRes.json();
    const listingId = publishData.listingId;
    
    console.log(`[eBay] ✓ Published! listingId: ${listingId}`);
    
    return {
      success: true,
      ebaySku,
      offerId,
      listingId,
      price: ebayPrice,
      ebayUrl: `https://www.ebay.com/itm/${listingId}`
    };
    
  } catch (e) {
    console.error(`[eBay] ✗ Publish exception:`, e.message);
    return { success: false, ebaySku, offerId, step: 'publish', error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // AUTH: Validate token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please provide a valid eBay access token'
    });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  const headers = buildEbayHeaders(accessToken);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GET: Fetch all active eBay listings
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (req.method === 'GET') {
    try {
      let allItems = [];
      let offset = 0;
      const limit = 100;
      
      while (offset < 1000) {
        const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          const err = await response.text();
          console.error('[eBay GET] Error:', response.status, err);
          if (offset === 0) {
            return res.status(response.status).json({
              success: false,
              error: 'Failed to fetch eBay inventory',
              details: parseEbayError(err).message
            });
          }
          break;
        }
        
        const data = await response.json();
        const items = data.inventoryItems || [];
        allItems = allItems.concat(items);
        
        if (items.length < limit || !data.next) break;
        offset += limit;
      }
      
      console.log(`[eBay GET] Fetched ${allItems.length} inventory items`);
      
      const listings = [];
      
      for (let i = 0; i < allItems.length; i += 10) {
        const batch = allItems.slice(i, i + 10);
        
        await Promise.all(batch.map(async (item) => {
          try {
            const sku = item.sku;
            const offersRes = await fetch(
              `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${EBAY_MARKETPLACE}`,
              { headers }
            );
            
            if (!offersRes.ok) return;
            
            const offersData = await offersRes.json();
            const offers = offersData.offers || [];
            
            for (const offer of offers.filter(o => o.status === 'PUBLISHED')) {
              const aspects = item.product?.aspects || {};
              const size = aspects['US Shoe Size']?.[0] || aspects['Size']?.[0] || '';
              
              listings.push({
                sku: item.sku,
                offerId: offer.offerId,
                listingId: offer.listing?.listingId || null,
                title: item.product?.title || 'eBay Item',
                mpn: item.product?.mpn || '',
                brand: item.product?.brand || '',
                size,
                image: item.product?.imageUrls?.[0] || '',
                price: parseFloat(offer.pricingSummary?.price?.value) || 0,
                currency: offer.pricingSummary?.price?.currency || 'USD',
                quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
                status: offer.status,
                format: offer.format || 'FIXED_PRICE',
                categoryId: offer.categoryId
              });
            }
          } catch (e) {
            console.warn(`[eBay] Offer fetch error for ${item.sku}:`, e.message);
          }
        }));
      }
      
      console.log(`[eBay GET] Found ${listings.length} published listings`);
      
      return res.status(200).json({ success: true, listings, total: listings.length });
      
    } catch (error) {
      console.error('[eBay GET] Fatal error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch listings',
        message: error.message
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // POST: Create new eBay listings
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (req.method === 'POST') {
    console.log('[eBay POST] === CREATE LISTINGS ===');
    
    try {
      // STEP 1: Validate env vars
      const envCheck = validateEnvVars();
      if (!envCheck.valid) {
        console.error('[eBay POST] Env validation failed:', envCheck.error);
        return res.status(400).json({
          success: false,
          error: 'Configuration error',
          message: envCheck.error,
          missing: envCheck.missing,
          hint: 'Set these in Vercel project settings'
        });
      }
      
      const { 
        EBAY_FULFILLMENT_POLICY_ID: fulfillmentPolicyId,
        EBAY_PAYMENT_POLICY_ID: paymentPolicyId,
        EBAY_RETURN_POLICY_ID: returnPolicyId
      } = envCheck.values;
      
      console.log('[eBay POST] ✓ Policy IDs validated');
      
      // STEP 2: Parse request body
      const { products } = req.body || {};
      
      console.log('[eBay POST] Received:', {
        productCount: products?.length || 0,
        bodyKeys: Object.keys(req.body || {})
      });
      
      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          message: 'Expected { products: [{ sku, name, brand, image, sizes: [{size, qty, price}] }] }',
          received: Object.keys(req.body || {})
        });
      }
      
      // STEP 3: Ensure merchant location
      let merchantLocationKey;
      try {
        merchantLocationKey = await ensureMerchantLocation(headers);
        console.log('[eBay POST] ✓ Location:', merchantLocationKey);
      } catch (locError) {
        console.error('[eBay POST] ✗ Location error:', locError.message);
        return res.status(400).json({
          success: false,
          error: 'Merchant location required',
          message: locError.message
        });
      }
      
      const config = {
        merchantLocationKey,
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId
      };
      
      // STEP 4: Process each product/size
      const results = {
        created: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        createdOffers: []
      };
      
      for (const product of products) {
        const sizes = product.sizes || [];
        
        if (sizes.length === 0 && product.size) {
          sizes.push({
            size: product.size,
            qty: product.qty || 1,
            price: product.price || 100,
            stockxListingId: product.stockxListingId || null
          });
        }
        
        if (sizes.length === 0) {
          console.warn(`[eBay POST] Product ${product.sku} has no sizes`);
          results.skipped++;
          continue;
        }
        
        for (const sizeData of sizes) {
          const result = await createSingleListing(headers, product, sizeData, config);
          
          if (result.success) {
            results.created++;
            results.createdOffers.push({
              ebaySku: result.ebaySku,
              baseSku: product.sku,
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
              sku: result.ebaySku,
              baseSku: product.sku,
              size: sizeData.size,
              step: result.step,
              error: result.error,
              errorDetails: result.errorDetails
            });
          }
        }
      }
      
      console.log(`[eBay POST] === DONE: ${results.created} created, ${results.failed} failed ===`);
      
      const statusCode = results.created > 0 ? 200 : 400;
      
      return res.status(statusCode).json({
        success: results.created > 0,
        created: results.created,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors,
        createdOffers: results.createdOffers,
        message: results.created > 0 
          ? `Created ${results.created} eBay listing(s)` 
          : `Failed. ${results.errors[0]?.error || 'See errors.'}`
      });
      
    } catch (error) {
      console.error('[eBay POST] Fatal error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Unexpected error',
        message: error.message
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH: Bulk update price/quantity
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (req.method === 'PATCH') {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Expected { updates: [{ sku, offerId, price?, quantity? }] }'
        });
      }
      
      const requests = updates.map(u => ({
        sku: u.sku,
        shipToLocationAvailability: u.quantity !== undefined ? { quantity: parseInt(u.quantity) } : undefined,
        offers: [{
          offerId: u.offerId,
          availableQuantity: u.quantity !== undefined ? parseInt(u.quantity) : undefined,
          price: u.price !== undefined ? { value: String(u.price), currency: 'USD' } : undefined
        }]
      }));
      
      const bulkRes = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/bulk_update_price_quantity`,
        { method: 'POST', headers, body: JSON.stringify({ requests }) }
      );
      
      if (!bulkRes.ok) {
        const err = await bulkRes.text();
        return res.status(bulkRes.status).json({
          success: false,
          error: 'Bulk update failed',
          message: parseEbayError(err).message
        });
      }
      
      const bulkData = await bulkRes.json();
      const responses = bulkData.responses || [];
      
      return res.status(200).json({
        success: true,
        updated: responses.filter(r => r.statusCode === 200).length,
        failed: responses.filter(r => r.statusCode !== 200).length,
        responses
      });
      
    } catch (error) {
      console.error('[eBay PATCH] Error:', error.message);
      return res.status(500).json({ success: false, error: 'Update failed', message: error.message });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE: Withdraw/end listings
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (req.method === 'DELETE') {
    try {
      const { offerIds } = req.body;
      
      if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Expected { offerIds: ["offer1", ...] }'
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
            console.log(`[eBay DELETE] ✓ Withdrawn: ${offerId}`);
          } else {
            const err = await withdrawRes.text();
            results.failed++;
            results.errors.push({ offerId, error: parseEbayError(err).message });
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
      
    } catch (error) {
      console.error('[eBay DELETE] Error:', error.message);
      return res.status(500).json({ success: false, error: 'Delete failed', message: error.message });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'PATCH', 'DELETE']
  });
}
