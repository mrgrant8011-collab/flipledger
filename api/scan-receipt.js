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

CRITICAL: Keep ALL items exactly as they appear. If the same item/size appears 5 times, return it 5 times. Do NOT remove duplicates.

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
      result.items = result.items.map(item => ({
        name: (item.name || 'Nike Product').trim(),
        sku: normalizeSkuCode(item.sku),
        size: normalizeSize(item.size),
        price: parseFloat(item.price) || 0
      })).filter(item => item.sku && item.price > 0);
      
      console.log(`[Parser] Returning ${result.items.length} items (no deduplication)`);
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

CRITICAL RULES:
1. Keep ALL items exactly as they appear on the receipt
2. If the same item appears 5 times, return it 5 times
3. Do NOT deduplicate or remove any items
4. Every line item on the receipt = one item in your response

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

Parse ALL items. Keep every single item, even if identical to another. Do NOT deduplicate.`;
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
