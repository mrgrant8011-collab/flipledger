/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - v6.0 Production
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Complete rewrite with proper eBay API flow:
 * 1. Dynamic category resolution via Browse API
 * 2. Required aspects fetched via Taxonomy API
 * 3. Correct inventory item → offer → publish flow
 * 4. Proper StockX → eBay field mapping
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

// ═══════════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════════

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_MARKETPLACE_ID = 'EBAY_US';
const EBAY_LOCALE = 'en-US';
const EBAY_CATEGORY_TREE_ID = '0'; // US category tree

// Fallback category IDs by product type (only used if Browse API fails)
const FALLBACK_CATEGORIES = {
  shoes: '15709',      // Athletic Shoes
  sneakers: '15709',   // Athletic Shoes
  apparel: '185100',   // Men's Clothing
  streetwear: '185100',
  collectibles: '73511',
  electronics: '58058',
  default: '15709'     // Athletic Shoes as default for sneaker-focused app
};

const PRICE_MARKUP = 1.10; // 10% markup to cover eBay fees
const LOCATION_KEY = 'flipledger-warehouse';

// ═══════════════════════════════════════════════════════════════════════════════════
// HEADERS - Per eBay REST API Documentation
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Build required headers for eBay REST API calls
 * Content-Language is REQUIRED for inventory items
 */
