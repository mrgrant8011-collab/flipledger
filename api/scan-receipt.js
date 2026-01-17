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
 * Nike Receipt Parser
 * 
 * Item boundary: Style line /^Style\s+([A-Z0-9]+-\d{3})$/i
 * For each Style line, look back up to 8 lines:
 *   - size: /^Size\s+/i
 *   - price: /^\$\d+\.\d{2}/
 *   - name: line directly above price line
 * Never dedupe.
 */
function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Item boundary = Style line
    const styleMatch = lines[i].match(/^Style\s+([A-Z0-9]+-\d{3})$/i);
    if (!styleMatch) continue;
    
    const sku = styleMatch[1].toUpperCase();
    let size = '';
    let price = 0;
    let name = '';
    let priceLineIndex = -1;
    
    // Look back up to 8 lines for size, price
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const line = lines[j];
      if (!line) continue;
      
      // size: /^Size\s+/i
      if (!size && /^Size\s+/i.test(line)) {
        size = line.replace(/^Size\s+/i, '');
      }
      
      // price: /^\$\d+\.\d{2}/
      if (!price && /^\$\d+\.\d{2}/.test(line)) {
        const m = line.match(/^\$(\d+\.\d{2})/);
        price = parseFloat(m[1]);
        priceLineIndex = j;
      }
    }
    
    // name: line directly above price line
    if (priceLineIndex > 0) {
      name = lines[priceLineIndex - 1] || '';
      name = name.replace(/"/g, '');
    }
    
    items.push({ name: name || 'Nike Product', sku, size, price });
  }
  
  console.log(`[Parser] Found ${items.length} items`);
  return { items };
}
