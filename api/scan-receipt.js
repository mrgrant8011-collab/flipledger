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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const anthropic = new Anthropic({ apiKey });

    let response;

    if (mode === 'text' && text) {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: buildNikeParsingPrompt(text)
          }
        ],
      });
    } else {
      let base64Data = image;
      let mediaType = 'image/jpeg';
      
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          mediaType = matches[1];
          base64Data = matches[2];
        }
      }

      response = await anthropic.messages.create({
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
                text: buildNikeParsingPrompt('')
              }
            ],
          }
        ],
      });
    }

    const content = response.content[0].text;
    
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', content);
      return res.status(500).json({ 
        error: 'Failed to parse receipt', 
        message: 'Could not extract items. Please try a clearer screenshot.' 
      });
    }

    if (result.error) {
      return res.status(400).json(result);
    }

    if (result.items && Array.isArray(result.items)) {
      result.items = result.items.map(item => ({
        name: (item.name || 'Nike Product').trim(),
        sku: normalizeSkuCode(item.sku),
        size: normalizeSize(item.size),
        price: parseFloat(item.price) || 0
      })).filter(item => item.sku && item.price > 0);
      
      console.log(`[Parser] Returning ${result.items.length} items (NO deduplication applied)`);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt. Please try again.' 
    });
  }
}

function buildNikeParsingPrompt(ocrText) {
  const basePrompt = `You are a Nike receipt parser for a BULK RESELLER who buys multiple pairs of the SAME shoe.

CRITICAL RULES - READ CAREFULLY:
1. This is a BULK ORDER. The customer bought MULTIPLE PAIRS of the same shoe.
2. If you see "Air Jordan 8 Retro" appearing 4 times in the text, return 4 SEPARATE items.
3. If you see the same SKU (e.g., 305381-100) appearing 6 times, return 6 SEPARATE items.
4. NEVER deduplicate. NEVER combine. NEVER say "appears X times".
5. Each product block in the receipt = ONE item in your JSON array.
6. Count the number of "Style" or "Size" lines - that's how many items there are.

HOW TO COUNT ITEMS:
- Count how many times you see a price like "$87.97" or "$119.97"
- Count how many times you see "Style XXXXXX-XXX"
- Count how many times you see "Size X"
- These counts should match your items array length.

NIKE PRODUCT CATEGORIES:
- Men's shoes: Sizes 7-15
- Women's shoes: Sizes 5-12, often marked with "W" or "(Women's)"
- TD (Toddler): Sizes 4C-10C
- PS (Preschool): Sizes 10.5C-3Y
- GS (Grade School): Sizes 3.5Y-7Y
- Clothing: S, M, L, XL, XXL, 2XL, 3XL

SKU FORMAT: 6-7 alphanumeric characters + dash + 3 digits (e.g., 305381-100, IB2255-100)

PRICE: Use the SALE price (lower price), not the crossed-out original price.

Return ONLY valid JSON in this exact format:
{
  "items": [
    {"name": "Air Jordan 8 Retro White and True Red", "sku": "305381-100", "size": "11", "price": 119.97},
    {"name": "Air Jordan 8 Retro White and True Red", "sku": "305381-100", "size": "11", "price": 119.97},
    {"name": "Air Jordan 8 Retro White and True Red", "sku": "305381-100", "size": "12", "price": 119.97}
  ],
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "orderNumber": "",
  "orderDate": ""
}

Notice in the example above: same shoe, same SKU, appears 3 times = 3 items in array.

If no Nike products found:
{"error": "invalid", "message": "Could not find Nike products."}`;

  if (ocrText && ocrText.trim()) {
    return `${basePrompt}

---
OCR TEXT FROM RECEIPT:
${ocrText}
---

Parse every single item. Remember: this is a BULK order. Same item appearing multiple times = multiple entries in the items array.`;
  }
  
  return `${basePrompt}

Extract ALL items from this Nike receipt image. Remember: this is a BULK order. Same item appearing multiple times = multiple entries in the items array.`;
}

function normalizeSkuCode(sku) {
  if (!sku) return '';
  
  let normalized = String(sku).trim().toUpperCase();
  normalized = normalized.replace(/\s+/g, '').replace(/[-–—]/g, '-');
  
  const match = normalized.match(/^([A-Z0-9]{5,8})-?(\d{3})$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  
  return sku.trim();
}

function normalizeSize(size) {
  if (!size) return '';
  
  let normalized = String(size).trim().toUpperCase();
  normalized = normalized.replace(/^SIZE\s*/i, '');
  
  return normalized;
}