function buildHeaders(accessToken) {
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
// ENV VAR VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════════

function validateAndLogEnv() {
  const envStatus = {
    EBAY_FULFILLMENT_POLICY_ID: !!process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: !!process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: !!process.env.EBAY_RETURN_POLICY_ID?.trim(),
    EBAY_CLIENT_ID: !!process.env.EBAY_CLIENT_ID?.trim(),
    EBAY_CLIENT_SECRET: !!process.env.EBAY_CLIENT_SECRET?.trim(),
    EBAY_RU_NAME: !!process.env.EBAY_RU_NAME?.trim(),
    EBAY_LOCATION_ADDRESS: !!process.env.EBAY_LOCATION_ADDRESS?.trim(),
    EBAY_LOCATION_CITY: !!process.env.EBAY_LOCATION_CITY?.trim(),
    EBAY_LOCATION_STATE: !!process.env.EBAY_LOCATION_STATE?.trim(),
    EBAY_LOCATION_ZIP: !!process.env.EBAY_LOCATION_ZIP?.trim()
  };

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
// CATEGORY RESOLUTION - Use Browse API to find correct category
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Search eBay Browse API to find the best category for a product
 * Returns categoryId and categoryName
 * 
 * Strategy:
 * 1. Search for the product title on eBay
 * 2. Extract categoryId from the first matching item
 * 3. Fall back to predefined categories if search fails
 */
async function resolveCategoryFromBrowseAPI(headers, productTitle, brand) {
  console.log(`[eBay:Category] Resolving category for: "${productTitle}"`);
  
  try {
    // Build search query - use brand + key words from title
    const searchQuery = encodeURIComponent(
      `${brand || ''} ${productTitle}`.trim().substring(0, 100)
    );
    
    const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${searchQuery}&limit=5&filter=conditionIds:{1000}`;
    console.log('[eBay:Category] GET', url);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        // Browse API doesn't need Content-Language
        'Content-Language': undefined
      }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[eBay:Category] Browse API failed:', res.status, errText.substring(0, 200));
      return null;
    }
    
    const data = await res.json();
    const items = data.itemSummaries || [];
    
    if (items.length === 0) {
      console.warn('[eBay:Category] No items found in Browse API search');
      return null;
    }
    
    // Extract category from the first item that has one
    for (const item of items) {
      if (item.categories && item.categories.length > 0) {
        const category = item.categories[0];
        console.log(`[eBay:Category] ✓ Found category: ${category.categoryId} (${category.categoryName})`);
        return {
          categoryId: category.categoryId,
          categoryName: category.categoryName
        };
      }
    }
    
    console.warn('[eBay:Category] No categories found in search results');
    return null;
    
  } catch (e) {
    console.error('[eBay:Category] Browse API exception:', e.message);
    return null;
  }
}

/**
 * Get fallback category based on product type keywords
 */
function getFallbackCategory(productTitle, brand) {
  const titleLower = (productTitle || '').toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  const combined = `${titleLower} ${brandLower}`;
  
  // Check for shoe/sneaker keywords
  if (combined.match(/shoe|sneaker|jordan|yeezy|dunk|air max|air force|nike|adidas|new balance|converse|vans|boot/)) {
    return { categoryId: FALLBACK_CATEGORIES.shoes, categoryName: 'Athletic Shoes (Fallback)' };
  }
  
  // Check for apparel keywords
  if (combined.match(/shirt|hoodie|jacket|pants|shorts|tee|sweatshirt|apparel/)) {
    return { categoryId: FALLBACK_CATEGORIES.apparel, categoryName: 'Clothing (Fallback)' };
  }
  
  // Default to shoes (since this is primarily a sneaker app)
  return { categoryId: FALLBACK_CATEGORIES.default, categoryName: 'Athletic Shoes (Default)' };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// TAXONOMY API - Fetch required aspects for a category
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the required and recommended aspects for a category
 * Uses eBay Taxonomy API
 */
async function getCategoryAspects(headers, categoryId) {
  console.log(`[eBay:Taxonomy] Fetching aspects for category: ${categoryId}`);
  
  try {
    const url = `${EBAY_API_BASE}/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`;
    console.log('[eBay:Taxonomy] GET', url);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': headers['Authorization'],
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[eBay:Taxonomy] Failed to get aspects:', res.status, errText.substring(0, 200));
      return null;
    }
    
    const data = await res.json();
    const aspects = data.aspects || [];
    
    // Separate required vs recommended aspects
    const required = aspects.filter(a => 
      a.aspectConstraint?.aspectRequired === true ||
      a.aspectConstraint?.aspectUsage === 'REQUIRED'
    );
    
    const recommended = aspects.filter(a => 
      a.aspectConstraint?.aspectUsage === 'RECOMMENDED'
    );
    
    console.log(`[eBay:Taxonomy] ✓ Found ${required.length} required, ${recommended.length} recommended aspects`);
    
    return {
      required: required.map(a => ({
        name: a.localizedAspectName,
        dataType: a.aspectConstraint?.aspectDataType,
        values: a.aspectValues?.map(v => v.localizedValue) || [],
        mode: a.aspectConstraint?.aspectMode
      })),
      recommended: recommended.map(a => ({
        name: a.localizedAspectName,
        dataType: a.aspectConstraint?.aspectDataType,
        values: a.aspectValues?.map(v => v.localizedValue) || [],
        mode: a.aspectConstraint?.aspectMode
      })),
      all: aspects
    };
    
  } catch (e) {
    console.error('[eBay:Taxonomy] Exception:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ASPECT MAPPING - Map StockX fields to eBay aspects
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Build eBay product aspects from StockX item data
 * Handles the mapping of StockX fields to eBay's expected aspect names
 */
function buildProductAspects(item, categoryAspects) {
  const aspects = {};
  
  // ─────────────────────────────────────────────────────────────────────────
  // Core aspects that are almost always required for shoes
  // ─────────────────────────────────────────────────────────────────────────
  
  // Brand - Required for most categories
  if (item.brand) {
    aspects['Brand'] = [item.brand];
  } else {
    aspects['Brand'] = ['Unbranded'];
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Shoe-specific aspects
  // ─────────────────────────────────────────────────────────────────────────
  
  if (item.size) {
    const sizeStr = String(item.size);
    
    // US Shoe Size - Clean up the size value
    const cleanSize = sizeStr.replace(/[^\d.]/g, '');
    if (cleanSize) {
      aspects['US Shoe Size'] = [cleanSize];
    }
    
    // Department - Determine from size notation
    if (sizeStr.toUpperCase().includes('W') || sizeStr.toUpperCase().includes('WOMEN')) {
      aspects['Department'] = ['Women'];
      // Women's shoe sizes
      aspects['US Shoe Size (Women\'s)'] = [cleanSize];
    } else if (sizeStr.toUpperCase().includes('Y') || sizeStr.toUpperCase().includes('GS') || 
               sizeStr.toUpperCase().includes('PS') || sizeStr.toUpperCase().includes('TD') ||
               sizeStr.toUpperCase().includes('C')) {
      // Youth/Kids sizes: GS (Grade School), PS (Preschool), TD (Toddler), C (Child)
      aspects['Department'] = ['Kids'];
    } else if (parseFloat(cleanSize) < 4) {
      // Very small sizes are likely kids
      aspects['Department'] = ['Kids'];
    } else {
      aspects['Department'] = ['Men'];
      aspects['US Shoe Size (Men\'s)'] = [cleanSize];
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Extract additional details from StockX data
  // ─────────────────────────────────────────────────────────────────────────
  
  // Style Code (often in StockX data as styleId or sku)
  if (item.styleId || item.styleCode) {
    aspects['Style Code'] = [item.styleId || item.styleCode];
  }
  
  // Color - Extract from colorway or title
  if (item.colorway) {
    // StockX colorway format: "Black/White/University Red"
    const primaryColor = item.colorway.split('/')[0].trim();
    aspects['Color'] = [primaryColor];
    // Some categories want the full colorway
    aspects['Colorway'] = [item.colorway];
  } else if (item.color) {
    aspects['Color'] = [Array.isArray(item.color) ? item.color[0] : item.color];
  }
  
  // Model - Extract from title if not provided
  if (item.model) {
    aspects['Model'] = [item.model];
  }
  
  // Silhouette/Type - Common for sneakers
  if (item.silhouette) {
    aspects['Silhouette'] = [item.silhouette];
  }
  
  // Type - Athletic shoes category often requires this
  aspects['Type'] = ['Athletic'];
  
  // Performance/Activity - Common required aspect
  aspects['Performance/Activity'] = ['Casual'];
  
  // Upper Material - If available
  if (item.upperMaterial) {
    aspects['Upper Material'] = [item.upperMaterial];
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fill in missing required aspects with sensible defaults
  // ─────────────────────────────────────────────────────────────────────────
  
  if (categoryAspects?.required) {
    for (const reqAspect of categoryAspects.required) {
      const aspectName = reqAspect.name;
      
      // Skip if we already have this aspect
      if (aspects[aspectName]) continue;
      
      // Try to provide reasonable defaults for common required aspects
      switch (aspectName) {
        case 'Department':
          if (!aspects['Department']) {
            aspects['Department'] = ['Men']; // Default to Men's
          }
          break;
        case 'Style':
          aspects['Style'] = ['Sneaker'];
          break;
        case 'Closure':
          aspects['Closure'] = ['Lace Up'];
          break;
        case 'Features':
          aspects['Features'] = ['Cushioned'];
          break;
        case 'Outsole Material':
          aspects['Outsole Material'] = ['Rubber'];
          break;
        case 'Character':
          // Only add if we have a value, otherwise skip (not always required)
          break;
        default:
          // For other required aspects, check if there are valid values we can use
          if (reqAspect.values && reqAspect.values.length > 0) {
            console.log(`[eBay:Aspects] Missing required aspect "${aspectName}" - no default available`);
          }
      }
    }
  }
  
  console.log('[eBay:Aspects] Built aspects:', JSON.stringify(aspects, null, 2));
  return aspects;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ENSURE MERCHANT LOCATION
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Ensures a merchant location exists for the seller
 * Required for creating offers
 */
async function ensureMerchantLocation(headers) {
  console.log('[eBay:Location] Checking for existing merchant locations...');

  // Step 1: List all existing locations
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
      const parsed = parseEbayError(listText);
      console.warn('[eBay:Location] List failed:', parsed.summary);
    }
  } catch (e) {
    console.warn('[eBay:Location] List exception:', e.message);
  }

  // Step 2: No locations exist - create one
  console.log('[eBay:Location] No locations found, creating new location...');

  const address = {
    addressLine1: process.env.EBAY_LOCATION_ADDRESS || '100 Commerce Street',
    city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
    stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
    postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
    country: 'US'
  };

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
    const createUrl = `${EBAY_API_BASE}/sell/inventory/v1/location/${LOCATION_KEY}`;
    console.log('[eBay:Location] POST', createUrl);

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(locationPayload)
    });

    const createText = await createRes.text();
    console.log('[eBay:Location] Create response:', createRes.status, createText.substring(0, 300));

    if (createRes.ok || createRes.status === 204) {
      console.log('[eBay:Location] ✓ Location created:', LOCATION_KEY);
      return { success: true, locationKey: LOCATION_KEY, isNew: true };
    }

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
// STEP 1: CREATE INVENTORY ITEM
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Create or replace an inventory item
 * PUT /sell/inventory/v1/inventory_item/{sku}
 * 
 * This creates the product in eBay's inventory system.
 * The inventory item contains: product details, aspects, images, condition, availability
 */
async function createInventoryItem(headers, sku, itemData, aspects) {
  console.log(`[eBay:Inventory] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Inventory] Creating inventory item: ${sku}`);

  const { title, description, quantity, condition, image, images } = itemData;

  // Build the inventory item payload per eBay's schema
  const inventoryItem = {
    // Availability - required
    availability: {
      shipToLocationAvailability: {
        quantity: parseInt(quantity) || 1
      }
    },
    
    // Condition - required
    // Valid values: NEW, LIKE_NEW, NEW_OTHER, NEW_WITH_DEFECTS, 
    // MANUFACTURER_REFURBISHED, CERTIFIED_REFURBISHED, EXCELLENT_REFURBISHED,
    // VERY_GOOD_REFURBISHED, GOOD_REFURBISHED, SELLER_REFURBISHED,
    // USED_EXCELLENT, USED_VERY_GOOD, USED_GOOD, USED_ACCEPTABLE, FOR_PARTS_OR_NOT_WORKING
    condition: mapCondition(condition),
    
    // Product details - required
    product: {
      title: sanitizeTitle(title).substring(0, 80),
      description: description || generateDescription(itemData),
      aspects: aspects,
      brand: aspects['Brand']?.[0] || 'Unbranded',
      mpn: sku // Manufacturer Part Number - using SKU as fallback
    }
  };

  // Add images - important for listings
  const imageUrls = buildImageUrls(image, images);
  if (imageUrls.length > 0) {
    inventoryItem.product.imageUrls = imageUrls;
  }

  console.log('[eBay:Inventory] Payload:', JSON.stringify(inventoryItem, null, 2));

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
      console.log(`[eBay:Inventory] ✓ Inventory item created: ${sku}`);
      return { success: true, sku };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);
    console.error(`[eBay:Inventory] ✗ Failed (${res.status}):`, parsed.summary);
    console.error('[eBay:Inventory] Full error:', errText);

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

/**
 * Map condition string to eBay's condition enum
 */
function mapCondition(condition) {
  const c = (condition || 'NEW').toUpperCase();
  
  const conditionMap = {
    'NEW': 'NEW',
    'BRAND NEW': 'NEW',
    'NEW WITH BOX': 'NEW',
    'NEW WITH TAGS': 'NEW',
    'NEW WITHOUT BOX': 'NEW_OTHER',
    'NEW WITHOUT TAGS': 'NEW_OTHER',
    'NEW_OTHER': 'NEW_OTHER',
    'NEW_WITH_DEFECTS': 'NEW_WITH_DEFECTS',
    'USED': 'USED_EXCELLENT',
    'USED - EXCELLENT': 'USED_EXCELLENT',
    'USED_EXCELLENT': 'USED_EXCELLENT',
    'USED - GOOD': 'USED_GOOD',
    'USED_GOOD': 'USED_GOOD',
    'PRE-OWNED': 'USED_EXCELLENT'
  };
  
  return conditionMap[c] || 'NEW';
}

/**
 * Sanitize title - remove special characters that eBay doesn't allow
 */
function sanitizeTitle(title) {
  if (!title) return 'Item';
  
  return title
    .replace(/[<>]/g, '') // Remove HTML-like characters
    .replace(/[\u0000-\u001F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Generate a description from item data
 */
function generateDescription(itemData) {
  const parts = [];
  
  parts.push(`<p><strong>${sanitizeTitle(itemData.title)}</strong></p>`);
  
  if (itemData.size) {
    parts.push(`<p><strong>Size:</strong> ${itemData.size}</p>`);
  }
  
  if (itemData.colorway) {
    parts.push(`<p><strong>Colorway:</strong> ${itemData.colorway}</p>`);
  }
  
  if (itemData.styleId) {
    parts.push(`<p><strong>Style Code:</strong> ${itemData.styleId}</p>`);
  }
  
  parts.push(`<p>Brand new, 100% authentic. Ships within 1-2 business days.</p>`);
  parts.push(`<p>All items are shipped double-boxed for protection.</p>`);
  
  return parts.join('\n');
}

/**
 * Build image URLs array, ensuring HTTPS
 */
function buildImageUrls(primaryImage, additionalImages) {
  const urls = [];
  
  const normalizeUrl = (url) => {
    if (!url) return null;
    let normalized = url;
    if (normalized.startsWith('//')) normalized = 'https:' + normalized;
    normalized = normalized.replace(/^http:\/\//i, 'https://');
    return normalized;
  };
  
  if (primaryImage) {
    const normalized = normalizeUrl(primaryImage);
    if (normalized) urls.push(normalized);
  }
  
  if (additionalImages && Array.isArray(additionalImages)) {
    for (const img of additionalImages) {
      const normalized = normalizeUrl(img);
      if (normalized && !urls.includes(normalized)) {
        urls.push(normalized);
      }
    }
  }
  
  // eBay allows up to 12 images
  return urls.slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 2: CREATE OFFER
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Create an offer for an inventory item
 * POST /sell/inventory/v1/offer
 * 
 * The offer defines: price, category, policies, and marketplace details
 */
async function createOffer(headers, sku, offerData, policies, merchantLocationKey, categoryId) {
  console.log(`[eBay:Offer] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Offer] Creating offer for SKU: ${sku}`);
  console.log(`[eBay:Offer] Category: ${categoryId}, Location: ${merchantLocationKey}`);

  const { price, quantity, description } = offerData;
  const { EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID } = policies;

  // Apply markup to cover eBay fees
  const ebayPrice = Math.ceil(parseFloat(price) * PRICE_MARKUP);

  const offerPayload = {
    sku: sku,
    marketplaceId: EBAY_MARKETPLACE_ID,
    format: 'FIXED_PRICE',
    availableQuantity: parseInt(quantity) || 1,
    
    // Category - dynamically resolved
    categoryId: categoryId,
    
    // Listing description (HTML allowed)
    listingDescription: description || `<p>Brand new, 100% authentic. Ships within 1-2 business days.</p>`,
    
    // Pricing
    pricingSummary: {
      price: {
        value: String(ebayPrice),
        currency: 'USD'
      }
    },
    
    // Policies - from environment variables
    listingPolicies: {
      fulfillmentPolicyId: EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: EBAY_RETURN_POLICY_ID
    },
    
    // Merchant location - required
    merchantLocationKey: merchantLocationKey
  };

  console.log('[eBay:Offer] Payload:', JSON.stringify(offerPayload, null, 2));

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
      console.log(`[eBay:Offer] ✓ Offer created: ${data.offerId}`);
      return { success: true, offerId: data.offerId, sku, price: ebayPrice };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);

    // Check if offer already exists
    const alreadyExists = parsed.ebayErrors?.some(e => 
      e.errorId === 25002 || e.errorId === 25001 || 
      String(e.message || '').toLowerCase().includes('already exists')
    );

    if (alreadyExists) {
      console.log(`[eBay:Offer] Offer may already exist, searching for SKU: ${sku}`);
      const existing = await findOfferBySku(headers, sku);
      if (existing) {
        console.log(`[eBay:Offer] ✓ Found existing offer: ${existing.offerId} (${existing.status})`);
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
    console.error('[eBay:Offer] Full error:', errText);

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

/**
 * Find existing offer by SKU
 */
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
// STEP 3: PUBLISH OFFER
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Publish an offer to make it live on eBay
 * POST /sell/inventory/v1/offer/{offerId}/publish
 */
async function publishOffer(headers, offerId) {
  console.log(`[eBay:Publish] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Publish] Publishing offer: ${offerId}`);

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`;
    console.log('[eBay:Publish] POST', url);
    
    const res = await fetch(url, { method: 'POST', headers });

    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Publish] ✓ PUBLISHED! Listing ID: ${data.listingId}`);
      console.log(`[eBay:Publish] ✓ eBay URL: https://www.ebay.com/itm/${data.listingId}`);
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
    console.error('[eBay:Publish] Full error:', errText);

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
// CREATE SINGLE LISTING - Complete flow
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Creates a single eBay listing using the complete flow:
 * 1. Resolve category via Browse API
 * 2. Fetch required aspects via Taxonomy API
 * 3. Create inventory item with proper aspects
 * 4. Create offer with resolved category
 * 5. Publish offer to make it live
 */
