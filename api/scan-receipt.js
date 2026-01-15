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
              text: `You are analyzing a receipt/order screenshot. Your job is to extract product information.

FIRST, determine if this is a valid Nike order screenshot:
- Must be from Nike App OR Nike.com order history
- Must show Nike products with Style Codes (format: XX####-### like DC0774-101 or AH8050-005)
- Must show Size and Price for each item
- Paper receipts from Nike Factory/Outlet stores are NOT valid (they don't have style codes)
- Receipts from other stores (Foot Locker, Champs, Dick's, Finish Line, etc.) are NOT valid

If this is NOT a valid Nike digital order, respond with ONLY this JSON:
{"error": "invalid", "message": "REASON_HERE"}

Use these specific messages:
- Other store: "This appears to be from another store. Only Nike App or Nike.com orders are supported."
- Paper receipt: "This looks like a paper receipt. Paper receipts don't include Style Codes. Please use Nike App or Nike.com order history."
- Not Nike: "This doesn't appear to be a Nike order. Please screenshot your order from the Nike App or Nike.com."
- Missing info: "Could not find Style Codes, Sizes, or Prices. Please make sure the full order details are visible."

If this IS a valid Nike digital order, extract ALL items and respond with ONLY this JSON format:
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

IMPORTANT RULES:
1. Extract EVERY item visible - scroll screenshots may have 10+ items
2. Price should be the SALE price (what customer paid), not original/crossed-out price
3. Size must be included - if you can't find size for an item, use empty string ""
4. SKU/Style Code is REQUIRED - format is letters + numbers + dash + 3 numbers (e.g., DC0774-101)
5. If tax is shown, DO NOT add it to individual prices - return it separately
6. Return ONLY valid JSON, no other text
7. orderDate format: YYYY-MM-DD
8. If orderDate or orderNumber not visible, use empty string`
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
