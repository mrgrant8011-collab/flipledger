import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - v7.0 Production (Fixed Item Specifics)
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Complete fix for eBay listing creation with proper:
 * 1. Dynamic category resolution via Browse API
 * 2. Required aspects fetched via Taxonomy API
 * 3. Smart color/brand/department extraction from product name
 * 4. Validation before API calls
 * 5. Correct inventory item → offer → publish flow
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

const PRICE_MARKUP = 1.00; // No markup - use exact price entered
const LOCATION_KEY = 'flipledger-warehouse';

// ═══════════════════════════════════════════════════════════════════════════════════
// SKU SANITIZATION - eBay requires alphanumeric only, max 50 chars
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Create an eBay-safe SKU from base SKU + size
 * eBay error 25707: Only alphanumeric characters allowed, max 50 chars
 * 
 * CANONICAL SKU FORMAT - Must match client-side implementation in CrossList.jsx
 * 
 * @param {string} baseSku - Original SKU (e.g., "CZ0775-133")
 * @param {string} size - Size (e.g., "9W", "10.5", "M 10 / W 11.5")
 * @returns {string} Sanitized SKU (e.g., "CZ0775133S9W")
 */
function makeEbaySku(baseSku, size) {
  // DEBUG: Log input for troubleshooting
  console.log(`[eBay:SKU] makeEbaySku called: baseSku="${baseSku}", size="${size}"`);
  
  // Uppercase and remove all non-alphanumeric
  const cleanBase = (baseSku || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanSize = (size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Combine with S separator (S is alphanumeric so it's safe)
  let sku = cleanSize ? `${cleanBase}S${cleanSize}` : cleanBase;
  
  // Ensure max 50 chars
  if (sku.length > 50) {
    // Keep first 45 chars + simple hash suffix for uniqueness
    const hash = simpleHash(sku).toString(36).toUpperCase().substring(0, 4);
    sku = sku.substring(0, 45) + hash;
    console.log(`[eBay:SKU] Truncated long SKU to: ${sku}`);
  }
  
  // VALIDATION CHECK: Ensure SKU is truly valid before returning
  const isAlphanumeric = /^[A-Z0-9]+$/.test(sku);
  const isValidLength = sku.length > 0 && sku.length <= 50;
  
  if (!isAlphanumeric || !isValidLength) {
    console.error(`[eBay:SKU] ⚠️ INVALID SKU GENERATED!`);
    console.error(`[eBay:SKU]   Input: baseSku="${baseSku}", size="${size}"`);
    console.error(`[eBay:SKU]   Output: "${sku}" (length=${sku.length})`);
    console.error(`[eBay:SKU]   isAlphanumeric=${isAlphanumeric}, isValidLength=${isValidLength}`);
  } else {
    console.log(`[eBay:SKU] ✓ Valid SKU: "${sku}" (length=${sku.length})`);
  }
  
  return sku;
}

/**
 * Simple hash function for SKU collision avoidance
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Parse an eBay SKU back to base SKU and size
 * @param {string} ebaySku - Sanitized SKU (e.g., "CZ0775133S9W")
 * @returns {object} { baseSku: string, size: string }
 */
function parseEbaySku(ebaySku) {
  if (!ebaySku) return { baseSku: '', size: '' };
  
  const lastS = ebaySku.lastIndexOf('S');
  if (lastS > 0 && lastS < ebaySku.length - 1) {
    return {
      baseSku: ebaySku.substring(0, lastS),
      size: ebaySku.substring(lastS + 1)
    };
  }
  return { baseSku: ebaySku, size: '' };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// COLOR EXTRACTION - Comprehensive color inference from product names
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Known sneaker color mappings - common colorway names to eBay-accepted colors
 */
const COLOR_MAPPINGS = {
  // Standard colors
  'black': 'Black',
  'white': 'White',
  'red': 'Red',
  'blue': 'Blue',
  'green': 'Green',
  'yellow': 'Yellow',
  'orange': 'Orange',
  'purple': 'Purple',
  'pink': 'Pink',
  'brown': 'Brown',
  'gray': 'Gray',
  'grey': 'Gray',
  'navy': 'Blue',
  'beige': 'Beige',
  'cream': 'Beige',
  'tan': 'Tan',
  'gold': 'Gold',
  'silver': 'Silver',
  'bronze': 'Bronze',
  'ivory': 'Ivory',
  'maroon': 'Red',
  'burgundy': 'Red',
  'teal': 'Green',
  'turquoise': 'Blue',
  'coral': 'Orange',
  'salmon': 'Pink',
  'khaki': 'Beige',
  'olive': 'Green',
  'mint': 'Green',
  'lavender': 'Purple',
  'violet': 'Purple',
  'cyan': 'Blue',
  'magenta': 'Pink',
  'indigo': 'Blue',
  
  // Sneaker-specific colorway names
  'bred': 'Black',           // Black/Red
  'royal': 'Blue',           // Royal Blue
  'chicago': 'Red',          // Red/White/Black
  'concord': 'White',        // White/Black/Purple
  'infrared': 'Red',         // Infrared Red
  'fire red': 'Red',
  'university blue': 'Blue',
  'unc': 'Blue',             // UNC Blue
  'georgetown': 'Gray',      // Georgetown Gray
  'cool grey': 'Gray',
  'cement': 'Gray',          // Cement Gray
  'shadow': 'Gray',
  'obsidian': 'Blue',        // Dark Blue
  'midnight navy': 'Blue',
  'midnight': 'Blue',
  'panda': 'Black',          // Black/White
  'reverse panda': 'White',
  'sail': 'White',
  'bone': 'White',
  'phantom': 'Gray',
  'summit white': 'White',
  'triple white': 'White',
  'triple black': 'Black',
  'core black': 'Black',
  'cloud white': 'White',
  'zebra': 'White',
  'beluga': 'Gray',
  'turtle dove': 'Gray',
  'pirate black': 'Black',
  'moonrock': 'Gray',
  'oxford tan': 'Tan',
  'sesame': 'Beige',
  'butter': 'Yellow',
  'cream white': 'White',
  'static': 'White',
  'clay': 'Orange',
  'citrin': 'Yellow',
  'synth': 'Pink',
  'glow': 'Green',
  'yecheil': 'Black',
  'yeezreel': 'Green',
  'carbon': 'Gray',
  'ash': 'Gray',
  'light bone': 'White',
  'muslin': 'Beige',
  'fossil': 'Beige',
  'atmosphere': 'Gray',
  'desert sand': 'Beige',
  'particle': 'Pink',
  'vast grey': 'Gray',
  'wolf grey': 'Gray',
  'photon dust': 'Gray',
  'barely': 'Pink',
  'volt': 'Yellow',
  'electric green': 'Green',
  'hyper royal': 'Blue',
  'dark mocha': 'Brown',
  'travis scott': 'Brown',   // Often brown-based
  'travis': 'Brown',
  'off-white': 'White',
  'off white': 'White',
  'reverse mocha': 'Brown',
  'low mocha': 'Brown',
  'mochas': 'Brown',
  'mocha': 'Brown',
  'baroque brown': 'Brown',
  'cacao': 'Brown',
  'palomino': 'Brown',
  'wheat': 'Brown',
  'flax': 'Brown',
  'denim': 'Blue',
  'washed denim': 'Blue',
  'laser orange': 'Orange',
  'lucky green': 'Green',
  'pine green': 'Green',
  'court purple': 'Purple',
  'metallic': 'Silver',
  'metallic gold': 'Gold',
  'metallic silver': 'Silver',
  'chrome': 'Silver',
  'pewter': 'Gray',
  'multicolor': 'Multicolor',
  'multi': 'Multicolor',
  'multi-color': 'Multicolor',
  'rainbow': 'Multicolor',
  'tie-dye': 'Multicolor',
  'tie dye': 'Multicolor',
  'what the': 'Multicolor',
  
  // Character/Collaboration colorways
  'spider-man': 'Red',
  'spiderman': 'Red',
  'spider-verse': 'Red',
  'spiderverse': 'Red',
  'miles morales': 'Black',
  'batman': 'Black',
  'hulk': 'Green',
  'iron man': 'Red',
  'captain america': 'Blue',
  'thanos': 'Purple',
  'venom': 'Black',
  'carnage': 'Red',
  'deadpool': 'Red',
  'wolverine': 'Yellow',
  'storm': 'White',
  'black panther': 'Black',
  'ghost rider': 'Black',
  
  // Golf/Sport specific
  'black gum': 'Black',
  'gum': 'Brown',
  'gum sole': 'Brown',
  
  // Oxidized/Special
  'oxidized': 'Green',
  'oxidized green': 'Green',
  'patina': 'Green',
  'rust': 'Orange',
  'aged': 'Beige',
};

/**
 * Nike/Jordan SKU color codes - last 3 digits indicate color family
 * Format: XX####-### where last 3 digits = color code
 */
const SKU_COLOR_CODES = {
  '001': 'Black',
  '002': 'White',
  '003': 'Black',
  '010': 'Black',
  '011': 'Black',
  '012': 'Gray',
  '100': 'White',
  '101': 'White',
  '102': 'White',
  '103': 'White',
  '104': 'White',
  '105': 'White',
  '106': 'White',
  '107': 'White',
  '108': 'White',
  '109': 'White',
  '110': 'White',
  '111': 'White',
  '112': 'White',
  '113': 'White',
  '114': 'White',
  '115': 'White',
  '116': 'White',
  '117': 'White',
  '118': 'White',
  '119': 'White',
  '120': 'White',
  '121': 'White',
  '122': 'White',
  '123': 'Beige',
  '124': 'Beige',
  '125': 'Beige',
  '126': 'Gray',
  '140': 'White',
  '141': 'White',
  '200': 'Beige',
  '201': 'Beige',
  '202': 'Brown',
  '203': 'Brown',
  '220': 'Beige',
  '230': 'Brown',
  '300': 'Green',
  '301': 'Green',
  '302': 'Green',
  '303': 'Green',
  '304': 'Green',
  '305': 'Green',
  '310': 'Green',
  '400': 'Blue',
  '401': 'Blue',
  '402': 'Blue',
  '403': 'Blue',
  '404': 'Blue',
  '405': 'Blue',
  '410': 'Blue',
  '411': 'Blue',
  '420': 'Blue',
  '440': 'Blue',
  '500': 'Purple',
  '501': 'Purple',
  '502': 'Purple',
  '503': 'Purple',
  '505': 'Purple',
  '510': 'Purple',
  '600': 'Red',
  '601': 'Red',
  '602': 'Red',
  '603': 'Red',
  '604': 'Red',
  '605': 'Red',
  '606': 'Red',
  '610': 'Red',
  '611': 'Red',
  '612': 'Pink',
  '616': 'Red',
  '660': 'Red',
  '700': 'Yellow',
  '701': 'Yellow',
  '702': 'Yellow',
  '703': 'Orange',
  '710': 'Gold',
  '720': 'Orange',
  '800': 'Orange',
  '801': 'Orange',
  '810': 'Orange',
  '900': 'Gray',
  '901': 'Gray',
  '902': 'Gray',
  '903': 'Gray',
  '904': 'Gray',
  '905': 'Gray',
  '906': 'Gray',
  '910': 'Gray',
  '992': 'Gray',
  '999': 'Multicolor',
};

/**
 * Extract color from Nike/Jordan style code
 * e.g., "DV1753-601" → 601 → Red
 */
function extractColorFromSKU(sku) {
  if (!sku) return null;
  
  // Match pattern: letters/numbers followed by dash and 3 digits
  const match = sku.match(/-(\d{3})$/);
  if (match) {
    const colorCode = match[1];
    if (SKU_COLOR_CODES[colorCode]) {
      console.log(`[Color] Extracted "${SKU_COLOR_CODES[colorCode]}" from SKU color code: ${colorCode}`);
      return SKU_COLOR_CODES[colorCode];
    }
  }
  
  return null;
}

/**
 * Extract color from StockX colorway string
 * StockX format: "Black/White/University Red" or "CORE BLACK/CORE BLACK/GUM"
 */
function extractColorFromColorway(colorway) {
  if (!colorway) return null;
  
  // Take the first color from slash-separated list
  const primaryColor = colorway.split('/')[0].trim().toLowerCase();
  
  // Direct match in our mapping
  if (COLOR_MAPPINGS[primaryColor]) {
    return COLOR_MAPPINGS[primaryColor];
  }
  
  // Check if any known color is contained in the primary color string
  for (const [key, value] of Object.entries(COLOR_MAPPINGS)) {
    if (primaryColor.includes(key)) {
      return value;
    }
  }
  
  // Capitalize first letter as fallback
  return primaryColor.charAt(0).toUpperCase() + primaryColor.slice(1);
}

/**
 * Extract color from product name/title
 * Searches for known color keywords in the product name
 */
function extractColorFromProductName(productName) {
  if (!productName) return null;
  
  const nameLower = productName.toLowerCase();
  
  // Check for exact colorway names first (longer matches)
  const sortedMappings = Object.entries(COLOR_MAPPINGS)
    .sort((a, b) => b[0].length - a[0].length); // Sort by length descending
  
  for (const [key, value] of sortedMappings) {
    // Use word boundary matching for multi-word keys
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(nameLower)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Get color with smart fallback chain:
 * 1. StockX colorway field
 * 2. Explicit color field
 * 3. Extract from product name
 * 4. Extract from SKU color code (Nike/Jordan)
 * 5. Return null (will be handled by validation)
 */
function getColor(item) {
  const productName = item.name || item.title || item.productName || '';
  const sku = item.sku || item.styleId || '';
  
  // 1. Try colorway field
  if (item.colorway) {
    const color = extractColorFromColorway(item.colorway);
    if (color) {
      console.log(`[Color] Extracted "${color}" from colorway: ${item.colorway}`);
      return color;
    }
  }
  
  // 2. Try explicit color field
  if (item.color) {
    const colorValue = Array.isArray(item.color) ? item.color[0] : item.color;
    if (colorValue) {
      const normalized = COLOR_MAPPINGS[colorValue.toLowerCase()] || colorValue;
      console.log(`[Color] Using explicit color field: ${normalized}`);
      return normalized;
    }
  }
  
  // 3. Try to extract from product name
  if (productName) {
    const color = extractColorFromProductName(productName);
    if (color) {
      console.log(`[Color] Extracted "${color}" from product name: ${productName}`);
      return color;
    }
  }
  
  // 4. Try to extract from SKU color code (Nike/Jordan format: XX####-###)
  if (sku) {
    const color = extractColorFromSKU(sku);
    if (color) {
      return color;
    }
  }
  
  // Fallback to Multicolor - listing will publish, user can edit on eBay if needed
  console.log(`[Color] Could not determine color for: ${productName || sku || 'unknown product'} → Using "Multicolor" fallback`);
  return 'Multicolor';
}

// ═══════════════════════════════════════════════════════════════════════════════════
// BRAND EXTRACTION - Infer brand from product name
// ═══════════════════════════════════════════════════════════════════════════════════

const KNOWN_BRANDS = [
  'Nike', 'Air Jordan', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 
  'Converse', 'Vans', 'Puma', 'Reebok', 'ASICS', 'Salomon',
  'Saucony', 'Brooks', 'Hoka', 'On', 'Under Armour', 'Fila',
  'Timberland', 'Dr. Martens', 'Birkenstock', 'Crocs', 'UGG',
  'Balenciaga', 'Gucci', 'Louis Vuitton', 'Dior', 'Prada',
  'Off-White', 'Fear of God', 'Essentials', 'Supreme', 'Stussy',
  'A Bathing Ape', 'BAPE', 'Palace', 'Travis Scott', 'Cactus Jack'
];

/**
 * Extract brand from product name if not provided
 */
function getBrand(item) {
  // Use explicit brand if provided
  if (item.brand && item.brand.trim()) {
    return item.brand.trim();
  }
  
  const productName = (item.name || item.title || item.productName || '').toLowerCase();
  
  // Check for known brands in product name
  for (const brand of KNOWN_BRANDS) {
    if (productName.includes(brand.toLowerCase())) {
      // Special handling for Jordan vs Nike
      if (brand.toLowerCase() === 'jordan' && productName.includes('air jordan')) {
        return 'Jordan';
      }
      if (brand.toLowerCase() === 'jordan' && !productName.includes('jordan')) {
        continue; // Skip if "jordan" is part of another word
      }
      console.log(`[Brand] Extracted "${brand}" from product name`);
      return brand;
    }
  }
  
  // Check for "Yeezy" pattern (Adidas Yeezy)
  if (productName.includes('yeezy')) {
    return 'adidas';
  }
  
  console.log(`[Brand] Could not determine brand, using "Unbranded"`);
  return 'Unbranded';
}

// ═══════════════════════════════════════════════════════════════════════════════════
// EPID LOOKUP HELPERS - Extract data from eBay Browse API results
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Extract multiple images from eBay search result
 * Tries to get different angles, not the same image repeated
 */
function extractMultipleImages(item) {
  const images = [];
  const seenUrls = new Set();

  // Primary image
  if (item.image?.imageUrl) {
    images.push(item.image.imageUrl);
    seenUrls.add(item.image.imageUrl);
  }

  // Additional images
  if (item.additionalImages && Array.isArray(item.additionalImages)) {
    for (const img of item.additionalImages) {
      if (img.imageUrl && !seenUrls.has(img.imageUrl)) {
        images.push(img.imageUrl);
        seenUrls.add(img.imageUrl);
      }
      if (images.length >= 5) break;
    }
  }

  // Thumbnail as fallback
  if (images.length === 0 && item.thumbnailImages?.[0]?.imageUrl) {
    images.push(item.thumbnailImages[0].imageUrl);
  }

  return images;
}

/**
 * Extract brand from eBay listing title
 */
function extractBrandFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  
  if (t.includes('jordan') || t.includes('air jordan')) return 'Jordan';
  if (t.includes('nike') || t.includes('dunk') || t.includes('air force') || t.includes('air max')) return 'Nike';
  if (t.includes('yeezy')) return 'adidas';
  if (t.includes('adidas')) return 'adidas';
  if (t.includes('new balance')) return 'New Balance';
  if (t.includes('converse')) return 'Converse';
  if (t.includes('vans')) return 'Vans';
  if (t.includes('puma')) return 'Puma';
  if (t.includes('reebok')) return 'Reebok';
  if (t.includes('asics')) return 'ASICS';
  if (t.includes('salomon')) return 'Salomon';
  if (t.includes('hoka')) return 'Hoka';
  if (t.includes('on running') || t.includes('on cloud')) return 'On';
  
  return null;
}

/**
 * Extract color from eBay listing title
 */
function extractColorFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  
  // Check for common color keywords
  const colorKeywords = {
    'black': 'Black',
    'white': 'White',
    'red': 'Red',
    'blue': 'Blue',
    'green': 'Green',
    'yellow': 'Yellow',
    'orange': 'Orange',
    'purple': 'Purple',
    'pink': 'Pink',
    'brown': 'Brown',
    'grey': 'Gray',
    'gray': 'Gray',
    'navy': 'Blue',
    'gold': 'Gold',
    'silver': 'Silver',
    'beige': 'Beige',
    'cream': 'Beige',
    'tan': 'Tan',
    // Sneaker colorways
    'chicago': 'Red',
    'bred': 'Black',
    'royal': 'Blue',
    'unc': 'Blue',
    'university blue': 'Blue',
    'obsidian': 'Blue',
    'midnight navy': 'Blue',
    'panda': 'Black',
    'zebra': 'White',
    'mocha': 'Brown',
    'travis': 'Brown',
    'shadow': 'Gray',
    'cool grey': 'Gray',
    'cement': 'Gray'
  };
  
  for (const [keyword, color] of Object.entries(colorKeywords)) {
    if (t.includes(keyword)) {
      return color;
    }
  }
  
  return null;
}

/**
 * Infer department from eBay listing title
 */
function inferDepartmentFromTitle(title) {
  if (!title) return 'Men';
  const t = title.toLowerCase();
  
  if (t.includes("women's") || t.includes('wmns') || t.includes('(w)')) return 'Women';
  if (t.includes("men's") || t.includes('(m)')) return 'Men';
  if (t.includes('(gs)') || t.includes('grade school')) return 'Unisex Kids';
  if (t.includes('(ps)') || t.includes('preschool')) return 'Unisex Kids';
  if (t.includes('(td)') || t.includes('toddler')) return 'Unisex Kids';
  if (t.includes('(y)') || t.includes('youth')) return 'Unisex Kids';
  if (t.includes('kids') || t.includes('boys') || t.includes('girls')) return 'Unisex Kids';
  
  return 'Men';
}

/**
 * Infer silhouette from eBay listing title
 */
function inferSilhouetteFromTitle(title) {
  if (!title) return '';
  const t = title.toLowerCase();
  
  if (t.includes('jordan 1') || t.includes('aj1')) return 'Air Jordan 1';
  if (t.includes('jordan 3') || t.includes('aj3')) return 'Air Jordan 3';
  if (t.includes('jordan 4') || t.includes('aj4')) return 'Air Jordan 4';
  if (t.includes('jordan 5') || t.includes('aj5')) return 'Air Jordan 5';
  if (t.includes('jordan 6') || t.includes('aj6')) return 'Air Jordan 6';
  if (t.includes('jordan 11') || t.includes('aj11')) return 'Air Jordan 11';
  if (t.includes('jordan 12') || t.includes('aj12')) return 'Air Jordan 12';
  if (t.includes('jordan 13') || t.includes('aj13')) return 'Air Jordan 13';
  if (t.includes('dunk low')) return 'Nike Dunk Low';
  if (t.includes('dunk high')) return 'Nike Dunk High';
  if (t.includes('air force 1') || t.includes('af1')) return 'Nike Air Force 1';
  if (t.includes('air max 1')) return 'Nike Air Max 1';
  if (t.includes('air max 90')) return 'Nike Air Max 90';
  if (t.includes('air max 95')) return 'Nike Air Max 95';
  if (t.includes('air max 97')) return 'Nike Air Max 97';
  if (t.includes('yeezy 350') || t.includes('350 v2')) return 'Yeezy Boost 350';
  if (t.includes('yeezy 500')) return 'Yeezy 500';
  if (t.includes('yeezy 700')) return 'Yeezy 700';
  if (t.includes('550')) return 'New Balance 550';
  if (t.includes('990')) return 'New Balance 990';
  if (t.includes('2002r')) return 'New Balance 2002R';
  
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════════════
// SIZE PARSING - Handle various StockX size formats
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Parse size string to extract numeric size and department
 * StockX formats: "10", "10.5", "10W", "10Y", "10C", "10 GS", "Men's 10", "Women's 8"
 */
function convertToUKSize(usSize, department) {
  const size = parseFloat(usSize);
  if (isNaN(size)) return null;
  if (department === 'Women') {
    const map = { 3.5: '1.5', 4: '1.5', 4.5: '2', 5: '2.5', 5.5: '3', 6: '3.5', 6.5: '4', 7: '4.5', 7.5: '5', 8: '5.5', 8.5: '6', 9: '6.5', 9.5: '7', 10: '7.5', 10.5: '8', 11: '8.5', 11.5: '9', 12: '9.5' };
    return map[size] || String(size - 2.5);
  }
  if (department === 'Unisex Kids') {
    const tdMap = { 1: '0.5', 2: '1.5', 3: '2.5', 4: '3.5', 5: '4.5', 6: '5.5', 7: '6.5', 8: '7.5', 9: '8.5', 10: '9.5' };
    if (tdMap[size]) return tdMap[size];
    const lkMap = { 10.5: '10', 11: '10.5', 11.5: '11', 12: '11.5', 12.5: '12', 13: '12.5', 13.5: '13' };
    if (lkMap[size]) return lkMap[size];
    const gsMap = { 1: '13.5', 1.5: '1', 2: '1.5', 2.5: '2', 3: '2.5', 3.5: '3', 4: '3.5', 4.5: '4', 5: '4.5', 5.5: '5', 6: '5.5', 6.5: '6', 7: '6' };
    if (gsMap[size]) return gsMap[size];
    return null;
  }
  const menMap = { 3.5: '3', 4: '3.5', 4.5: '4', 5: '4.5', 5.5: '5', 6: '5.5', 6.5: '6', 7: '6', 7.5: '6.5', 8: '7', 8.5: '7.5', 9: '8', 9.5: '8.5', 10: '9', 10.5: '9.5', 11: '10', 11.5: '10.5', 12: '11', 12.5: '11.5', 13: '12', 14: '13', 15: '14' };
  return menMap[size] || String(size - 1);
}

function convertToEUSize(usSize, department) {
  const size = parseFloat(usSize);
  if (isNaN(size)) return null;
  if (department === 'Women') {
    const map = { 3.5: '33.5', 4: '34.5', 4.5: '35', 5: '35.5', 5.5: '36', 6: '36.5', 6.5: '37.5', 7: '38', 7.5: '38.5', 8: '39', 8.5: '40', 9: '40.5', 9.5: '41', 10: '42', 10.5: '42.5', 11: '43', 11.5: '44', 12: '44.5' };
    return map[size] || String(Math.round(size + 31));
  }
  if (department === 'Unisex Kids') {
    const tdMap = { 1: '16', 2: '17', 3: '18.5', 4: '19.5', 5: '21', 6: '22', 7: '23.5', 8: '25', 9: '26', 10: '27' };
    if (tdMap[size]) return tdMap[size];
    const lkMap = { 10.5: '27.5', 11: '28', 11.5: '28.5', 12: '29.5', 12.5: '30', 13: '31', 13.5: '31.5' };
    if (lkMap[size]) return lkMap[size];
    const gsMap = { 1: '32', 1.5: '33', 2: '33.5', 2.5: '34', 3: '35', 3.5: '35.5', 4: '36', 4.5: '36.5', 5: '37.5', 5.5: '38', 6: '38.5', 6.5: '39', 7: '40' };
    if (gsMap[size]) return gsMap[size];
    return null;
  }
  const menMap = { 3.5: '35.5', 4: '36', 4.5: '36.5', 5: '37.5', 5.5: '38', 6: '38.5', 6.5: '39', 7: '40', 7.5: '40.5', 8: '41', 8.5: '42', 9: '42.5', 9.5: '43', 10: '44', 10.5: '44.5', 11: '45', 11.5: '45.5', 12: '46', 12.5: '47', 13: '47.5', 14: '48.5', 15: '49.5' };
  return menMap[size] || String(Math.round(size + 33));
}
function parseSize(sizeStr) {
  if (!sizeStr) {
    return { numericSize: null, department: 'Men', sizeType: 'US Shoe Size' };
  }
  
  const str = String(sizeStr).trim().toUpperCase();
  
  // Determine department from size notation
  let department = 'Men';
  let sizeType = 'US Shoe Size';
  
  if (str.includes('W') || str.includes('WOMEN') || str.includes("WOMEN'S")) {
    department = 'Women';
    sizeType = "US Shoe Size (Women's)";
  } else if (str.includes('GS') || str.includes('GRADE SCHOOL')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Youth)';
  } else if (str.includes('PS') || str.includes('PRESCHOOL') || str.includes('PRE-SCHOOL')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Kids)';
  } else if (str.includes('TD') || str.includes('TODDLER')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Toddler)';
  } else if (str.includes('C') && !str.includes('10C')) { // C for child, but not 10C pattern
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Kids)';
  } else if (str.includes('Y') || str.includes('YOUTH')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Youth)';
  } else if (str.includes('M') || str.includes('MEN') || str.includes("MEN'S")) {
    department = 'Men';
    sizeType = "US Shoe Size (Men's)";
  }
  
  // Extract numeric size
  const numericMatch = str.match(/[\d]+\.?[\d]*/);
  const numericSize = numericMatch ? numericMatch[0] : null;
  
  // Additional check: very small sizes are likely kids
  if (numericSize && parseFloat(numericSize) < 4 && department === 'Men') {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Kids)';
  }
  
  console.log(`[Size] Parsed "${sizeStr}" → size: ${numericSize}, dept: ${department}`);
  
  return { numericSize, department, sizeType };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// SHOE TYPE DETECTION - Required for footwear categories
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Determine shoe type from product name
 */
