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
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const anthropic = new Anthropic({ apiKey });

    // Extract base64 data and media type
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
              text: `Extract all Nike products from this order screenshot.

Look for:
- Product names (Air Jordan, Nike Air Max, Dunk, Air Force, etc.)
- Style Codes (format like DC0774-101, AH8050-005, FJ4207-100)
- Sizes (numbers like 6, 10.5, 11, etc.)
- Prices (the sale/paid price, not crossed-out original price)

Return ONLY this JSON format with ALL items found:
{
  "items": [
    {
      "name": "Product Name",
      "sku": "XX0000-000",
      "size": "10",
      "price": 99.99
    }
  ],
  "orderDate": "2026-01-14",
  "orderNumber": "C12345678",
  "subtotal": 199.98,
  "tax": 16.00,
  "total": 215.98
}

RULES:
1. Extract EVERY item - there may be 10, 20, or more items
2. Use the SALE price (lower price), not original/crossed-out price
3. If size not visible for an item, use ""
4. SKU format: letters + numbers + dash + 3 digits (e.g., DC0774-101)
5. If tax shown separately, include it in "tax" field, NOT in item prices
6. If orderDate or orderNumber not visible, use ""
7. Return ONLY valid JSON, no other text

If you cannot find ANY Nike products with style codes, return:
{"error": "invalid", "message": "Could not find Nike products with style codes. Please use a Nike App or Nike.com order screenshot."}`
            }
          ],
        }
      ],
    });

    // Parse Claude's response
    const content = response.content[0].text;
    
    // Try to extract JSON from response
    let result;
    try {
      // Find JSON in response (in case Claude added extra text)
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
        message: 'Could not extract items from image. Please try a clearer screenshot.' 
      });
    }

    // Check if Claude returned an error
    if (result.error) {
      return res.status(400).json(result);
    }

    // Return extracted items
    return res.status(200).json(result);

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt. Please try again.' 
    });
  }
}
