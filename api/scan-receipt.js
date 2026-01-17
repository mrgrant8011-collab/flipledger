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

    const result = parseNikeReceiptJS(text);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed', message: error.message });
  }
}

function parseNikeReceiptJS(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim());
  const items = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Find Style line = 1 item
    const styleMatch = lines[i].match(/^Style\s+([A-Z0-9]+-\d{3})$/i);
    if (!styleMatch) continue;
    
    const sku = styleMatch[1].toUpperCase();
    let name = '';
    let size = '';
    let price = 0;
    
    // Look backwards for size, price, name
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const line = lines[j];
      
      if (!size && /^Size\s+/i.test(line)) {
        size = line.replace(/^Size\s+/i, '');
      }
      
      if (!price) {
        const p = line.match(/^\$(\d+\.\d{2})/);
        if (p) price = parseFloat(p[1]);
      }
      
      // Name = first line that's not price/size/category/color
      if (!name && price && 
          !line.match(/^\$/) && 
          !line.match(/^Size/i) && 
          !line.match(/^(Women|Men|Baby|Basketball|Running|Lifestyle)/i) &&
          !line.match(/\//) &&
          line.length > 3) {
        name = line.replace(/"/g, '');
      }
    }
    
    items.push({ name: name || 'Nike Product', sku, size: size || '', price });
  }
  
  console.log(`[Parser] Found ${items.length} items`);
  
  return { items };
}
