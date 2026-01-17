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

    // If we have OCR text, parse it directly with JavaScript
    if (mode === 'text' && text) {
      console.log(`[Parser] Parsing OCR text with JS parser`);
      const result = parseNikeReceiptJS(text);
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

// JavaScript-based Nike receipt parser using Sale Price as item boundary
function parseNikeReceiptJS(ocrText) {
  const items = [];
  const lines = ocrText.split('\n');
  
  // Count markers for logging
  const styleMatches = ocrText.match(/Style\s+[A-Z0-9]{5,8}-\d{3}/gi) || [];
  const salePriceMatches = ocrText.match(/sale\s*price/gi) || [];
  
  console.log(`[JSParser] styleCount: ${styleMatches.length}`);
  console.log(`[JSParser] salePriceCount: ${salePriceMatches.length}`);
  
  // Find all "Sale Price" line indices
  const salePriceIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (/sale\s*price/i.test(lines[i])) {
      salePriceIndices.push(i);
    }
  }
  
  console.log(`[JSParser] Found ${salePriceIndices.length} Sale Price markers at lines: ${salePriceIndices.join(', ')}`);
  
  // Process each Sale Price block
  for (let blockIdx = 0; blockIdx < salePriceIndices.length; blockIdx++) {
    const salePriceLine = salePriceIndices[blockIdx];
    const nextSalePriceLine = salePriceIndices[blockIdx + 1] || lines.length;
    
    // Search window: from current Sale Price to next Sale Price (or end)
    // Also look backwards for context
    const searchStart = Math.max(0, salePriceLine - 20);
    const searchEnd = nextSalePriceLine;
    
    let price = 0;
    let size = '';
    let sku = '';
    let name = '';
    
    // Find price: look for $XX.XX pattern after "Sale Price" line
    for (let i = salePriceLine; i < Math.min(salePriceLine + 5, lines.length); i++) {
      const priceMatch = lines[i].match(/\$(\d+\.\d{2})/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
        break;
      }
    }
    
    // Find size: look backwards from Sale Price line
    for (let i = salePriceLine - 1; i >= searchStart; i--) {
      const line = lines[i].trim();
      
      // Match various size patterns
      const sizePatterns = [
        /^Size\s+(\d+\.?\d*[CY]?)$/i,           // "Size 11" or "Size 7C" or "Size 5Y"
        /^(\d+\.?\d*[CY])$/,                     // Just "7C" or "5Y"
        /^(\d+\.?\d*)$/,                         // Just "11" or "10.5"
      ];
      
      for (const pattern of sizePatterns) {
        const match = line.match(pattern);
        if (match) {
          size = match[1].toUpperCase();
          break;
        }
      }
      if (size) break;
    }
    
    // Find SKU: look in the block area
    for (let i = searchStart; i < searchEnd; i++) {
      const skuMatch = lines[i].match(/([A-Z0-9]{5,8}-\d{3})/i);
      if (skuMatch) {
        sku = skuMatch[1].toUpperCase();
        break;
      }
    }
    
    // Find name: look for Air Jordan / Nike lines above size
    for (let i = salePriceLine - 1; i >= searchStart; i--) {
      const line = lines[i].trim();
      if (/^(Air Jordan|Nike|Jordan)\s+/i.test(line)) {
        name = line;
        // Check if next line continues the name
        if (i + 1 < salePriceLine) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.match(/^\$/) && !nextLine.match(/^(Size|Style|Sale|Women|Men)/i)) {
            name += ' ' + nextLine;
          }
        }
        name = name.replace(/"/g, '');
        break;
      }
    }
    
    // Create item
    const item = {
      name: name || 'Nike Product',
      sku: sku || 'UNKNOWN',
      size: size || 'UNKNOWN',
      price: price,
      needsReview: !sku || !size || price <= 0
    };
    
    items.push(item);
    console.log(`[JSParser] Item ${blockIdx + 1}: ${item.sku} size ${item.size} @ $${item.price}`);
  }
  
  console.log(`[JSParser] finalItemsCount: ${items.length}`);
  
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
