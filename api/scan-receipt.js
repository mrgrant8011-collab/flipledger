export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, mode } = req.body;
    if (mode !== 'text' || !text) return res.status(400).json({ error: 'Text mode required' });
    return res.status(200).json(parseNikeReceiptJS(text));
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed', message: error.message });
  }
}

function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  // Valid Nike style: Style + 2-8 alphanumeric + dash + 3 digits
  const validStyleRegex = /^\s*Style\s+([A-Z0-9]{2,8}-\d{3})\s*$/i;
  
  // Junk lines
  const junkRegex = /^(shop similar|image|unavailable)$/i;
  
  // Category lines to skip for name
  const categoryRegex = /^(men'?s?|women'?s?|boy'?s?|girl'?s?|baby|toddler|kid'?s?)\s*(shoes|basketball|running|lifestyle)?$/i;
  
  const rejectedStyleLines = [];
  let validStyleCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Track rejected style-like lines
    if (/^Style\s+/i.test(line) && !validStyleRegex.test(line)) {
      rejectedStyleLines.push(`Line ${i}: "${line}"`);
      continue;
    }
    
    // Item boundary = valid Style line only
    const styleMatch = line.match(validStyleRegex);
    if (!styleMatch) continue;
    
    validStyleCount++;
    const sku = styleMatch[1].toUpperCase();
    
    let size = '';
    let price = 0;
    let name = '';
    let priceLineIndex = -1;
    
    // Look ABOVE for size, price
    for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
      const prev = lines[j];
      if (!prev || junkRegex.test(prev)) continue;
      
      // Size
      if (!size && /^Size\s+/i.test(prev)) {
        size = prev.replace(/^Size\s+/i, '').toUpperCase();
      }
      
      // Price
      if (!price && /^\$\d+\.\d{2}/.test(prev)) {
        price = parseFloat(prev.match(/^\$(\d+\.\d{2})/)[1]);
        priceLineIndex = j;
      }
    }
    
    // Name = nearest non-empty, non-junk, non-category line ABOVE price
    if (priceLineIndex > 0) {
      for (let j = priceLineIndex - 1; j >= Math.max(0, priceLineIndex - 5); j--) {
        const n = lines[j];
        if (!n) continue;
        if (junkRegex.test(n)) continue;
        if (categoryRegex.test(n)) continue;
        if (/^\$/.test(n)) continue;
        if (/^Size\s+/i.test(n)) continue;
        if (/^Style\s+/i.test(n)) continue;
        if (/\//.test(n) && n.length < 30) continue; // color lines like "Black/White"
        
        name = n.replace(/^"|"$/g, '').trim();
        break;
      }
    }
    
    const needsReview = !name || !size || !price;
    items.push({ name, sku, size, price, needsReview });
  }
  
  const finalItemsCount = items.length;
  
  // Logs
  console.log(`[Parser] validStyleCount: ${validStyleCount}`);
  console.log(`[Parser] finalItemsCount: ${finalItemsCount}`);
  if (rejectedStyleLines.length > 0) {
    console.log(`[Parser] rejectedStyleLines:`);
    rejectedStyleLines.forEach(r => console.log(`  ${r}`));
  }
  if (finalItemsCount !== validStyleCount) {
    console.error(`[Parser] ERROR: finalItemsCount !== validStyleCount`);
  }
  
  return { items };
}
