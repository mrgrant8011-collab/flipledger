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
  
  for (let i = 0; i < lines.length; i++) {
    // Find Style line = 1 item
    const styleMatch = lines[i].match(/^Style\s+([A-Z0-9]+-\d{3})$/i);
    if (!styleMatch) continue;
    
    const sku = styleMatch[1].toUpperCase();
    let size = '';
    let price = 0;
    let name = '';
    
    // Look backwards for size, price, name
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const line = lines[j];
      if (!line) continue;
      
      // Size: "Size XX"
      if (!size && /^Size\s+/i.test(line)) {
        size = line.replace(/^Size\s+/i, '');
      }
      
      // Price: "$XX.XX" - grab first number
      if (!price && /^\$\d+\.\d{2}/.test(line)) {
        price = parseFloat(line.match(/^\$(\d+\.\d{2})/)[1]);
        // Name is the line right before price
        if (j > 0 && lines[j-1]) {
          name = lines[j-1].replace(/"/g, '');
        }
      }
    }
    
    items.push({ name: name || 'Nike Product', sku, size, price });
  }
  
  console.log(`[Parser] Found ${items.length} items`);
  return { items };
}
