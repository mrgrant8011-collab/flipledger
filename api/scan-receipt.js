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
 * Item boundary: Each line matching "$XX.XX $XXX.XX" pattern (sale price + original price)
 * This is how Nike receipts show pricing - sale price first, then crossed-out original.
 * 
 * NEVER deduplicates - identical items are valid bulk purchases.
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  // Pattern: $XX.XX $XXX.XX (sale price followed by original price)
  const dualPricePattern = /^\$(\d+\.\d{2})\s+\$(\d+\.\d{2})$/;
  
  // Find ALL price line indices - each one is exactly 1 item
  const priceLineIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (dualPricePattern.test(lines[i])) {
      priceLineIndices.push(i);
    }
  }
  
  const salePriceCount = priceLineIndices.length;
  console.log(`[JSParser] salePriceCount: ${salePriceCount}`);
  
  // Process each price line - NO DEDUPLICATION
  for (let idx = 0; idx < priceLineIndices.length; idx++) {
    const priceLine = priceLineIndices[idx];
    const nextPriceLine = priceLineIndices[idx + 1] || lines.length;
    
    // 1. Extract PRICE from this line
    const priceMatch = lines[priceLine].match(dualPricePattern);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
    
    // 2. Find SIZE - look after price line first, then before
    let size = '';
    
    // Look after price line (within this item's block)
    for (let i = priceLine + 1; i < Math.min(priceLine + 10, nextPriceLine); i++) {
      const sizeMatch = lines[i].match(/^Size\s+(\d+\.?\d*[CY]?)$/i);
      if (sizeMatch) {
        size = sizeMatch[1];
        break;
      }
    }
    
    // If not found after, look before
    if (!size) {
      for (let i = priceLine - 1; i >= Math.max(0, priceLine - 10); i--) {
        const sizeMatch = lines[i].match(/^Size\s+(\d+\.?\d*[CY]?)$/i);
        if (sizeMatch) {
          size = sizeMatch[1];
          break;
        }
        // Stop if we hit another price line
        if (dualPricePattern.test(lines[i])) break;
      }
    }
    
    // 3. Find STYLE/SKU - look after price line
    let sku = '';
    for (let i = priceLine + 1; i < Math.min(priceLine + 15, nextPriceLine); i++) {
      const skuMatch = lines[i].match(/^Style\s+([A-Z0-9]{5,8}-\d{3})$/i);
      if (skuMatch) {
        sku = skuMatch[1].toUpperCase();
        break;
      }
    }
    
    // 4. Find NAME - look before price line for "Air Jordan" or "Nike"
    let name = '';
    for (let i = priceLine - 1; i >= Math.max(0, priceLine - 8); i--) {
      const line = lines[i];
      if (/^Air Jordan/i.test(line) || /^Nike\s+/i.test(line)) {
        name = line;
        // Include continuation line if present
        if (i + 1 < priceLine && lines[i + 1] && !lines[i + 1].match(/^\$/)) {
          const cont = lines[i + 1];
          if (!cont.match(/^(Size|Style|Women|Men|\$)/i) && cont.length < 25) {
            name += ' ' + cont;
          }
        }
        break;
      }
      // Stop if we hit another price line
      if (dualPricePattern.test(line)) break;
    }
    
    // Create item
    items.push({
      name: name.replace(/"/g, '') || 'Nike Product',
      sku: sku || 'UNKNOWN',
      size: size || 'UNKNOWN',
      price: price,
      needsReview: !sku || !size || price <= 0
    });
  }
  
  const finalItemsCount = items.length;
  console.log(`[JSParser] finalItemsCount: ${finalItemsCount}`);
  
  // Verify counts match
  if (finalItemsCount !== salePriceCount) {
    console.warn(`[JSParser] WARNING: Count mismatch! salePriceCount=${salePriceCount}, finalItemsCount=${finalItemsCount}`);
  } else {
    console.log(`[JSParser] ✓ Counts match: ${finalItemsCount} items`);
  }
  
  // Log each item
  items.forEach((item, i) => {
    console.log(`[JSParser] Item ${i + 1}: ${item.sku} | Size ${item.size} | $${item.price} | ${item.name.substring(0, 30)}`);
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
