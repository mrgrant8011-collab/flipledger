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
                text: `Extract ALL items from this Nike order screenshot.

For each item find:
- Product name
- Style code/SKU (format: XX0000-000)
- Size (include W for women's, C for toddler, Y for youth)
- SALE/Final price (the lower price, not crossed-out original)

Return ONLY valid JSON:
{
  "items": [
    {"name": "Product Name", "sku": "XX0000-000", "size": "10", "price": 48.99}
  ],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}

If no Nike products found:
{"error": "invalid", "message": "Could not find Nike products."}`
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
      result.items = postProcessItems(result.items);
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
  return `You are an expert Nike receipt parser. Extract ALL products from this Nike order OCR text.

CRITICAL: This text may come from a VERY LONG receipt (30-40+ items) that was scanned in chunks.
Due to chunking, some items may appear TWICE (duplicated in overlap regions). You MUST deduplicate.

## NIKE PRODUCT CATEGORIES TO RECOGNIZE:

### SHOES:
- Men's shoes: Sizes like 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 15
- Women's shoes: Sizes like 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12
  - Often marked as "(Women's)" or "W" in name
- TD (Toddler): Sizes like 4C, 5C, 6C, 7C, 8C, 9C, 10C
- PS (Preschool): Sizes like 10.5C, 11C, 12C, 13C, 1Y, 2Y, 3Y
- GS (Grade School): Sizes like 3.5Y, 4Y, 5Y, 6Y, 7Y

### CLOTHING:
- Men's clothing: Sizes like S, M, L, XL, XXL, 2XL, 3XL
- Women's clothing: Sizes like XS, S, M, L, XL, 1X, 2X, 3X

## NIKE STYLE CODES (SKU):
Pattern: 6-7 alphanumeric + dash + 3 digits
Examples: BQ9646-002, DV3853-001, 553558-161, CU4150-002

## PRICE EXTRACTION:
- Use the FINAL/SALE price (the lower price after discount)
- If you see "$110.00" crossed out and "$48.99" below it, use $48.99

## DEDUPLICATION RULES:
1. Each unique SKU + Size = ONE item only
2. Same SKU + same size + same price appearing twice = count ONCE
3. Same SKU with DIFFERENT sizes = DIFFERENT items (count each)

Return ONLY valid JSON:
{
  "items": [
    {"name": "Nike Air Pegasus Wave", "sku": "BQ9646-002", "size": "10", "price": 48.99}
  ],
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "orderNumber": "",
  "orderDate": ""
}

If no Nike products found:
{"error": "invalid", "message": "Could not find Nike products in the text."}

---
OCR TEXT:
${ocrText}
---

Parse all items and return JSON. Remember to DEDUPLICATE.`;
}

function postProcessItems(items) {
  const seen = new Map();
  const processed = [];
  
  for (const item of items) {
    const sku = normalizeSkuCode(item.sku);
    const size = normalizeSize(item.size);
    const price = parseFloat(item.price) || 0;
    const name = (item.name || 'Nike Product').trim();
    
    if (!sku || price <= 0) {
      continue;
    }
    
    const key = `${sku}-${size}-${price.toFixed(2)}`;
    
    if (seen.has(key)) {
      console.log(`[Parser] Skipping duplicate: ${key}`);
      continue;
    }
    
    seen.set(key, true);
    
    processed.push({
      name: name,
      sku: sku,
      size: size,
      price: price
    });
  }
  
  console.log(`[Parser] Processed ${processed.length} unique items from ${items.length} raw items`);
  
  return processed;
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
