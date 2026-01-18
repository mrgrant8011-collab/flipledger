import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  // CORS headers
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
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `You are parsing OCR text from a Nike order screenshot. Extract all products.

The text may have OCR errors, duplicate sections (from overlapping image chunks), and messy formatting. Do your best to extract accurate data.

For each item, find:
- Product name (e.g., "Nike Air Pegasus Wave", "Air Jordan 1 Low")
- Style Code/SKU (format: letters + numbers + dash + 3 digits, like BQ9646-002, 553558-611)
- Size (number like 10, 10.5, 11)
- Price - Use the SALE/FINAL price (the lower one they actually paid), NOT the original price

CRITICAL RULES:
1. Each receipt line item = ONE item, even if SKU, size, and price repeat. Do NOT dedupe or merge.
2. If you see "$48.99" and "$110.00" near each other, use $48.99 (the sale price)
3. Look for "Final Price" amounts - those are the correct prices
4. Style codes look like: BQ9646-002, DV3853-001, 553558-161, CU4150-002, FN7344-100

Here is the OCR text:
---
${text}
---

Return ONLY valid JSON:
{
  "items": [
    {"name": "Nike Air Pegasus Wave", "sku": "BQ9646-002", "size": "10", "price": 48.99}
  ],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}

If you cannot find any Nike products, return:
{"error": "invalid", "message": "Could not find Nike products in the text."}`
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
        max_tokens: 4096,
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
                text: `Extract all items from this Nike order screenshot.

CRITICAL:
- Treat EACH receipt line item as separate.
- Do NOT merge, group, or deduplicate.

For each item find: name, style code (SKU), size, and SALE price.

Return JSON:
{
  "items": [{"name": "Product Name", "sku": "XX0000-000", "size": "10", "price": 48.99}],
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
    } catch {
      return res.status(500).json({
        error: 'Failed to parse receipt',
        message: 'Could not extract items. Please try again.'
      });
    }

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({
      error: 'Scan failed',
      message: error.message
    });
  }
}
