import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, text, mode } = req.body;
    
    if (!image && !text) {
      return res.status(400).json({ error: 'No image or text provided' });
    }

    // OCR text provided - parse with deterministic JS parser (NO Claude)
    if (mode === 'text' && text) {
      console.log(`[Parser] Using deterministic JS parser`);
      const result = parseNikeReceiptJS(text);
      return res.status(200).json(result);
    }

    // Image only - just return error, OCR should be done separately
    return res.status(400).json({ 
      error: 'Text mode required', 
      message: 'Please use Google Vision OCR first.' 
    });

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt.' 
    });
  }
}

/**
 * Deterministic JavaScript Nike Receipt Parser
 * 
 * Item boundary: Price lines - either "$XX.XX $XXX.XX" (sale + original) or standalone "$XX.XX"
 * Uses Style lines as secondary boundary to avoid false positives
 * NEVER deduplicates - identical items are valid bulk purchases.
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  // Pattern 1: $XX.XX $XXX.XX (sale price followed by original price)
  const dualPricePattern = /^\$(\d+\.\d{2})\s+\$(\d+\.\d{2})$/;
  
  // Pattern 2: Style line (always indicates an item)
  const stylePattern = /^Style\s+([A-Z0-9]{5,8}-\d{3})$/i;
  
  // Lines to skip when looking for product name
  const skipPatterns = [
    /^\$/, // Price lines
    /^Size\s+/i, // Size lines
    /^Style\s+/i, // Style lines
    /^(Women|Men|Boy|Girl|Baby|Toddler|Kid|Basketball|Lifestyle|Running)/i, // Category lines
    /^(Black|White|Red|Blue|Green|Gold|Silver|Grey|Gray|Pink|Purple|Orange|Yellow|Brown|Sail|Fir|Anthracite)\//i, // Color lines
    /Shoes$/i, // "Men's Shoes", "Women's Shoes"
    /^(Get|Start|Browse)\s+/i, // Action phrases
    /^(Shipping|Return|Help|Order|Profile|Favorites|Settings|Payment|Summary|Subtotal|Total|Need)/i, // Menu/summary items
    /^T\d{10,}/, // Order numbers
    /^\d{4}$/, // Years
    /^In-Store/i,
    /^IMAGE$/i, // "IMAGE UNAVAILABLE"
    /^UNAVAILABLE$/i,
    /^#/, // Order number with #
    /^Outlets/i, // Store address
    /^\d+\s+N\s+/i, // Street addresses
    /^Lehi/i, // City names
    /^AMEX$/i, // Payment methods
    /^\d{4}$/, // 4 digit numbers (card last 4, years)
  ];
  
  // Find ALL Style lines - each Style = 1 item (most reliable)
  const styleLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (stylePattern.test(lines[i])) {
      styleLineIndices.push(i);
    }
  }
  
  // Also find price lines
  const priceLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (dualPricePattern.test(lines[i])) {
      priceLineIndices.push(i);
    }
  }
  
  console.log(`[JSParser] styleCount: ${styleLineIndices.length}`);
  console.log(`[JSParser] priceLineCount: ${priceLineIndices.length}`);
  
  // Use Style lines as the primary item boundary (more reliable than prices)
  const itemCount = styleLineIndices.length;
  
  for (let idx = 0; idx < styleLineIndices.length; idx++) {
    const styleLine = styleLineIndices[idx];
    const prevStyleLine = idx > 0 ? styleLineIndices[idx - 1] : -1;
    const nextStyleLine = styleLineIndices[idx + 1] || lines.length;
    
    // 1. Extract SKU from Style line
    const skuMatch = lines[styleLine].match(stylePattern);
    const sku = skuMatch ? skuMatch[1].toUpperCase() : 'UNKNOWN';
    
    // 2. Find PRICE - look backwards from Style line
    let price = 0;
    for (let i = styleLine - 1; i >= Math.max(0, prevStyleLine + 1); i--) {
      const priceMatch = lines[i].match(dualPricePattern);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
        break;
      }
      // Also try single price pattern for items without crossed-out price
      const singlePriceMatch = lines[i].match(/^\$(\d+\.\d{2})$/);
      if (singlePriceMatch) {
        price = parseFloat(singlePriceMatch[1]);
        break;
      }
    }
    
    // 3. Find SIZE - look backwards from Style line
    let size = '';
    for (let i = styleLine - 1; i >= Math.max(0, prevStyleLine + 1); i--) {
      const sizeMatch = lines[i].match(/^Size\s+(\d+\.?\d*[CY]?)$/i);
      if (sizeMatch) {
        size = sizeMatch[1];
        break;
      }
    }
    
    // 4. Find NAME - look backwards, skip non-name lines
    let name = '';
    let nameParts = [];
    const searchStart = Math.max(0, prevStyleLine + 1);
    
    for (let i = styleLine - 1; i >= searchStart; i--) {
      const line = lines[i];
      if (!line) continue;
      
      // Check if line should be skipped
      let shouldSkip = false;
      for (const pattern of skipPatterns) {
        if (pattern.test(line)) {
          shouldSkip = true;
          break;
        }
      }
      
      if (shouldSkip) continue;
      
      // This looks like a product name line
      nameParts.unshift(line);
      
      // Stop after collecting 2 lines max
      if (nameParts.length >= 2) break;
    }
    
    name = nameParts.join(' ').replace(/"/g, '').trim();
    
    // Create item
    items.push({
      name: name || 'Nike Product',
      sku: sku,
      size: size || 'UNKNOWN',
      price: price,
      needsReview: !sku || sku === 'UNKNOWN' || !size || price <= 0
    });
  }
  
  const finalItemsCount = items.length;
  console.log(`[JSParser] finalItemsCount: ${finalItemsCount}`);
  
  // Verify counts match
  if (finalItemsCount !== itemCount) {
    console.warn(`[JSParser] WARNING: Count mismatch!`);
  } else {
    console.log(`[JSParser] ✓ Counts match: ${finalItemsCount} items`);
  }
  
  // Log each item
  items.forEach((item, i) => {
    console.log(`[JSParser] Item ${i + 1}: ${item.sku} | Size ${item.size} | $${item.price} | ${item.name.substring(0, 40)}`);
  });
  
  // Extract order info
  const orderMatch = ocrText.match(/T\d{10,}[A-Z]+/);
  
  return {
    items: items,
    subtotal: 0,
    tax: 0,
    total: 0,
    orderNumber: orderMatch ? orderMatch[0] : '',
    orderDate: ''
  };
}
