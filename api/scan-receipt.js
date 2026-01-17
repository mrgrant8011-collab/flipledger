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
    const { text, mode } = req.body;
    
    if (mode !== 'text' || !text) {
      return res.status(400).json({ error: 'Text mode required' });
    }

    console.log(`[Parser] Using simple JS parser`);
    const result = parseNikeReceiptJS(text);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ error: 'Scan failed', message: error.message });
  }
}

/**
 * Simple Nike Receipt Parser
 * 
 * Each "Style XXXXXX-XXX" line = 1 item
 * Look backwards from Style line to find: name, price, size
 * 
 * OCR artifact detection: A real item MUST have a price line between Style lines.
 * If no price found between two Style lines, the second is a duplicate.
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  let lastStyleLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const styleMatch = lines[i].match(/^Style\s+([A-Z0-9]+-\d{3})$/i);
    if (!styleMatch) continue;
    
    const sku = styleMatch[1].toUpperCase();
    
    // Look backwards for price, size, name
    let name = '';
    let price = 0;
    let size = '';
    let foundPrice = false;
    
    // Search backwards to previous Style line or start
    const searchStart = Math.max(0, lastStyleLine + 1);
    
    for (let j = i - 1; j >= searchStart; j--) {
      const line = lines[j];
      
      // Size
      if (!size && /^Size\s+/i.test(line)) {
        size = line.replace(/^Size\s+/i, '');
      }
      
      // Price
      if (!price) {
        const dualPrice = line.match(/^\$(\d+\.\d{2})\s+\$\d+\.\d{2}$/);
        const singlePrice = line.match(/^\$(\d+\.\d{2})$/);
        if (dualPrice) {
          price = parseFloat(dualPrice[1]);
          foundPrice = true;
        } else if (singlePrice) {
          price = parseFloat(singlePrice[1]);
          foundPrice = true;
        }
      }
      
      // Name - line before price, not a category/color/etc
      if (!name && foundPrice && !line.match(/^\$/) && !line.match(/^Size\s/i) && 
          !line.match(/^(Women|Men|Baby|Toddler|Basketball|Lifestyle|Running|Shop Similar)/i) &&
          !line.match(/\// ) &&
          !line.match(/^Style\s/i) &&
          !line.match(/^(Grey|Black|White|IMAGE|UNAVAILABLE)$/i) &&
          line.length > 3) {
        name = line.replace(/"/g, '');
      }
    }
    
    // OCR artifact check: if no price found between this Style and last Style, skip it
    if (!foundPrice && lastStyleLine >= 0) {
      console.log(`[JSParser] Skipping OCR artifact: ${sku} at line ${i} (no price since line ${lastStyleLine})`);
      continue;
    }
    
    lastStyleLine = i;
    
    items.push({
      name: name || 'Nike Product',
      sku: sku,
      size: size || 'UNKNOWN',
      price: price,
      needsReview: !size || price <= 0
    });
  }
  
  console.log(`[JSParser] styleCount: ${items.length}`);
  console.log(`[JSParser] finalItemsCount: ${items.length}`);
  
  items.forEach((item, i) => {
    console.log(`[JSParser] Item ${i + 1}: ${item.sku} | ${item.size} | $${item.price} | ${item.name}`);
  });
  
  const orderMatch = ocrText.match(/T\d+[A-Z]+/);
  
  return {
    items,
    subtotal: 0,
    tax: 0,
    total: 0,
    orderNumber: orderMatch ? orderMatch[0] : ''
  };
}