function getShoeType(productName, brand) {
  const name = (productName || '').toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  
  // Basketball shoes
  if (name.includes('jordan') || name.includes('lebron') || name.includes('kobe') ||
      name.includes('kyrie') || name.includes('basketball')) {
    return 'Basketball Shoes';
  }
  
  // Running shoes
  if (name.includes('running') || name.includes('ultra boost') || name.includes('ultraboost') ||
      name.includes('pegasus') || name.includes('vapormax') || name.includes('zoom fly') ||
      brandLower.includes('hoka') || brandLower.includes('brooks')) {
    return 'Running Shoes';
  }
  
  // Skateboarding
  if (name.includes('sb ') || name.includes(' sb') || name.includes('skate') ||
      name.includes('dunk') && name.includes('low')) {
    return 'Skateboarding Shoes';
  }
  
  // Boots
  if (name.includes('boot') || name.includes('timberland')) {
    return 'Boots';
  }
  
  // Sandals/Slides
  if (name.includes('slide') || name.includes('sandal') || name.includes('yeezy slide') ||
      name.includes('foam runner')) {
    return 'Sandals';
  }
  
  // Casual/Lifestyle sneakers (default for most sneakers)
  if (name.includes('air force') || name.includes('af1') || name.includes('air max') ||
      name.includes('stan smith') || name.includes('superstar') || name.includes('old skool') ||
      name.includes('chuck taylor') || name.includes('all star')) {
    return 'Athletic Shoes';
  }
  
  // Default to Athletic Shoes for sneaker app
  return 'Athletic Shoes';
}

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
        'Authorization': headers['Authorization'],
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
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
  if (combined.match(/shoe|sneaker|jordan|yeezy|dunk|air max|air force|nike|adidas|new balance|converse|vans|boot|slide|foam runner/)) {
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
    console.log(`[eBay:Taxonomy] Required aspects: ${required.map(a => a.localizedAspectName).join(', ')}`);
    
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
// ASPECT BUILDING - Build complete, validated eBay aspects
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Build eBay product aspects from StockX item data
 * Returns { aspects, missingRequired } for validation
 */
function buildProductAspects(item, categoryAspects) {
  const aspects = {};
  const missingRequired = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Extract all values using smart inference
  // ─────────────────────────────────────────────────────────────────────────
  
  const productName = item.name || item.title || item.productName || '';
  const brand = getBrand(item);
  const color = getColor(item);
  const sizeInfo = parseSize(item.size);
  const shoeType = getShoeType(productName, brand);
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set Brand - REQUIRED
  // ─────────────────────────────────────────────────────────────────────────
  aspects['Brand'] = [brand];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set Size aspects - REQUIRED for footwear
  // ─────────────────────────────────────────────────────────────────────────
  if (sizeInfo.numericSize) {
    aspects['US Shoe Size'] = [sizeInfo.numericSize];
    
    // Add gender-specific size
    if (sizeInfo.sizeType === "US Shoe Size (Men's)") {
      aspects["US Shoe Size (Men's)"] = [sizeInfo.numericSize];
    } else if (sizeInfo.sizeType === "US Shoe Size (Women's)") {
      aspects["US Shoe Size (Women's)"] = [sizeInfo.numericSize];
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set Department - REQUIRED
  // ─────────────────────────────────────────────────────────────────────────
  aspects['Department'] = [sizeInfo.department];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set Color - REQUIRED (most footwear categories)
  // ─────────────────────────────────────────────────────────────────────────
  if (color) {
    aspects['Color'] = [color];
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set Shoe Type/Style - REQUIRED for Athletic Shoes
  // ─────────────────────────────────────────────────────────────────────────
  aspects['Type'] = [shoeType];
  aspects['Style'] = ['Sneaker'];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Set additional aspects
  // ─────────────────────────────────────────────────────────────────────────
  
// Use catalog aspects from EPID lookup (real eBay data)
  const catalog = item.catalogAspects || {};
  
  // Apply all catalog aspects directly
  const catalogFields = [
    'Product Line', 'Model', 'Silhouette', 'Colorway', 'Theme',
    'Upper Material', 'Outsole Material', 'Lining Material', 'Insole Material',
    'Closure', 'Shoe Width', 'UK Shoe Size', 'EU Shoe Size',
    'Performance/Activity', 'Country/Region of Manufacture',
    'Customized', 'Vintage', 'Style'
  ];
  
  for (const field of catalogFields) {
    if (catalog[field]) {
      aspects[field] = [catalog[field]];
    }
  }
  
  // Calculate UK/EU sizes - skip catalog "Varies" values
  const ukFromCatalog = catalog['UK Shoe Size'];
  const euFromCatalog = catalog['EU Shoe Size'];
  if (sizeInfo.numericSize) {
    if (!ukFromCatalog || ukFromCatalog === 'Varies') {
      const ukCalc = convertToUKSize(sizeInfo.numericSize, sizeInfo.department);
      if (ukCalc) aspects['UK Shoe Size'] = [ukCalc];
    }
    if (!euFromCatalog || euFromCatalog === 'Varies') {
      const euCalc = convertToEUSize(sizeInfo.numericSize, sizeInfo.department);
      if (euCalc) aspects['EU Shoe Size'] = [euCalc];
    }
  }
 // Auto-fill specifics - ONLY values we're confident about
  // Boolean/guaranteed fields for new sneakers
  if (!aspects['Vintage']) aspects['Vintage'] = ['No'];
  if (!aspects['Customized']) aspects['Customized'] = ['No'];
  if (!aspects['Signed']) aspects['Signed'] = ['No'];
  if (!aspects['Handmade']) aspects['Handmade'] = ['No'];
  if (!aspects['Personalize']) aspects['Personalize'] = ['No'];
  if (!aspects['Accents']) aspects['Accents'] = ['Logo'];
  if (!aspects['Insole Material']) aspects['Insole Material'] = ['Foam'];
  if (!aspects['Lining Material']) aspects['Lining Material'] = ['Fabric'];
  if (!aspects['Pattern']) aspects['Pattern'] = ['Solid'];
  if (!aspects['Season']) aspects['Season'] = ['Fall', 'Spring', 'Summer', 'Winter'];
  if (!aspects['Features']) aspects['Features'] = ['Comfort'];
  if (!aspects['Occasion']) aspects['Occasion'] = ['Casual'];

  // Only fill these if we can detect from the title
  const nl = productName.toLowerCase();
  if (!aspects['Shoe Shaft Style']) {
    if (nl.includes('high')) aspects['Shoe Shaft Style'] = ['High Top'];
    else if (nl.includes('mid')) aspects['Shoe Shaft Style'] = ['Mid Top'];
    else if (nl.includes('low') || nl.includes('dunk') || nl.includes('air force')) aspects['Shoe Shaft Style'] = ['Low Top'];
    // else skip - don't guess
  }
  if (!aspects['Fabric Type']) {
    if (nl.includes('knit') || nl.includes('flyknit') || nl.includes('primeknit')) aspects['Fabric Type'] = ['Knit'];
    else if (nl.includes('mesh')) aspects['Fabric Type'] = ['Mesh'];
    // else skip - don't guess
  }
  // Fallbacks only for fields the catalog didn't provide
  if (!aspects['Model'] && item.model) {
    aspects['Model'] = [item.model];
  }
  if (!aspects['Silhouette'] && item.silhouette) {
    aspects['Silhouette'] = [item.silhouette];
  }
  if (!aspects['Performance/Activity']) {
    aspects['Performance/Activity'] = ['Casual'];
  }
  if (!aspects['Closure']) {
    aspects['Closure'] = ['Lace Up'];
  }
  if (!aspects['Outsole Material']) {
    aspects['Outsole Material'] = ['Rubber'];
  }
  
  // Style Code - from our data, not catalog
  if (item.styleId || item.styleCode) {
    aspects['Style Code'] = [item.styleId || item.styleCode];
  }
  
  // Colorway - from our data if catalog didn't have it
  if (!aspects['Colorway'] && item.colorway) {
    aspects['Colorway'] = [item.colorway];
  }
  
  // Upper Material - from item if catalog didn't have it
  if (!aspects['Upper Material'] && item.upperMaterial) {
    aspects['Upper Material'] = [item.upperMaterial];
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Validate against required aspects from Taxonomy API
  // ─────────────────────────────────────────────────────────────────────────
  
  if (categoryAspects?.required) {
    for (const reqAspect of categoryAspects.required) {
      const aspectName = reqAspect.name;
      
      // Skip if we have this aspect
      if (aspects[aspectName] && aspects[aspectName][0]) {
        continue;
      }
      
      // Try to provide fallback for known aspects
      switch (aspectName) {
        case 'Brand':
          // Already set above
          break;
        case 'Color':
          if (!aspects['Color']) {
            missingRequired.push({
              aspect: 'Color',
              message: 'Color is required but could not be determined from product data. Please provide colorway or color field.'
            });
          }
          break;
        case 'Department':
          // Already set above
          break;
        case 'US Shoe Size':
        case "US Shoe Size (Men's)":
        case "US Shoe Size (Women's)":
          if (!sizeInfo.numericSize) {
            missingRequired.push({
              aspect: aspectName,
              message: 'Size is required but not provided.'
            });
          }
          break;
        case 'Type':
        case 'Style':
          // Already set above
          break;
        case 'Character':
        case 'Character Family':
          // These are optional for non-character items
          break;
        default:
          // Log but don't block for other aspects
          console.log(`[eBay:Aspects] Missing aspect "${aspectName}" - may cause listing issues`);
      }
    }
  }
  
  // Post-process: split comma-separated values & enforce 65 char limit
  for (const key of Object.keys(aspects)) {
    const expanded = [];
    for (const val of aspects[key]) {
      if (typeof val === 'string' && val.includes(',') && val.length > 65) {
        val.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
          if (v.length <= 65) expanded.push(v);
          else expanded.push(v.substring(0, 65));
        });
      } else if (typeof val === 'string' && val.length > 65) {
        expanded.push(val.substring(0, 65));
      } else {
        expanded.push(val);
      }
    }
    aspects[key] = expanded;
  }
  console.log('[eBay:Aspects] Built aspects:', JSON.stringify(aspects, null, 2));
  
  return { aspects, missingRequired };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ENSURE MERCHANT LOCATION
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Ensures a merchant location exists for the seller
 * Required for creating offers
 */
async function ensureMerchantLocation(headers, userSettings) {
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
    addressLine1: userSettings?.ebay_location_address || process.env.EBAY_LOCATION_ADDRESS || '100 Commerce Street',
    city: userSettings?.ebay_location_city || process.env.EBAY_LOCATION_CITY || 'Los Angeles',
    stateOrProvince: userSettings?.ebay_location_state || process.env.EBAY_LOCATION_STATE || 'CA',
    postalCode: userSettings?.ebay_location_zip || process.env.EBAY_LOCATION_ZIP || '90001',
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
 */
async function createInventoryItem(headers, sku, itemData, aspects) {
  console.log(`[eBay:Inventory] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Inventory] Creating inventory item`);
  console.log(`[eBay:Inventory] SKU: "${sku}" (length=${sku.length})`);
  console.log(`[eBay:Inventory] SKU valid: ${/^[A-Z0-9]+$/.test(sku) && sku.length <= 50 ? 'YES' : 'NO ⚠️'}`);

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
 */
// ═══════════════════════════════════════════════════════════════════════════════════
// PROMOTED LISTINGS - Marketing API
// ═══════════════════════════════════════════════════════════════════════════════════

async function findOrCreateCampaign(headers) {
  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign?campaign_status=RUNNING&limit=10`,
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const cpsCampaign = (data.campaigns || []).find(c =>
        c.fundingStrategy?.fundingModel === 'COST_PER_SALE'
      );
      if (cpsCampaign) {
        console.log(`[eBay:Promo] ✓ Found existing campaign: ${cpsCampaign.campaignId}`);
        return { success: true, campaignId: cpsCampaign.campaignId };
      }
    }

    console.log('[eBay:Promo] Creating new Promoted Listings Standard campaign...');
    const createRes = await fetch(
      `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: `FlipLedger Promo - ${new Date().toISOString().slice(0, 10)}`,
          fundingStrategy: { fundingModel: 'COST_PER_SALE' },
          marketplaceId: 'EBAY_US'
        })
      }
    );

    if (createRes.status === 201 || createRes.status === 200) {
      const location = createRes.headers.get('location') || '';
      const campaignId = location.split('/').pop();
      console.log(`[eBay:Promo] ✓ Created campaign: ${campaignId}`);
      return { success: true, campaignId };
    }

    const err = await createRes.json().catch(() => ({}));
    console.error('[eBay:Promo] Failed to create campaign:', err);
    return { success: false, error: err };
  } catch (e) {
    console.error('[eBay:Promo] Campaign error:', e.message);
    return { success: false, error: e.message };
  }
}

async function promoteListings(headers, listings) {
  if (!listings.length) return { success: true, promoted: 0 };

  const campaignResult = await findOrCreateCampaign(headers);
  if (!campaignResult.success) {
    console.error('[eBay:Promo] No campaign available, skipping promotion');
    return { success: false, error: 'No campaign', promoted: 0 };
  }

  const { campaignId } = campaignResult;

  try {
    const res = await fetch(
      `${EBAY_API_BASE}/sell/marketing/v1/ad_campaign/${campaignId}/bulk_create_ads_by_listing_id`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: listings.map(l => ({
            listingId: l.listingId,
            bidPercentage: String(l.adRate)
          }))
        })
      }
    );

    const data = await res.json().catch(() => ({}));
    const promoted = (data.ads || []).filter(a => a.statusCode === 200 || a.statusCode === 201).length;
    console.log(`[eBay:Promo] ✓ Promoted ${promoted}/${listings.length} listings at campaign ${campaignId}`);
    return { success: true, promoted, campaignId };
  } catch (e) {
    console.error('[eBay:Promo] Bulk add error:', e.message);
    return { success: false, error: e.message, promoted: 0 };
  }
}
async function createOffer(headers, sku, offerData, policies, merchantLocationKey, categoryId) {
  console.log(`[eBay:Offer] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Offer] Creating offer`);
  console.log(`[eBay:Offer] SKU: "${sku}" (length=${sku.length})`);
  console.log(`[eBay:Offer] SKU valid: ${/^[A-Z0-9]+$/.test(sku) && sku.length <= 50 ? 'YES' : 'NO ⚠️'}`);
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
// CREATE SINGLE LISTING - Complete flow with validation
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Creates a single eBay listing using the complete flow:
 * 1. Validate required data before making API calls
 * 2. Resolve category via Browse API
 * 3. Fetch required aspects via Taxonomy API
 * 4. Build and validate aspects
 * 5. Create inventory item with proper aspects
 * 6. Create offer with resolved category
 * 7. Publish offer (optional - skip for draft mode)
 * 
 * @param {boolean} config.publishImmediately - If false, creates draft only
 */
async function createSingleListing(headers, item, config) {
  const { merchantLocationKey, policies, publishImmediately = true } = config;

  // ─────────────────────────────────────────────────────────────────────────
  // Build SKU using sanitized eBay-safe format
  // ─────────────────────────────────────────────────────────────────────────
  const baseSku = item.sku || item.styleId || 'ITEM';
  const size = item.size || '';
  const ebaySku = makeEbaySku(baseSku, size);

  // Build title with size
  const rawTitle = item.name || item.title || 'Item';
  const baseTitle = rawTitle.replace(/\s*Size\s+[\d\.]+[A-Z]?\s*/gi, ' ').replace(/\s+/g, ' ').trim();
 const sizeSuffix = item.size ? ` Size ${item.size}` : '';
  const maxBaseLength = 80 - sizeSuffix.length;
  const title = (baseTitle.substring(0, maxBaseLength) + sizeSuffix).substring(0, 80);

  console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
  console.log(`[eBay:Listing] STARTING LISTING CREATION`);
  console.log(`[eBay:Listing] ────────────────────────────────────────────────────────────`);
  console.log(`[eBay:Listing] Original baseSku: "${baseSku}"`);
  console.log(`[eBay:Listing] Size: "${size}"`);
  console.log(`[eBay:Listing] eBay SKU (sanitized): "${ebaySku}"`);
  console.log(`[eBay:Listing] SKU length: ${ebaySku.length} (max 50)`);
  console.log(`[eBay:Listing] SKU valid chars: ${/^[A-Z0-9]+$/.test(ebaySku) ? 'YES' : 'NO ⚠️'}`);
  console.log(`[eBay:Listing] ────────────────────────────────────────────────────────────`);
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
  // Build and VALIDATE product aspects
  // ─────────────────────────────────────────────────────────────────────────
  const { aspects: productAspects, missingRequired } = buildProductAspects({
    ...item,
    title: title
  }, categoryAspects);

  // Check for missing required aspects BEFORE making API calls
  if (missingRequired.length > 0) {
    console.error(`[eBay:Listing] ✗ VALIDATION FAILED - Missing required aspects`);
    
    // Build helpful error message
    const errorDetails = missingRequired.map(m => `${m.aspect}: ${m.message}`).join('; ');
    
    return {
      success: false,
      step: 'validation',
      sku: ebaySku,
      baseSku,
      size,
      error: `Missing required item specifics: ${errorDetails}`,
      missingAspects: missingRequired,
      hint: 'Ensure product data includes: colorway (or color), size, brand. These fields are required by eBay for footwear listings.'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Create Inventory Item
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:Listing] Step 1: Creating inventory item...');
  
  const invResult = await createInventoryItem(headers, ebaySku, {
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
      sku: ebaySku,
      baseSku,
      size,
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
    ebaySku,
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
      sku: ebaySku,
      baseSku,
      size,
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
      sku: ebaySku,
      baseSku,
      size,
      offerId: offerResult.offerId,
      listingId: offerResult.listingId,
      ebayUrl: offerResult.listingId ? `https://www.ebay.com/itm/${offerResult.listingId}` : null,
      price: offerResult.price,
      categoryId,
      categoryName: categoryInfo.categoryName,
      alreadyExisted: true,
      isDraft: false
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Publish Offer (OPTIONAL - skip for draft mode)
  // ─────────────────────────────────────────────────────────────────────────
  
  // DRAFT MODE (default) - Return success without publishing
  if (!publishImmediately) {
    console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
    console.log(`[eBay:Listing] ✓ DRAFT CREATED!`);
    console.log(`[eBay:Listing] eBay SKU: ${ebaySku}`);
    console.log(`[eBay:Listing] Offer ID: ${offerResult.offerId}`);
    console.log(`[eBay:Listing] Status: UNPUBLISHED (Draft)`);
    console.log(`[eBay:Listing] → User can review/edit in eBay Seller Hub, then publish`);
    console.log(`[eBay:Listing] ════════════════════════════════════════════════════════════\n`);

    return {
      success: true,
      sku: ebaySku,
      baseSku,
      size,
      offerId: offerResult.offerId,
      listingId: null, // No listing ID until published
      ebayUrl: null,
      price: offerResult.price,
      categoryId,
      categoryName: categoryInfo.categoryName,
      isDraft: true,
      message: 'Draft created - review and publish in eBay Seller Hub'
    };
  }

  // PUBLISH MODE - Make listing live immediately
  console.log('[eBay:Listing] Step 3: Publishing offer...');
  
  const publishResult = await publishOffer(headers, offerResult.offerId);

  if (!publishResult.success) {
    console.error(`[eBay:Listing] ✗ FAILED at publish step`);
    return {
      success: false,
      step: 'publish',
      sku: ebaySku,
      baseSku,
      size,
      offerId: offerResult.offerId,
      error: publishResult.error,
      status: publishResult.status,
      ebayErrors: publishResult.ebayErrors
    };
  }

  console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
  console.log(`[eBay:Listing] ✓ PUBLISHED!`);
  console.log(`[eBay:Listing] eBay SKU: ${ebaySku}`);
  console.log(`[eBay:Listing] Listing ID: ${publishResult.listingId}`);
  console.log(`[eBay:Listing] URL: ${publishResult.ebayUrl}`);
  console.log(`[eBay:Listing] ════════════════════════════════════════════════════════════\n`);

  return {
    success: true,
    sku: ebaySku,
    baseSku,
    size,
    offerId: offerResult.offerId,
    listingId: publishResult.listingId,
    ebayUrl: publishResult.ebayUrl,
    price: offerResult.price,
    categoryId,
    categoryName: categoryInfo.categoryName,
    isDraft: false
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: GET - List, Diagnose, or EPID Lookup
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleGet(headers, query, res) {
  // ─────────────────────────────────────────────────────────────────────────
  // EPID Lookup Mode - Search eBay Catalog for product data
  // ─────────────────────────────────────────────────────────────────────────
  if (query.lookup) {
    const searchQuery = query.lookup;
    console.log(`[eBay:GET] EPID Lookup for: ${searchQuery}`);
    
    try {
      // Search eBay Browse API for product
      const searchUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&category_ids=15709&limit=5`;
      
      const searchRes = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          ...headers,
          'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
        }
      });

      if (!searchRes.ok) {
        console.log('[eBay:GET] Browse API search failed:', searchRes.status);
        return res.status(200).json({ found: false, query: searchQuery });
      }

      const searchData = await searchRes.json();
      const items = searchData.itemSummaries || [];
      
      if (items.length === 0) {
        console.log('[eBay:GET] No items found for:', searchQuery);
        return res.status(200).json({ found: false, query: searchQuery });
      }

      // Find best match (prefer items with EPID)
      const bestMatch = items.find(item => item.epid) || items[0];
      // Fetch full item details to get actual item specifics from catalog
      let catalogAspects = {};
      if (bestMatch.itemId) {
        try {
          const itemUrl = `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(bestMatch.itemId)}`;
          const itemRes = await fetch(itemUrl, {
            method: 'GET',
            headers: {
              ...headers,
              'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
            }
          });
          if (itemRes.ok) {
            const itemData = await itemRes.json();
            if (itemData.localizedAspects) {
              for (const aspect of itemData.localizedAspects) {
                catalogAspects[aspect.name] = aspect.value;
              }
              console.log(`[eBay:GET] Pulled ${Object.keys(catalogAspects).length} aspects from catalog:`, Object.keys(catalogAspects).join(', '));
            }
          }
        } catch (e) {
          console.log('[eBay:GET] Could not fetch item details:', e.message);
        }
      }
      
      // Extract data from the match
      const result = {
        found: true,
        query: searchQuery,
        epid: bestMatch.epid || null,
        title: bestMatch.title || null,
        categoryId: bestMatch.categoryId || bestMatch.categories?.[0]?.categoryId || '15709',
        categoryName: bestMatch.categories?.[0]?.categoryName || 'Athletic Shoes',
        // Extract images - try to get multiple angles
        images: extractMultipleImages(bestMatch),
        // Extract item specifics from title/listing
        brand: extractBrandFromTitle(bestMatch.title),
        color: extractColorFromTitle(bestMatch.title),
        colorway: null, // Not usually in browse results
        department: inferDepartmentFromTitle(bestMatch.title),
        silhouette: inferSilhouetteFromTitle(bestMatch.title),
        type: catalogAspects['Type'] || 'Athletic',
        catalogAspects: catalogAspects,
        // Additional info
        price: bestMatch.price?.value || null,
        condition: bestMatch.condition || 'New',
        itemUrl: bestMatch.itemWebUrl || null
      };

      console.log(`[eBay:GET] EPID Lookup result:`, {
        epid: result.epid,
        title: result.title?.substring(0, 50),
        images: result.images?.length || 0
      });

      return res.status(200).json(result);
      
    } catch (e) {
      console.error('[eBay:GET] EPID Lookup error:', e);
      return res.status(200).json({ found: false, query: searchQuery, error: e.message });
    }
  }

  // Debug/diagnose mode
  if (query.debug === '1' || query.diagnose === 'true') {
    const envCheck = validateAndLogEnv();
    const diag = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      tokenTest: {},
      locations: {},
      categoryTest: {},
      colorExtractionTest: {},
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

    // Test color extraction
    diag.colorExtractionTest = {
      'Nike Air Jordan 1 Retro High OG Chicago': getColor({ name: 'Nike Air Jordan 1 Retro High OG Chicago' }),
      'Yeezy Boost 350 V2 Zebra': getColor({ name: 'Yeezy Boost 350 V2 Zebra' }),
      'Nike Dunk Low Panda': getColor({ name: 'Nike Dunk Low Panda' }),
      'colorway: Black/White/University Red': getColor({ colorway: 'Black/White/University Red' }),
      'colorway: CORE BLACK/CORE BLACK': getColor({ colorway: 'CORE BLACK/CORE BLACK' })
    };

    if (locationResult.success && diag.tokenTest.ok) {
      diag.recommendation = 'All systems operational. Ready to create listings.';
    } else if (!locationResult.success) {
      diag.recommendation = 'Failed to create/find merchant location. Check address env vars.';
    }

    return res.status(200).json(diag);
  }

  // Normal list mode - get active offers
  // WORKAROUND: eBay API bug - GET /offer fails if ANY inventory item has invalid SKU
  // Solution: Fetch inventory items first, then get offers per-SKU
  try {
    console.log('[eBay:GET] Fetching inventory items first (workaround for eBay API bug)...');
    
    // Step 1: Get inventory items
    const invUrl = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=100`;
    const invRes = await fetch(invUrl, { method: 'GET', headers });
    
    if (!invRes.ok) {
      const errText = await invRes.text();
      console.error(`[eBay:GET] Inventory fetch failed ${invRes.status}:`, errText.substring(0, 300));
      const parsed = parseEbayError(errText);
      return res.status(invRes.status).json({
        success: false,
        error: parsed.summary,
        ebayErrors: parsed.ebayErrors,
        rawResponse: errText.substring(0, 300)
      });
    }
    
    const invData = await invRes.json();
    const inventoryItems = invData.inventoryItems || [];
    console.log(`[eBay:GET] Found ${inventoryItems.length} inventory items`);
    
    // Step 2: Filter to valid SKUs only (alphanumeric)
    const validSkus = inventoryItems
      .map(item => item.sku)
      .filter(sku => sku && /^[A-Za-z0-9]+$/.test(sku));
    
    console.log(`[eBay:GET] Valid SKUs: ${validSkus.length} of ${inventoryItems.length}`);
    
    // Step 3: Fetch offers for each valid SKU
    const allOffers = [];
    for (const sku of validSkus) {
      try {
        const offerUrl = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;
        const offerRes = await fetch(offerUrl, { method: 'GET', headers });
        
        if (offerRes.ok) {
          const offerData = await offerRes.json();
          if (offerData.offers && offerData.offers.length > 0) {
            allOffers.push(...offerData.offers);
          }
        }
      } catch (e) {
        console.error(`[eBay:GET] Error fetching offers for SKU ${sku}:`, e.message);
      }
    }

    // DEBUG: Log offer count and sample SKUs for sync troubleshooting
    console.log(`[eBay:GET] ═══════════════════════════════════════════════`);
    console.log(`[eBay:GET] Found ${allOffers.length} offers from eBay API`);
    if (allOffers.length > 0) {
      const sampleSkus = allOffers.slice(0, 5).map(o => o.sku);
      console.log(`[eBay:GET] Sample SKUs: ${sampleSkus.join(', ')}`);
    }
    console.log(`[eBay:GET] ═══════════════════════════════════════════════`);

    // Enrich with listing URLs
    const enriched = allOffers.map(o => ({
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

    // Return both 'offers' AND 'listings' for backwards compatibility
    // Client may expect either field name
    return res.status(200).json({
      success: true,
      total: enriched.length,
      offers: enriched,
      listings: enriched  // FIX: Add alias for clients expecting 'listings'
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

async function getUserPolicies(userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('ebay_fulfillment_policy_id, ebay_payment_policy_id, ebay_return_policy_id, ebay_location_address, ebay_location_city, ebay_location_state, ebay_location_zip')
      .eq('user_id', userId)
      .single();
    if (data?.ebay_fulfillment_policy_id) {
      console.log('[eBay:Policies] ✓ Using per-user policies from Supabase');
      return data;
    }
  } catch (e) {
    console.log('[eBay:Policies] No user settings found, using env fallback');
  }
  return null;
}
async function handlePost(headers, body, res) {
  console.log('\n[eBay:POST] ═══════════════════════════════════════════════════════════════');
  console.log('[eBay:POST] CREATE LISTINGS REQUEST');
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════════════\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Validate environment variables
  // ─────────────────────────────────────────────────────────────────────────
  const userSettings = await getUserPolicies(body?.userId);
  
  const policies = {
    EBAY_FULFILLMENT_POLICY_ID: userSettings?.ebay_fulfillment_policy_id || process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: userSettings?.ebay_payment_policy_id || process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: userSettings?.ebay_return_policy_id || process.env.EBAY_RETURN_POLICY_ID?.trim()
  };

  const missingPolicies = Object.entries(policies).filter(([_, v]) => !v).map(([k]) => k);
  if (missingPolicies.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Missing required policy IDs: ${missingPolicies.join(', ')}`,
      hint: 'Connect your eBay account in Settings or set environment variables'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validate request body
  // ─────────────────────────────────────────────────────────────────────────
  const { products, publishImmediately = true } = body || {};

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'products array required',
      hint: 'Send { products: [...], publishImmediately: false }',
      requiredFields: {
        required: ['name', 'price', 'size'],
        stronglyRecommended: ['colorway', 'brand', 'image'],
        optional: ['sku', 'styleId', 'model', 'description', 'condition']
      },
      options: {
        publishImmediately: 'Set to true to publish immediately, false (default) creates drafts'
      }
    });
  }

  console.log(`[eBay:POST] Mode: ${publishImmediately ? 'PUBLISH IMMEDIATELY' : 'DRAFT MODE'}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Ensure merchant location exists
  // ─────────────────────────────────────────────────────────────────────────
  console.log('[eBay:POST] Ensuring merchant location...');
  const locationResult = await ensureMerchantLocation(headers, userSettings);

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
  const config = { merchantLocationKey, policies, publishImmediately };
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
        color: prod.color,
        model: prod.model,
        silhouette: prod.silhouette,
        size: sizeData.size,
        price: sizeData.price || prod.price || 100,
        qty: sizeData.qty || sizeData.quantity || 1,
        condition: prod.condition || 'NEW',
        description: prod.description,
        stockxListingId: sizeData.stockxListingId,
      catalogAspects: prod.catalogAspects
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
          alreadyExisted: result.alreadyExisted || false,
          isDraft: result.isDraft || false
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
          ebayErrors: result.ebayErrors,
          missingAspects: result.missingAspects,
          hint: result.hint
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Return results
  // ─────────────────────────────────────────────────────────────────────────
  const toPromote = [];
  for (const prod of products) {
    if (prod.promoted?.enabled && prod.promoted.adRate) {
      const cleanSku = (prod.sku || prod.styleId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const matchingOffers = results.createdOffers.filter(o => {
        const oClean = (o.baseSku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return oClean === cleanSku && o.listingId;
      });
      matchingOffers.forEach(o => {
        toPromote.push({ listingId: o.listingId, adRate: prod.promoted.adRate });
      });
    }
  }

  if (toPromote.length > 0) {
    console.log(`[eBay:POST] Promoting ${toPromote.length} listings...`);
    const promoResult = await promoteListings(headers, toPromote);
    results.promoted = promoResult.promoted || 0;
    results.promoteCampaignId = promoResult.campaignId || null;
  }
  const draftsCreated = results.createdOffers.filter(o => o.isDraft).length;
  const publishedCreated = results.createdOffers.filter(o => !o.isDraft).length;

  console.log('\n[eBay:POST] ═══════════════════════════════════════════════════════════════');
  console.log(`[eBay:POST] RESULTS: ${results.created} created (${draftsCreated} drafts, ${publishedCreated} published), ${results.failed} failed, ${results.skipped} skipped`);
  console.log('[eBay:POST] ═══════════════════════════════════════════════════════════════\n');

  const success = results.created > 0;

  let message;
  if (!success) {
    message = `Failed to create listings. ${results.errors[0]?.error || 'See errors array for details.'}`;
  } else if (draftsCreated > 0 && publishedCreated === 0) {
    message = `Created ${draftsCreated} draft(s) - review and publish in eBay Seller Hub`;
  } else if (publishedCreated > 0 && draftsCreated === 0) {
    message = `Successfully published ${publishedCreated} listing(s)`;
  } else {
    message = `Created ${draftsCreated} draft(s) and published ${publishedCreated} listing(s)`;
  }

  return res.status(success ? 200 : 400).json({
    success,
    created: results.created,
    drafts: draftsCreated,
    published: publishedCreated,
    failed: results.failed,
    skipped: results.skipped,
    errors: results.errors,
    createdOffers: results.createdOffers,
    message,
    sellerHubUrl: draftsCreated > 0 ? 'https://www.ebay.com/sh/lst/drafts' : null,
    promoted: results.promoted || 0,
    promoteCampaignId: results.promoteCampaignId || null
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HANDLER: DELETE - End Listings
// ═══════════════════════════════════════════════════════════════════════════════════

async function handleDelete(headers, body, res) {
  const { offerIds: rawOfferIds } = body || {};
  const offerIds = [...new Set(rawOfferIds || [])];

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
      console.log(`[eBay:DELETE] Deleting offer: ${offerId}`);
      
      // Step 1: Try to withdraw first (in case it's published)
      await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/withdraw`,
        { method: 'POST', headers }
      );
      
      // Step 2: Actually DELETE the offer
      const r = await fetch(
        `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`,
        { method: 'DELETE', headers }
      );

      if (r.ok || r.status === 204) {
        results.ended++;
        console.log(`[eBay:DELETE] ✓ Deleted: ${offerId}`);
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

  const accessToken = authHeader.replace('Bearer ', '').trim();
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
