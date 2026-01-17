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

/**
 * DETERMINISTIC NIKE RECEIPT PARSER
 * 
 * NO AI structuring. OCR text only.
 * 
 * Item boundary: valid Nike style line
 *   /^\s*Style\s+([A-Z0-9]{2,8}-\d{3})\s*$/i
 * 
 * Junk lines ignored:
 *   "Shop Similar", "IMAGE", "UNAVAILABLE"
 * 
 * For each Style line, look backwards for:
 *   - size: nearest "Size ..." line
 *   - price: nearest "$xx.xx" line above size/style
 *   - name: nearest non-empty, non-junk line above price
 * 
 * NEVER dedupe. Repeats expected.
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  // Valid Nike style pattern: Style XXXXXX-XXX (2-8 alphanumeric + dash + 3 digits)
  const validStyleRegex = /^\s*Style\s+([A-Z0-9]{2,8}-\d{3})\s*$/i;
  
  // Junk lines to ignore
  const junkPatterns = [
    /^Shop Similar$/i,
    /^IMAGE$/i,
    /^UNAVAILABLE$/i
  ];
  
  const isJunk = (line) => junkPatterns.some(p => p.test(line));
  
  // Track rejected style-like lines for debugging
  const rejectedStyles = [];
  let styleCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for style-like lines that don't match valid pattern
    if (/^Style\s+/i.test(line) && !validStyleRegex.test(line)) {
      rejectedStyles.push({ line: i, text: line });
      continue;
    }
    
    // Item boundary = valid Style line
    const styleMatch = line.match(validStyleRegex);
    if (!styleMatch) continue;
    
    styleCount++;
    const sku = styleMatch[1].toUpperCase();
    
    let size = '';
    let price = 0;
    let name = '';
    let priceLineIndex = -1;
    
    // Look backwards up to 10 lines
    for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
      const prevLine = lines[j];
      if (!prevLine || isJunk(prevLine)) continue;
      
      // Size: "Size XX" (supports 7C, 5Y, 10.5, 11, 12, etc)
      if (!size && /^Size\s+/i.test(prevLine)) {
        size = prevLine.replace(/^Size\s+/i, '').toUpperCase();
      }
      
      // Price: "$XX.XX" (first dollar amount on line)
      if (!price && /^\$\d+\.\d{2}/.test(prevLine)) {
        const m = prevLine.match(/^\$(\d+\.\d{2})/);
        price = parseFloat(m[1]);
        priceLineIndex = j;
      }
    }
    
    // Name: non-empty, non-junk line directly above price
    if (priceLineIndex > 0) {
      for (let j = priceLineIndex - 1; j >= Math.max(0, priceLineIndex - 3); j--) {
        const nameLine = lines[j];
        if (nameLine && !isJunk(nameLine) && !/^\$/.test(nameLine) && !/^Size\s+/i.test(nameLine) && !/^Style\s+/i.test(nameLine)) {
          name = nameLine.replace(/^"|"$/g, '').trim();
          break;
        }
      }
    }
    
    const needsReview = !name || !size || !price;
    
    items.push({ name: name || '', sku, size, price, needsReview });
  }
  
  const finalItemsCount = items.length;
  
  // Logging
  console.log(`[Parser] styleCount: ${styleCount}`);
  console.log(`[Parser] finalItemsCount: ${finalItemsCount}`);
  
  if (rejectedStyles.length > 0) {
    console.log(`[Parser] Rejected style-like lines:`);
    rejectedStyles.forEach(r => console.log(`  Line ${r.line}: "${r.text}"`));
  }
  
  if (finalItemsCount !== styleCount) {
    console.warn(`[Parser] WARNING: finalItemsCount (${finalItemsCount}) !== styleCount (${styleCount})`);
  }
  
  return { items };
}
