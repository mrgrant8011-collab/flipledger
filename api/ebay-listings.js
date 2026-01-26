/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * EBAY LISTINGS API - v8.0 Production (SKU Sanitization Fix)
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL FIX: eBay Error 25707 - Invalid SKU
 * eBay ONLY allows alphanumeric characters in SKUs (A-Z, a-z, 0-9), max 50 chars.
 * NO hyphens, underscores, spaces, dots, or special characters allowed.
 * 
 * Changes in v8.0:
 * 1. makeEbaySku() ensures ONLY alphanumeric chars, applied EVERYWHERE
 * 2. Enhanced logging shows raw input → sanitized output for every SKU
 * 3. Failed SKUs are included in error responses for debugging
 * 4. GET handler properly returns offers array
 * 
 * Endpoints:
 *   GET    /api/ebay-listings              - List active eBay offers
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
// SKU SANITIZATION - CRITICAL: eBay requires alphanumeric only, max 50 chars
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * Create an eBay-safe SKU from base SKU + size
 * 
 * eBay Error 25707: "This is an invalid value for a SKU. Only alphanumeric 
 * characters can be used for SKUs, and their length must not exceed 50 characters"
 * 
 * RULES:
 * - Only A-Z, a-z, 0-9 allowed (converted to uppercase)
 * - Max 50 characters
 * - NO hyphens (-), underscores (_), spaces, dots (.), slashes, or any other chars
 * - Use 'S' as separator between base SKU and size (S is alphanumeric)
 * 
 * Examples:
 *   makeEbaySku('CZ0775-133', '9W') → 'CZ0775133S9W'
 *   makeEbaySku('FQ1759-100', '10.5') → 'FQ1759100S105'
 *   makeEbaySku('DD1391-100', '9 GS') → 'DD1391100S9GS'
 * 
 * @param {string} baseSku - Original SKU (e.g., "CZ0775-133")
 * @param {string} size - Size (e.g., "9W", "10.5", "9 GS")
 * @param {string} [channel] - Optional channel prefix (not used, kept for compatibility)
 * @returns {string} Sanitized SKU (e.g., "CZ0775133S9W")
 */
