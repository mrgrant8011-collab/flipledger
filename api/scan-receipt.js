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
      // TEXT MODE: OCR text already extracted, just structure it
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `ROLE: You are a receipt line-item transcription engine, not an analyst.

ABSOLUTE RULES:
- NEVER deduplicate
- NEVER merge repeated items
- NEVER infer quantity
- NEVER normalize names
- NEVER collapse identical lines
- NEVER remove lines for any reason
- Repetition is intentional and MUST be preserved

RECEIPT-SPECIFIC CONTEXT:
- Nike outlet/online receipts list quantity by repeating items
- Multiple identical lines = multiple purchased items
- Two lines that look identical are still separate purchases
- Treat each printed line as its own SKU instance

For each item line, extract:
- name: Product name (e.g., "Air Jordan 1 Low", "Nike Air Max 270")
- sku: Style Code (format like DC0774-101, AH8050-005)
- size: Shoe size (e.g., "11", "10.5", "6.5")
- price: The SALE price (the lower price, e.g., $48.99 not $120.00)

OUTPUT RULES:
- One output object per receipt line
- Maintain original order top-to-bottom
- No grouping
- No summaries in items array
- No "quantity" fields - repeat the item instead

Here is the OCR text:
---
${text}
---

Return ONLY valid JSON:
{
  "items": [
    {"name": "Air Jordan 1 Low", "sku": "DC0774-101", "size": "6.5", "price": 48.99},
    {"name": "Air Jordan 1 Low", "sku": "DC0774-101", "size": "11", "price": 48.99},
    {"name": "Air Jordan 1 Low", "sku": "DC0774-101", "size": "8", "price": 48.99}
  ],
  "subtotal": 664.90,
  "tax": 0,
  "total": 664.90
}

CRITICAL: If the same shoe appears 6 times in the text, return 6 separate objects in the items array. DO NOT DEDUPLICATE.

If you cannot find any Nike products, return:
{"error": "invalid", "message": "Could not find Nike products in the text."}`
          }
        ],
      });
    } else {
      // IMAGE MODE: Original image-based scanning (fallback)
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
                text: `Extract all items from this Nike order screenshot. NEVER deduplicate - if an item appears multiple times, list it multiple times.

For each item find: name, style code (SKU), size, and SALE price (lower price, not crossed out).

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

    // Parse Claude's response
    const content = response.content[0].text;
    
    // Try to extract JSON from response
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

    return res.status(200).json(result);

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt. Please try again.' 
    });
  }
}