async function createSingleListing(headers, item, config) {
  const { merchantLocationKey, policies } = config;

  // ─────────────────────────────────────────────────────────────────────────
  // Build SKU from base SKU + size
  // ─────────────────────────────────────────────────────────────────────────
  const baseSku = (item.sku || item.styleId || 'ITEM').replace(/[^a-zA-Z0-9\-]/g, '');
  const sizeClean = String(item.size || '').replace(/[^a-zA-Z0-9.]/g, '');
  const sku = item.size ? `${baseSku}-${sizeClean}`.substring(0, 50) : baseSku.substring(0, 50);

  // Build title with size
  const baseTitle = item.name || item.title || 'Item';
  const title = item.size 
    ? `${baseTitle} Size ${item.size}`.substring(0, 80)
    : baseTitle.substring(0, 80);

  console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
  console.log(`[eBay:Listing] STARTING LISTING CREATION`);
  console.log(`[eBay:Listing] SKU: ${sku}`);
  console.log(`[eBay:Listing] Title: ${title}`);
  console.log(`[eBay:Listing] Price: $${item.price}`);
  console.log(`[eBay:Listing] ════════════════════════════════════════════════════════════\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 0: Resolve category dynamically
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Step 0: Resolving category...');
  
  let categoryInfo = await resolveCategoryFromBrowseAPI(headers, baseTitle, item.brand);
  
  if (!categoryInfo) {
    console.log('[eBay:Listing] Browse API failed, using fallback category');
    categoryInfo = getFallbackCategory(baseTitle, item.brand);
  }
  
  const categoryId = categoryInfo.categoryId;
  console.log(`[eBay:Listing] Using category: ${categoryId} (${categoryInfo.categoryName})`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 0b: Fetch required aspects for category
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Fetching category aspects...');
  
  const categoryAspects = await getCategoryAspects(headers, categoryId);
  
  if (categoryAspects?.required?.length > 0) {
    console.log('[eBay:Listing] Required aspects:', categoryAspects.required.map(a => a.name).join(', '));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build product aspects with proper mapping
  // ─────────────────────────────────────────────────────────────────────────
  const productAspects = buildProductAspects({
    ...item,
    title: title
  }, categoryAspects);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Create Inventory Item
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Step 1: Creating inventory item...');
  
  const invResult = await createInventoryItem(headers, sku, {
    title,
    description: item.description || generateDescription({ ...item, title }),
    quantity: item.qty || item.quantity || 1,
    condition: item.condition || 'NEW',
    image: item.image,
    images: item.images,
    colorway: item.colorway,
    styleId: item.styleId,
    size: item.size
  }, productAspects);

  if (!invResult.success) {
    console.error(`[eBay:Listing] ✗ FAILED at inventory item step`);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Create Offer
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Step 2: Creating offer...');
  
  const offerResult = await createOffer(
    headers,
    sku,
    {
      price: item.price || 100,
      quantity: item.qty || item.quantity || 1,
      description: item.description
    },
    policies,
    merchantLocationKey,
    categoryId
  );

  if (!offerResult.success) {
    console.error(`[eBay:Listing] ✗ FAILED at offer step`);
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
    console.log(`[eBay:Listing] ✓ Offer already published: ${offerResult.listingId}`);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Publish Offer
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Step 3: Publishing offer...');
  
  const publishResult = await publishOffer(headers, offerResult.offerId);

  if (!publishResult.success) {
    console.error(`[eBay:Listing] ✗ FAILED at publish step`);
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

  console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
  console.log(`[eBay:Listing] ✓ SUCCESS!`);
  console.log(`[eBay:Listing] SKU: ${sku}`);
  console.log(`[eBay:Listing] Listing ID: ${publishResult.listingId}`);
  console.log(`[eBay:Listing] URL: ${publishResult.ebayUrl}`);
  console.log(`[eBay:Listing] ════════════════════════════════════════════════════════════\n`);

  return {
    success: true,
    sku,
    baseSku,
    size: item.size,
    offerId: offerResult.offerId,
    listingId: publishResult.listingId,
    ebayUrl: publishResult.ebayUrl,
    price: offerResult.price,
    categoryId,
    categoryName: categoryInfo.categoryName
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
      categoryTest: {},
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

    // Test category resolution
    try {
      const categoryResult = await resolveCategoryFromBrowseAPI(headers, 'Nike Air Jordan 1', 'Nike');
      diag.categoryTest = categoryResult || { error: 'No category found' };
    } catch (e) {
      diag.categoryTest = { error: e.message };
    }

    if (locationResult.success && diag.tokenTest.ok) {
      diag.recommendation = 'All systems operational. Ready to create listings.';
    } else if (!locationResult.success) {
      diag.recommendation = 'Failed to create/find merchant location. Check address env vars.';
    }

    return res.status(200).json(diag);
  }

  // Normal list mode - get active offers
  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer?marketplace_id=${EBAY_MARKETPLACE_ID}&limit=100`;
    console.log('[eBay:GET] Fetching offers:', url);

    const offerRes = await fetch(url, { method: 'GET', headers });
    
    if (!offerRes.ok) {
      const errText = await offerRes.text();
      const parsed = parseEbayError(errText);
      return res.status(offerRes.status).json({
        success: false,
        error: parsed.summary,
        ebayErrors: parsed.ebayErrors
      });
    }

    const data = await offerRes.json();
    const offers = data.offers || [];

    // Enrich with listing URLs
    const enriched = offers.map(o => ({
      offerId: o.offerId,
      sku: o.sku,
      status: o.status,
      price: o.pricingSummary?.price?.value,
      currency: o.pricingSummary?.price?.currency,
      quantity: o.availableQuantity,
      categoryId: o.categoryId,
      listingId: o.listing?.listingId,
      ebayUrl: o.listing?.listingId ? `https://www.ebay.com/itm/${o.listing.listingId}` : null
    }));

    return res.status(200).json({
      success: true,
      total: enriched.length,
      offers: enriched
    });

  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: POST - Create Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handlePost(headers, body, res) {
  console.log('\n[eBay:POST] ═══════════════════════════════════════════════════════════════');
  console.log('[eBay:POST] CREATE LISTINGS REQUEST');
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Validate environment variables
  // ─────────────────────────────────────────────────────────────────────────
  const envCheck = validateAndLogEnv();
  if (!envCheck.valid) {
    return res.status(400).json({
      success: false,
      error: `Missing required policy IDs: ${envCheck.missing.join(', ')}`,
      hint: 'Set EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID in environment'
    });
  }

  const policies = envCheck.policies;

  // ─────────────────────────────────────────────────────────────────────────
  // Validate request body
  // ─────────────────────────────────────────────────────────────────────────
  const { products } = body || {};

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'products array required',
      hint: 'Send { products: [{ sku, name, price, sizes: [{ size, price, qty }] }] }'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ensure merchant location exists
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:POST] Ensuring merchant location...');
  const locationResult = await ensureMerchantLocation(headers);

  if (!locationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Failed to create/find merchant location',
      details: locationResult.error,
      ebayErrors: locationResult.ebayErrors,
      hint: 'Check EBAY_LOCATION_* environment variables'
    });
  }

  const merchantLocationKey = locationResult.locationKey;
  console.log(`[eBay:POST] ✓ Using merchant location: ${merchantLocationKey}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Process each product and its sizes
  // ─────────────────────────────────────────────────────────────────────────
  const config = { merchantLocationKey, policies };
  const results = {
    created: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    createdOffers: []
  };

  for (const prod of products) {
    // Handle both flat items and items with sizes array
    const sizes = prod.sizes || [{ 
      size: prod.size, 
      price: prod.price, 
      qty: prod.qty || prod.quantity || 1,
      stockxListingId: prod.stockxListingId
    }];

    for (const sizeData of sizes) {
      // Skip items without price
      if (!sizeData.price && !prod.price) {
        console.log(`[eBay:POST] Skipping ${prod.sku || prod.name} size ${sizeData.size}: no price`);
        results.skipped++;
        continue;
      }

      // Build item data from product + size
      const item = {
        sku: prod.sku || prod.styleId || prod.urlKey,
        styleId: prod.styleId,
        name: prod.name || prod.title,
        title: prod.title || prod.name,
        brand: prod.brand,
        image: prod.image || prod.thumbnail,
        images: prod.images,
        colorway: prod.colorway,
        model: prod.model,
        silhouette: prod.silhouette,
        size: sizeData.size,
        price: sizeData.price || prod.price || 100,
        qty: sizeData.qty || sizeData.quantity || 1,
        condition: prod.condition || 'NEW',
        description: prod.description,
        stockxListingId: sizeData.stockxListingId
      };

      console.log(`[eBay:POST] Processing: ${item.name} Size ${item.size} @ $${item.price}`);

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
          categoryId: result.categoryId,
          categoryName: result.categoryName,
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
  console.log('\n[eBay:POST] ═══════════════════════════════════════════════════════════════');
  console.log(`[eBay:POST] RESULTS: ${results.created} created, ${results.failed} failed, ${results.skipped} skipped`);
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════════════\n');

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
      console.log(`[eBay:DELETE] Withdrawing offer: ${offerId}`);
      
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
        console.error(`[eBay:DELETE] ✗ Failed: ${offerId}`, parsed.summary);
      }
    } catch (e) {
      results.failed++;
      results.errors.push({ offerId, error: e.message });
      console.error(`[eBay:DELETE] ✗ Exception: ${offerId}`, e.message);
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

  console.log(`[eBay:PATCH] Updating ${updates.length} listing(s)`);

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

    const updated = responses.filter(x => x.statusCode === 200).length;
    const failed = responses.filter(x => x.statusCode !== 200).length;

    console.log(`[eBay:PATCH] Results: ${updated} updated, ${failed} failed`);

    return res.status(200).json({
      success: true,
      updated,
      failed,
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