function makeEbaySku(baseSku, size, channel) {
  // Remove ALL non-alphanumeric characters and convert to uppercase
  const cleanBase = (baseSku || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanSize = (size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Combine with 'S' separator (S is alphanumeric, so it's safe)
  // This allows us to parse the SKU back to base+size later
  let sku = cleanSize ? `${cleanBase}S${cleanSize}` : cleanBase;
  
  // Ensure max 50 chars (eBay limit)
  if (sku.length > 50) {
    // Keep first 45 chars + simple hash suffix for uniqueness
    const hash = simpleHash(sku).toString(36).toUpperCase().substring(0, 4);
    sku = sku.substring(0, 45) + hash;
  }
  
  // Log the transformation for debugging
  console.log(`[SKU] makeEbaySku: "${baseSku}" + "${size}" → "${sku}"`);
  
  return sku;
}

/**
 * Simple hash function for SKU collision avoidance when truncating
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
  
  // Find the last 'S' which separates base SKU from size
  const lastS = ebaySku.lastIndexOf('S');
  if (lastS > 0 && lastS < ebaySku.length - 1) {
    return {
      baseSku: ebaySku.substring(0, lastS),
      size: ebaySku.substring(lastS + 1)
    };
  }
  return { baseSku: ebaySku, size: '' };
}

/**
 * Validate that a SKU is eBay-safe
 * @param {string} sku - SKU to validate
 * @returns {object} { valid: boolean, error?: string, sanitized: string }
 */
function validateEbaySku(sku) {
  if (!sku) {
    return { valid: false, error: 'SKU is empty', sanitized: 'ITEM' };
  }
  
  const sanitized = sku.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (sanitized !== sku.toUpperCase()) {
    return { 
      valid: false, 
      error: `SKU contains invalid characters: "${sku}" → "${sanitized}"`,
      sanitized 
    };
  }
  
  if (sku.length > 50) {
    return { 
      valid: false, 
      error: `SKU exceeds 50 characters: ${sku.length}`,
      sanitized: sanitized.substring(0, 50)
    };
  }
  
  return { valid: true, sanitized };
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
  'bred': 'Black',
  'royal': 'Blue',
  'chicago': 'Red',
  'concord': 'White',
  'infrared': 'Red',
  'fire red': 'Red',
  'university blue': 'Blue',
  'unc': 'Blue',
  'georgetown': 'Gray',
  'cool grey': 'Gray',
  'cement': 'Gray',
  'shadow': 'Gray',
  'obsidian': 'Blue',
  'midnight navy': 'Blue',
  'midnight': 'Blue',
  'panda': 'Black',
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
  'travis scott': 'Brown',
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
  'oxidized': 'Green',
  'oxidized green': 'Green',
  'patina': 'Green',
  'rust': 'Orange',
  'aged': 'Beige',
};

/**
 * Nike/Jordan SKU color codes - last 3 digits indicate color family
 */
const SKU_COLOR_CODES = {
  '001': 'Black', '002': 'White', '003': 'Black', '010': 'Black', '011': 'Black',
  '012': 'Gray', '100': 'White', '101': 'White', '102': 'White', '103': 'White',
  '104': 'White', '105': 'White', '106': 'White', '107': 'White', '108': 'White',
  '109': 'White', '110': 'White', '111': 'White', '112': 'White', '113': 'White',
  '114': 'White', '115': 'White', '116': 'White', '117': 'White', '118': 'White',
  '119': 'White', '120': 'White', '121': 'White', '122': 'White', '123': 'Beige',
  '124': 'Beige', '125': 'Beige', '126': 'Gray', '140': 'White', '141': 'White',
  '200': 'Beige', '201': 'Beige', '202': 'Brown', '203': 'Brown', '220': 'Beige',
  '230': 'Brown', '300': 'Green', '301': 'Green', '302': 'Green', '303': 'Green',
  '304': 'Green', '305': 'Green', '310': 'Green', '400': 'Blue', '401': 'Blue',
  '402': 'Blue', '403': 'Blue', '404': 'Blue', '405': 'Blue', '410': 'Blue',
  '411': 'Blue', '420': 'Blue', '440': 'Blue', '500': 'Purple', '501': 'Purple',
  '502': 'Purple', '503': 'Purple', '505': 'Purple', '510': 'Purple', '600': 'Red',
  '601': 'Red', '602': 'Red', '603': 'Red', '604': 'Red', '605': 'Red',
  '606': 'Red', '610': 'Red', '611': 'Red', '612': 'Pink', '616': 'Red',
  '660': 'Red', '700': 'Yellow', '701': 'Yellow', '702': 'Yellow', '703': 'Orange',
  '710': 'Gold', '720': 'Orange', '800': 'Orange', '801': 'Orange', '810': 'Orange',
  '900': 'Gray', '901': 'Gray', '902': 'Gray', '903': 'Gray', '904': 'Gray',
  '905': 'Gray', '906': 'Gray', '910': 'Gray', '992': 'Gray', '999': 'Multicolor',
};

function extractColorFromSKU(sku) {
  if (!sku) return null;
  const match = sku.match(/-(\d{3})$/);
  if (match && SKU_COLOR_CODES[match[1]]) {
    console.log(`[Color] Extracted "${SKU_COLOR_CODES[match[1]]}" from SKU color code: ${match[1]}`);
    return SKU_COLOR_CODES[match[1]];
  }
  return null;
}

function extractColorFromColorway(colorway) {
  if (!colorway) return null;
  const primaryColor = colorway.split('/')[0].trim().toLowerCase();
  if (COLOR_MAPPINGS[primaryColor]) return COLOR_MAPPINGS[primaryColor];
  for (const [key, value] of Object.entries(COLOR_MAPPINGS)) {
    if (primaryColor.includes(key)) return value;
  }
  return primaryColor.charAt(0).toUpperCase() + primaryColor.slice(1);
}

function extractColorFromProductName(productName) {
  if (!productName) return null;
  const nameLower = productName.toLowerCase();
  const sortedMappings = Object.entries(COLOR_MAPPINGS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of sortedMappings) {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(nameLower)) return value;
  }
  return null;
}

function getColor(item) {
  const productName = item.name || item.title || item.productName || '';
  const sku = item.sku || item.styleId || '';
  
  if (item.colorway) {
    const color = extractColorFromColorway(item.colorway);
    if (color) {
      console.log(`[Color] Extracted "${color}" from colorway: ${item.colorway}`);
      return color;
    }
  }
  
  if (item.color) {
    const colorValue = Array.isArray(item.color) ? item.color[0] : item.color;
    if (colorValue) {
      const normalized = COLOR_MAPPINGS[colorValue.toLowerCase()] || colorValue;
      console.log(`[Color] Using explicit color field: ${normalized}`);
      return normalized;
    }
  }
  
  if (productName) {
    const color = extractColorFromProductName(productName);
    if (color) {
      console.log(`[Color] Extracted "${color}" from product name: ${productName}`);
      return color;
    }
  }
  
  if (sku) {
    const color = extractColorFromSKU(sku);
    if (color) return color;
  }
  
  console.log(`[Color] Could not determine color for: ${productName || sku || 'unknown product'} → Using "Multicolor" fallback`);
  return 'Multicolor';
}

// ═══════════════════════════════════════════════════════════════════════════════════
// BRAND EXTRACTION
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

function getBrand(item) {
  if (item.brand && item.brand.trim()) return item.brand.trim();
  
  const productName = (item.name || item.title || item.productName || '').toLowerCase();
  
  for (const brand of KNOWN_BRANDS) {
    if (productName.includes(brand.toLowerCase())) {
      if (brand.toLowerCase() === 'jordan' && productName.includes('air jordan')) return 'Jordan';
      if (brand.toLowerCase() === 'jordan' && !productName.includes('jordan')) continue;
      console.log(`[Brand] Extracted "${brand}" from product name`);
      return brand;
    }
  }
  
  if (productName.includes('yeezy')) return 'adidas';
  
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
// SIZE PARSING
// ═══════════════════════════════════════════════════════════════════════════════════

function parseSize(sizeStr) {
  if (!sizeStr) return { numericSize: null, department: 'Men', sizeType: 'US Shoe Size' };
  
  const str = String(sizeStr).trim().toUpperCase();
  let department = 'Men';
  let sizeType = 'US Shoe Size';
  
  if (str.includes('W') || str.includes('WOMEN') || str.includes("WOMEN'S")) {
    department = 'Women';
    sizeType = "US Shoe Size (Women's)";
  } else if (str.includes('GS') || str.includes('GRADE SCHOOL')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Youth)';
  } else if (str.includes('PS') || str.includes('PRESCHOOL')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Kids)';
  } else if (str.includes('TD') || str.includes('TODDLER')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Toddler)';
  } else if (str.includes('Y') || str.includes('YOUTH')) {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Youth)';
  } else if (str.includes('M') || str.includes('MEN')) {
    department = 'Men';
    sizeType = "US Shoe Size (Men's)";
  }
  
  const numericMatch = str.match(/[\d]+\.?[\d]*/);
  const numericSize = numericMatch ? numericMatch[0] : null;
  
  if (numericSize && parseFloat(numericSize) < 4 && department === 'Men') {
    department = 'Unisex Kids';
    sizeType = 'US Shoe Size (Kids)';
  }
  
  console.log(`[Size] Parsed "${sizeStr}" → size: ${numericSize}, dept: ${department}`);
  return { numericSize, department, sizeType };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// SHOE TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════════

