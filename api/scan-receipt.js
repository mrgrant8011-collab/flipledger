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
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  // Find all Style lines
  for (let i = 0; i < lines.length; i++) {
    const styleMatch = lines[i].match(/^Style\s+([A-Z0-9]+-\d{3})$/i);
    if (!styleMatch) continue;
    
    const sku = styleMatch[1].toUpperCase();
    let name = '';
    let price = 0;
    let size = '';
    
    // Look backwards up to 10 lines to find name, price, size
    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      const line = lines[j];
      
      // Size: "Size XX" or "Size 10.5" or "Size 7C"
      if (!size && /^Size\s+/i.test(line)) {
        size = line.replace(/^Size\s+/i, '');
      }
      
      // Price: "$XX.XX $XXX.XX" or "$XX.XX"
      if (!price) {
        const dualPrice = line.match(/^\$(\d+\.\d{2})\s+\$\d+\.\d{2}$/);
        const singlePrice = line.match(/^\$(\d+\.\d{2})$/);
        if (dualPrice) price = parseFloat(dualPrice[1]);
        else if (singlePrice) price = parseFloat(singlePrice[1]);
      }
      
      // Name: Line before price that looks like a product name
      // (contains letters, not a category/color/size line)
      if (!name && price && !line.match(/^\$/) && !line.match(/^Size\s/i) && 
          !line.match(/^(Women|Men|Baby|Toddler|Basketball|Lifestyle|Running)/i) &&
          !line.match(/\// ) && // Skip color lines like "Black/White"
          line.length > 3) {
        name = line.replace(/"/g, '');
      }
    }
    
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
