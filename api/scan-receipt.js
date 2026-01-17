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

    // If we have OCR text, parse it directly with JavaScript (no Claude deduplication)
    if (mode === 'text' && text) {
      console.log(`[Parser] Parsing OCR text directly with JavaScript`);
      const result = parseNikeReceiptJS(text);
      console.log(`[Parser] JS parser found ${result.items.length} items`);
      return res.status(200).json(result);
    }

    // For image-only mode, use Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const anthropic = new Anthropic({ apiKey });

    let base64Data = image;
    let mediaType = 'image/jpeg';
    
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        mediaType = matches[1];
        base64Data = matches[2];
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Extract ALL items from this Nike receipt. Return JSON with items array. Each item needs: name, sku, size, price. Do NOT deduplicate - if same item appears multiple times, list it multiple times.`
            }
          ],
        }
      ],
    });

    const content = response.content[0].text;
    
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      return res.status(500).json({ 
        error: 'Failed to parse receipt', 
        message: 'Could not extract items.' 
      });
    }

    if (result.items && Array.isArray(result.items)) {
      result.items = result.items.map(item => ({
        name: (item.name || 'Nike Product').trim(),
        sku: normalizeSkuCode(item.sku) || 'UNKNOWN',
        size: normalizeSize(item.size) || 'UNKNOWN',
        price: parseFloat(item.price) || 0,
        needsReview: !item.sku || !item.size || !item.price
      }));
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt.' 
    });
  }
}

// JavaScript-based Nike receipt parser - NO DEDUPLICATION
function parseNikeReceiptJS(ocrText) {
  const items = [];
  const lines = ocrText.split('\n');
  
  let currentItem = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect Style line - this marks a new item
    const styleMatch = line.match(/^Style\s+([A-Z0-9]{5,8}-\d{3})$/i);
    if (styleMatch) {
      // Save previous item if exists
      if (currentItem && currentItem.sku) {
        items.push({ ...currentItem });
        console.log(`[JSParser] Added item: ${currentItem.sku} size ${currentItem.size} @ $${currentItem.price}`);
      }
      
      // Start new item
      currentItem = {
        name: '',
        sku: styleMatch[1].toUpperCase(),
        size: '',
        price: 0,
        needsReview: false
      };
      
      // Look backwards for name and price
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const prevLine = lines[j].trim();
        
        // Find product name (Air Jordan, Nike, etc.)
        if (!currentItem.name && /^(Air Jordan|Nike|Jordan)\s+/i.test(prevLine)) {
          // Combine with next line if it continues
          let fullName = prevLine;
          if (j + 1 < i && !lines[j + 1].trim().startsWith('$') && !lines[j + 1].trim().match(/^Style/i)) {
            const nextPart = lines[j + 1].trim();
            if (nextPart && !nextPart.match(/^\d/) && !nextPart.match(/^(Women|Men|Size|Style|\$)/i)) {
              fullName += ' ' + nextPart;
            }
          }
          currentItem.name = fullName.replace(/"/g, '');
        }
        
        // Find price (format: $XX.XX $XXX.XX - first is sale price)
        const priceMatch = prevLine.match(/^\$(\d+\.\d{2})\s+\$\d+\.\d{2}$/);
        if (priceMatch && currentItem.price === 0) {
          currentItem.price = parseFloat(priceMatch[1]);
        }
        
        // Find size
        const sizeMatch = prevLine.match(/^Size\s+(\d+\.?\d*[CY]?)$/i);
        if (sizeMatch && !currentItem.size) {
          currentItem.size = sizeMatch[1].toUpperCase();
        }
      }
      
      continue;
    }
    
    // Also check for size after Style line
    if (currentItem && !currentItem.size) {
      const sizeMatch = line.match(/^Size\s+(\d+\.?\d*[CY]?)$/i);
      if (sizeMatch) {
        currentItem.size = sizeMatch[1].toUpperCase();
      }
    }
  }
  
  // Don't forget the last item
  if (currentItem && currentItem.sku) {
    items.push({ ...currentItem });
    console.log(`[JSParser] Added item: ${currentItem.sku} size ${currentItem.size} @ $${currentItem.price}`);
  }
  
  console.log(`[JSParser] Total items parsed: ${items.length}`);
  
  // Extract order info
  const orderMatch = ocrText.match(/T\d{10,}[A-Z]+/);
  const totalMatch = ocrText.match(/\$[\d,]+\.\d{2}$/m);
  
  return {
    items: items,
    subtotal: 0,
    tax: 0,
    total: totalMatch ? parseFloat(totalMatch[0].replace(/[$,]/g, '')) : 0,
    orderNumber: orderMatch ? orderMatch[0] : '',
    orderDate: ''
  };
}

function normalizeSkuCode(sku) {
  if (!sku) return '';
  let normalized = String(sku).trim().toUpperCase();
  normalized = normalized.replace(/\s+/g, '').replace(/[-–—]/g, '-');
  const match = normalized.match(/^([A-Z0-9]{5,8})-?(\d{3})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return sku.trim();
}

function normalizeSize(size) {
  if (!size) return '';
  let normalized = String(size).trim().toUpperCase();
  normalized = normalized.replace(/^SIZE\s*/i, '');
  return normalized;
}