function getShoeType(productName, brand) {
  const name = (productName || '').toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  
  if (name.includes('jordan') || name.includes('lebron') || name.includes('kobe') ||
      name.includes('kyrie') || name.includes('basketball')) {
    return 'Basketball Shoes';
  }
  if (name.includes('running') || name.includes('ultra boost') || name.includes('ultraboost') ||
      name.includes('pegasus') || name.includes('vapormax') || name.includes('zoom fly') ||
      brandLower.includes('hoka') || brandLower.includes('brooks')) {
    return 'Running Shoes';
  }
  if (name.includes('sb ') || name.includes(' sb') || name.includes('skate') ||
      (name.includes('dunk') && name.includes('low'))) {
    return 'Skateboarding Shoes';
  }
  if (name.includes('boot') || name.includes('timberland')) {
    return 'Boots';
  }
  if (name.includes('slide') || name.includes('sandal') || name.includes('yeezy slide') ||
      name.includes('foam runner')) {
    return 'Sandals';
  }
  return 'Athletic Shoes';
}

// ═══════════════════════════════════════════════════════════════════════════════════
// HEADERS
// ═══════════════════════════════════════════════════════════════════════════════════

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
// ERROR PARSING
// ═══════════════════════════════════════════════════════════════════════════════════

function parseEbayError(responseText) {
  try {
    const data = JSON.parse(responseText);
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
// ENV VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════════

function validateAndLogEnv() {
  const envStatus = {
    EBAY_FULFILLMENT_POLICY_ID: !!process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: !!process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: !!process.env.EBAY_RETURN_POLICY_ID?.trim(),
  };

  console.log('[eBay] Environment variables status:', JSON.stringify(envStatus));

  const requiredPolicies = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID?.trim(),
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID?.trim(),
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID?.trim()
  };

  const missing = Object.entries(requiredPolicies).filter(([_, val]) => !val).map(([key]) => key);

  return {
    valid: missing.length === 0,
    missing,
    policies: missing.length === 0 ? requiredPolicies : null,
    envStatus
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// CATEGORY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════════

async function resolveCategoryFromBrowseAPI(headers, productTitle, brand) {
  console.log(`[eBay:Category] Resolving category for: "${productTitle}"`);
  
  try {
    const searchQuery = encodeURIComponent(`${brand || ''} ${productTitle}`.trim().substring(0, 100));
    const url = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=${searchQuery}&limit=5&filter=conditionIds:{1000}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': headers['Authorization'],
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID
      }
    });
    
    if (!res.ok) {
      console.warn('[eBay:Category] Browse API failed:', res.status);
      return null;
    }
    
    const data = await res.json();
    const items = data.itemSummaries || [];
    
    for (const item of items) {
      if (item.categories && item.categories.length > 0) {
        const category = item.categories[0];
        console.log(`[eBay:Category] ✓ Found category: ${category.categoryId} (${category.categoryName})`);
        return { categoryId: category.categoryId, categoryName: category.categoryName };
      }
    }
    return null;
  } catch (e) {
    console.error('[eBay:Category] Browse API exception:', e.message);
    return null;
  }
}

function getFallbackCategory(productTitle, brand) {
  const combined = `${(productTitle || '').toLowerCase()} ${(brand || '').toLowerCase()}`;
  
  if (combined.match(/shoe|sneaker|jordan|yeezy|dunk|air max|air force|nike|adidas|new balance|converse|vans|boot|slide|foam runner/)) {
    return { categoryId: FALLBACK_CATEGORIES.shoes, categoryName: 'Athletic Shoes (Fallback)' };
  }
  if (combined.match(/shirt|hoodie|jacket|pants|shorts|tee|sweatshirt|apparel/)) {
    return { categoryId: FALLBACK_CATEGORIES.apparel, categoryName: 'Clothing (Fallback)' };
  }
  return { categoryId: FALLBACK_CATEGORIES.default, categoryName: 'Athletic Shoes (Default)' };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// TAXONOMY API
// ═══════════════════════════════════════════════════════════════════════════════════

async function getCategoryAspects(headers, categoryId) {
  try {
    const url = `${EBAY_API_BASE}/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': headers['Authorization'],
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    const aspects = data.aspects || [];
    
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
// ASPECT BUILDING
// ═══════════════════════════════════════════════════════════════════════════════════

function buildProductAspects(item, categoryAspects) {
  const aspects = {};
  const missingRequired = [];
  
  const productName = item.name || item.title || item.productName || '';
  const brand = getBrand(item);
  const color = getColor(item);
  const sizeInfo = parseSize(item.size);
  const shoeType = getShoeType(productName, brand);
  
  aspects['Brand'] = [brand];
  
  if (sizeInfo.numericSize) {
    aspects['US Shoe Size'] = [sizeInfo.numericSize];
    if (sizeInfo.sizeType === "US Shoe Size (Men's)") {
      aspects["US Shoe Size (Men's)"] = [sizeInfo.numericSize];
    } else if (sizeInfo.sizeType === "US Shoe Size (Women's)") {
      aspects["US Shoe Size (Women's)"] = [sizeInfo.numericSize];
    }
  }
  
  aspects['Department'] = [sizeInfo.department];
  if (color) aspects['Color'] = [color];
  aspects['Type'] = [shoeType];
  aspects['Style'] = ['Sneaker'];
  
  if (item.model) aspects['Model'] = [item.model];
  if (item.silhouette) aspects['Silhouette'] = [item.silhouette];
  if (item.styleId || item.styleCode) aspects['Style Code'] = [item.styleId || item.styleCode];
  if (item.colorway) aspects['Colorway'] = [item.colorway];
  
  aspects['Performance/Activity'] = ['Casual'];
  aspects['Closure'] = ['Lace Up'];
  aspects['Outsole Material'] = ['Rubber'];
  if (item.upperMaterial) aspects['Upper Material'] = [item.upperMaterial];
  
  if (categoryAspects?.required) {
    for (const reqAspect of categoryAspects.required) {
      const aspectName = reqAspect.name;
      if (aspects[aspectName] && aspects[aspectName][0]) continue;
      
      switch (aspectName) {
        case 'Color':
          if (!aspects['Color']) {
            missingRequired.push({ aspect: 'Color', message: 'Color is required but could not be determined.' });
          }
          break;
        case 'US Shoe Size':
        case "US Shoe Size (Men's)":
        case "US Shoe Size (Women's)":
          if (!sizeInfo.numericSize) {
            missingRequired.push({ aspect: aspectName, message: 'Size is required but not provided.' });
          }
          break;
      }
    }
  }
  
  console.log('[eBay:Aspects] Built aspects:', JSON.stringify(aspects, null, 2));
  return { aspects, missingRequired };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MERCHANT LOCATION
// ═══════════════════════════════════════════════════════════════════════════════════

async function ensureMerchantLocation(headers) {
  console.log('[eBay:Location] Checking for existing merchant locations...');

  try {
    const listUrl = `${EBAY_API_BASE}/sell/inventory/v1/location?limit=100`;
    const listRes = await fetch(listUrl, { method: 'GET', headers });
    const listText = await listRes.text();

    if (listRes.ok) {
      const listData = JSON.parse(listText);
      const locations = listData.locations || [];
      console.log(`[eBay:Location] Found ${locations.length} existing location(s)`);

      if (locations.length > 0) {
        const enabled = locations.find(l => l.merchantLocationStatus === 'ENABLED');
        if (enabled) {
          console.log('[eBay:Location] ✓ Using enabled location:', enabled.merchantLocationKey);
          return { success: true, locationKey: enabled.merchantLocationKey };
        }
        console.log('[eBay:Location] Using first available:', locations[0].merchantLocationKey);
        return { success: true, locationKey: locations[0].merchantLocationKey };
      }
    }
  } catch (e) {
    console.warn('[eBay:Location] List exception:', e.message);
  }

  // Create new location
  console.log('[eBay:Location] No locations found, creating new location...');

  const address = {
    addressLine1: process.env.EBAY_LOCATION_ADDRESS || '100 Commerce Street',
    city: process.env.EBAY_LOCATION_CITY || 'Los Angeles',
    stateOrProvince: process.env.EBAY_LOCATION_STATE || 'CA',
    postalCode: process.env.EBAY_LOCATION_ZIP || '90001',
    country: 'US'
  };

  const locationPayload = {
    location: { address },
    locationTypes: ['WAREHOUSE'],
    name: 'FlipLedger Warehouse',
    merchantLocationStatus: 'ENABLED'
  };

  try {
    const createUrl = `${EBAY_API_BASE}/sell/inventory/v1/location/${LOCATION_KEY}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(locationPayload)
    });

    if (createRes.ok || createRes.status === 204) {
      console.log('[eBay:Location] ✓ Location created:', LOCATION_KEY);
      return { success: true, locationKey: LOCATION_KEY, isNew: true };
    }

    const createText = await createRes.text();
    const parsed = parseEbayError(createText);
    console.error('[eBay:Location] ✗ Create failed:', parsed.summary);

    return { success: false, error: parsed.summary, ebayErrors: parsed.ebayErrors };
  } catch (e) {
    console.error('[eBay:Location] ✗ Create exception:', e.message);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 1: CREATE INVENTORY ITEM (uses sanitized SKU)
// ═══════════════════════════════════════════════════════════════════════════════════

async function createInventoryItem(headers, ebaySku, itemData, aspects) {
  console.log(`[eBay:Inventory] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Inventory] Creating inventory item with SKU: ${ebaySku}`);
  
  // VALIDATE: Ensure SKU is eBay-safe
  const validation = validateEbaySku(ebaySku);
  if (!validation.valid) {
    console.error(`[eBay:Inventory] ✗ INVALID SKU: ${validation.error}`);
    return {
      success: false,
      sku: ebaySku,
      error: `Invalid SKU format: ${validation.error}`,
      hint: 'SKU must be alphanumeric only (A-Z, 0-9), max 50 chars'
    };
  }

  const { title, description, quantity, condition, image, images } = itemData;

  const inventoryItem = {
    availability: {
      shipToLocationAvailability: { quantity: parseInt(quantity) || 1 }
    },
    condition: mapCondition(condition),
    product: {
      title: sanitizeTitle(title).substring(0, 80),
      description: description || generateDescription(itemData),
      aspects: aspects,
      brand: aspects['Brand']?.[0] || 'Unbranded',
      mpn: ebaySku
    }
  };

  const imageUrls = buildImageUrls(image, images);
  if (imageUrls.length > 0) {
    inventoryItem.product.imageUrls = imageUrls;
  }

  console.log('[eBay:Inventory] Payload (SKU in URL):', ebaySku);

  try {
    // CRITICAL: Use encodeURIComponent on the sanitized SKU
    const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(ebaySku)}`;
    console.log('[eBay:Inventory] PUT', url);

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(inventoryItem)
    });

    if (res.ok || res.status === 204) {
      console.log(`[eBay:Inventory] ✓ Inventory item created: ${ebaySku}`);
      return { success: true, sku: ebaySku };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);
    console.error(`[eBay:Inventory] ✗ Failed (${res.status}):`, parsed.summary);
    console.error('[eBay:Inventory] SKU that failed:', ebaySku);

    return {
      success: false,
      sku: ebaySku,
      status: res.status,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors
    };
  } catch (e) {
    console.error(`[eBay:Inventory] ✗ Exception:`, e.message);
    return { success: false, sku: ebaySku, error: e.message };
  }
}

function mapCondition(condition) {
  const c = (condition || 'NEW').toUpperCase();
  const conditionMap = {
    'NEW': 'NEW', 'BRAND NEW': 'NEW', 'NEW WITH BOX': 'NEW', 'NEW WITH TAGS': 'NEW',
    'NEW WITHOUT BOX': 'NEW_OTHER', 'NEW WITHOUT TAGS': 'NEW_OTHER', 'NEW_OTHER': 'NEW_OTHER',
    'NEW_WITH_DEFECTS': 'NEW_WITH_DEFECTS', 'USED': 'USED_EXCELLENT',
    'USED - EXCELLENT': 'USED_EXCELLENT', 'USED_EXCELLENT': 'USED_EXCELLENT',
    'USED - GOOD': 'USED_GOOD', 'USED_GOOD': 'USED_GOOD', 'PRE-OWNED': 'USED_EXCELLENT'
  };
  return conditionMap[c] || 'NEW';
}

function sanitizeTitle(title) {
  if (!title) return 'Item';
  return title.replace(/[<>]/g, '').replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim();
}

function generateDescription(itemData) {
  const parts = [];
  parts.push(`<p><strong>${sanitizeTitle(itemData.title)}</strong></p>`);
  if (itemData.size) parts.push(`<p><strong>Size:</strong> ${itemData.size}</p>`);
  if (itemData.colorway) parts.push(`<p><strong>Colorway:</strong> ${itemData.colorway}</p>`);
  if (itemData.styleId) parts.push(`<p><strong>Style Code:</strong> ${itemData.styleId}</p>`);
  parts.push(`<p>Brand new, 100% authentic. Ships within 1-2 business days.</p>`);
  parts.push(`<p>All items are shipped double-boxed for protection.</p>`);
  return parts.join('\n');
}

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
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    }
  }
  
  return urls.slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 2: CREATE OFFER (uses sanitized SKU)
// ═══════════════════════════════════════════════════════════════════════════════════

async function createOffer(headers, ebaySku, offerData, policies, merchantLocationKey, categoryId) {
  console.log(`[eBay:Offer] ═══════════════════════════════════════════════`);
  console.log(`[eBay:Offer] Creating offer for SKU: ${ebaySku}`);
  
  // VALIDATE: Ensure SKU is eBay-safe
  const validation = validateEbaySku(ebaySku);
  if (!validation.valid) {
    console.error(`[eBay:Offer] ✗ INVALID SKU: ${validation.error}`);
    return {
      success: false,
      sku: ebaySku,
      error: `Invalid SKU format: ${validation.error}`,
      hint: 'SKU must be alphanumeric only (A-Z, 0-9), max 50 chars'
    };
  }

  const { price, quantity, description } = offerData;
  const { EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID } = policies;

  const ebayPrice = Math.ceil(parseFloat(price) * PRICE_MARKUP);

  const offerPayload = {
    sku: ebaySku, // CRITICAL: Use sanitized SKU
    marketplaceId: EBAY_MARKETPLACE_ID,
    format: 'FIXED_PRICE',
    availableQuantity: parseInt(quantity) || 1,
    categoryId: categoryId,
    listingDescription: description || `<p>Brand new, 100% authentic. Ships within 1-2 business days.</p>`,
    pricingSummary: {
      price: { value: String(ebayPrice), currency: 'USD' }
    },
    listingPolicies: {
      fulfillmentPolicyId: EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: EBAY_RETURN_POLICY_ID
    },
    merchantLocationKey: merchantLocationKey
  };

  console.log('[eBay:Offer] Payload SKU:', offerPayload.sku);

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(offerPayload)
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Offer] ✓ Offer created: ${data.offerId}`);
      return { success: true, offerId: data.offerId, sku: ebaySku, price: ebayPrice };
    }

    const errText = await res.text();
    const parsed = parseEbayError(errText);

    // Check if offer already exists
    const alreadyExists = parsed.ebayErrors?.some(e => 
      e.errorId === 25002 || e.errorId === 25001 || 
      String(e.message || '').toLowerCase().includes('already exists')
    );

    if (alreadyExists) {
      console.log(`[eBay:Offer] Offer may already exist, searching for SKU: ${ebaySku}`);
      const existing = await findOfferBySku(headers, ebaySku);
      if (existing) {
        console.log(`[eBay:Offer] ✓ Found existing offer: ${existing.offerId}`);
        return {
          success: true,
          offerId: existing.offerId,
          sku: ebaySku,
          price: ebayPrice,
          alreadyExisted: true,
          status: existing.status,
          listingId: existing.listingId
        };
      }
    }

    console.error(`[eBay:Offer] ✗ Failed (${res.status}):`, parsed.summary);
    console.error('[eBay:Offer] SKU that failed:', ebaySku);

    return {
      success: false,
      sku: ebaySku,
      status: res.status,
      error: parsed.summary,
      ebayErrors: parsed.ebayErrors
    };
  } catch (e) {
    console.error(`[eBay:Offer] ✗ Exception:`, e.message);
    return { success: false, sku: ebaySku, error: e.message };
  }
}

async function findOfferBySku(headers, ebaySku) {
  try {
    // CRITICAL: Use sanitized SKU in query
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(ebaySku)}&marketplace_id=${EBAY_MARKETPLACE_ID}`;
    console.log('[eBay:Offer] Finding offer by SKU:', ebaySku);
    
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

async function publishOffer(headers, offerId) {
  console.log(`[eBay:Publish] Publishing offer: ${offerId}`);

  try {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`;
    const res = await fetch(url, { method: 'POST', headers });

    if (res.ok) {
      const data = await res.json();
      console.log(`[eBay:Publish] ✓ PUBLISHED! Listing ID: ${data.listingId}`);
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
// CREATE SINGLE LISTING - Complete flow with validation
// ═══════════════════════════════════════════════════════════════════════════════════

async function createSingleListing(headers, item, config) {
  const { merchantLocationKey, policies, publishImmediately = true } = config;

  // ─────────────────────────────────────────────────────────────────────────
  // Build SKU using sanitized eBay-safe format
  // CRITICAL: This is the ONLY place where we convert StockX SKU to eBay SKU
  // ─────────────────────────────────────────────────────────────────────────
  const baseSku = item.sku || item.styleId || 'ITEM';
  const size = item.size || '';
  const ebaySku = makeEbaySku(baseSku, size);

  // Build title with size
  const baseTitle = item.name || item.title || 'Item';
  const title = item.size 
    ? `${baseTitle} Size ${item.size}`.substring(0, 80)
    : baseTitle.substring(0, 80);

  console.log(`\n[eBay:Listing] ════════════════════════════════════════════════════════════`);
  console.log(`[eBay:Listing] STARTING LISTING CREATION`);
  console.log(`[eBay:Listing] Raw StockX SKU: "${baseSku}"`);
  console.log(`[eBay:Listing] Raw Size: "${size}"`);
  console.log(`[eBay:Listing] Sanitized eBay SKU: "${ebaySku}"`);
  console.log(`[eBay:Listing] Title: ${title}`);
  console.log(`[eBay:Listing] Price: $${item.price}`);
  console.log(`[eBay:Listing] ════════════════════════════════════════════════════════════\n`);

  // Step 0: Resolve category
  console.log('[eBay:Listing] Step 0: Resolving category...');
  let categoryInfo = await resolveCategoryFromBrowseAPI(headers, baseTitle, item.brand);
  if (!categoryInfo) {
    categoryInfo = getFallbackCategory(baseTitle, item.brand);
  }
  const categoryId = categoryInfo.categoryId;
  console.log(`[eBay:Listing] Using category: ${categoryId} (${categoryInfo.categoryName})`);

  // Step 0b: Fetch required aspects
  const categoryAspects = await getCategoryAspects(headers, categoryId);

  // Build and validate aspects
  const { aspects: productAspects, missingRequired } = buildProductAspects({
    ...item,
    title: title
  }, categoryAspects);

  if (missingRequired.length > 0) {
    console.error(`[eBay:Listing] ✗ VALIDATION FAILED - Missing required aspects`);
    return {
      success: false,
      step: 'validation',
      sku: ebaySku,
      baseSku,
      size,
      error: `Missing required item specifics: ${missingRequired.map(m => m.aspect).join(', ')}`,
      missingAspects: missingRequired,
      hint: 'Ensure product data includes: colorway (or color), size, brand.'
    };
  }

  // Step 1: Create Inventory Item
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

  // Step 2: Create Offer
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
    console.log(`[eBay:Listing] ✓ Offer already published`);
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

  // Step 3: Publish (optional)
  if (!publishImmediately) {
    console.log(`[eBay:Listing] ✓ DRAFT CREATED! eBay SKU: ${ebaySku}`);
    return {
      success: true,
      sku: ebaySku,
      baseSku,
      size,
      offerId: offerResult.offerId,
      listingId: null,
      ebayUrl: null,
      price: offerResult.price,
      categoryId,
      categoryName: categoryInfo.categoryName,
      isDraft: true,
      message: 'Draft created - review and publish in eBay Seller Hub'
    };
  }

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

  console.log(`[eBay:Listing] ✓ PUBLISHED! eBay SKU: ${ebaySku}, Listing ID: ${publishResult.listingId}`);

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
// HANDLER: GET - List eBay Offers
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
        type: 'Athletic',
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

  // Debug mode
  if (query.debug === '1' || query.diagnose === 'true') {
    const envCheck = validateAndLogEnv();
    const diag = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      tokenTest: {},
      locations: {},
      skuTestExamples: {
        'CZ0775-133 + 9W': makeEbaySku('CZ0775-133', '9W'),
        'FQ1759-100 + 10.5': makeEbaySku('FQ1759-100', '10.5'),
        'DD1391-100 + 9 GS': makeEbaySku('DD1391-100', '9 GS'),
        'HF0012-100 + 11': makeEbaySku('HF0012-100', '11'),
      },
      recommendation: ''
    };

    // Test token
    try {
      const testRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=1`, {
        method: 'GET', headers
      });
      diag.tokenTest = { status: testRes.status, ok: testRes.ok };

      if (!testRes.ok) {
        diag.recommendation = 'Token invalid or expired. Re-authenticate with eBay.';
        return res.status(200).json(diag);
      }
    } catch (e) {
      diag.tokenTest = { error: e.message };
      return res.status(200).json(diag);
    }

    const locationResult = await ensureMerchantLocation(headers);
    diag.locations = locationResult;

    if (locationResult.success && diag.tokenTest.ok) {
      diag.recommendation = 'All systems operational. Ready to create listings.';
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

    // Enrich with listing URLs and parse SKU back to components
    const enriched = offers.map(o => {
      const parsed = parseEbaySku(o.sku || '');
      return {
        offerId: o.offerId,
        sku: o.sku, // The sanitized eBay SKU
        baseSku: parsed.baseSku, // Parsed base SKU (no dashes)
        size: parsed.size, // Parsed size
        status: o.status,
        price: o.pricingSummary?.price?.value,
        currency: o.pricingSummary?.price?.currency,
        quantity: o.availableQuantity,
        categoryId: o.categoryId,
        listingId: o.listing?.listingId,
        ebayUrl: o.listing?.listingId ? `https://www.ebay.com/itm/${o.listing.listingId}` : null
      };
    });

    console.log(`[eBay:GET] Returning ${enriched.length} offers`);

    return res.status(200).json({
      success: true,
      total: enriched.length,
      offers: enriched,
      // Also include as 'listings' for backwards compatibility
      listings: enriched
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

  const envCheck = validateAndLogEnv();
  if (!envCheck.valid) {
    return res.status(400).json({
      success: false,
      error: `Missing required policy IDs: ${envCheck.missing.join(', ')}`,
      hint: 'Set EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID in environment'
    });
  }

  const policies = envCheck.policies;
  const { products, publishImmediately = true } = body || {};

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'products array required',
      hint: 'Send { products: [...], publishImmediately: false }'
    });
  }

  console.log(`[eBay:POST] Mode: ${publishImmediately ? 'PUBLISH IMMEDIATELY' : 'DRAFT MODE'}`);

  const locationResult = await ensureMerchantLocation(headers);
  if (!locationResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Failed to create/find merchant location',
      details: locationResult.error
    });
  }

  const merchantLocationKey = locationResult.locationKey;
  const config = { merchantLocationKey, policies, publishImmediately };
  const results = { created: 0, failed: 0, skipped: 0, errors: [], createdOffers: [], failedSkus: [] };

  for (const prod of products) {
    const sizes = prod.sizes || [{ 
      size: prod.size, 
      price: prod.price, 
      qty: prod.qty || prod.quantity || 1,
      stockxListingId: prod.stockxListingId
    }];

    for (const sizeData of sizes) {
      if (!sizeData.price && !prod.price) {
        console.log(`[eBay:POST] Skipping ${prod.sku || prod.name} size ${sizeData.size}: no price`);
        results.skipped++;
        continue;
      }

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
        stockxListingId: sizeData.stockxListingId
      };

      // Log the raw inputs before processing
      console.log(`[eBay:POST] Processing: "${item.name}" | Raw SKU: "${item.sku}" | Size: "${item.size}" | Price: $${item.price}`);

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
        // Include the eBay SKU that failed for debugging
        const errorInfo = {
          ebaySku: result.sku, // The sanitized SKU that was sent to eBay
          rawSku: item.sku, // The original StockX SKU
          size: result.size,
          step: result.step,
          status: result.status,
          error: result.error,
          ebayErrors: result.ebayErrors,
          missingAspects: result.missingAspects,
          hint: result.hint
        };
        results.errors.push(errorInfo);
        results.failedSkus.push({
          rawSku: item.sku,
          size: item.size,
          ebaySku: result.sku,
          error: result.error
        });
      }
    }
  }

  const draftsCreated = results.createdOffers.filter(o => o.isDraft).length;
  const publishedCreated = results.createdOffers.filter(o => !o.isDraft).length;

  console.log('\n[eBay:POST] ═══════════════════════════════════════════════════════════════');
  console.log(`[eBay:POST] RESULTS: ${results.created} created (${draftsCreated} drafts, ${publishedCreated} published), ${results.failed} failed, ${results.skipped} skipped`);
  if (results.failedSkus.length > 0) {
    console.log('[eBay:POST] FAILED SKUs:', JSON.stringify(results.failedSkus, null, 2));
  }
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
    failedSkus: results.failedSkus, // NEW: Include failed SKUs for debugging
    createdOffers: results.createdOffers,
    message,
    sellerHubUrl: draftsCreated > 0 ? 'https://www.ebay.com/sh/lst/drafts' : null
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

  console.log(`[eBay:PATCH] Updating ${updates.length} listing(s)`);

  // CRITICAL: Ensure SKU is sanitized in update requests
  const requests = updates.map(u => {
    // If the update contains a raw SKU, sanitize it
    const sanitizedSku = u.ebaySku || (u.sku ? makeEbaySku(u.sku, u.size || '') : null);
    
    return {
      sku: sanitizedSku || u.sku,
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
    };
  });

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const query = Object.fromEntries(url.searchParams.entries());

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
