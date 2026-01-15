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
              text: `This is a Nike order screenshot. Extract ALL products carefully and accurately.

For each UNIQUE item, find:
- Product name (e.g., Air Jordan 1 Low, Nike Air Max 270, Dunk Low)
- Style Code (e.g., DC0774-101, AH8050-005) - format: letters + numbers + dash + 3 digits
- Size (e.g., 6, 10.5, 11)
- Price - IMPORTANT: Use the SALE price (the lower price, usually in bold or the price they actually paid). Ignore crossed-out/strikethrough original prices.

CRITICAL ACCURACY RULES:
1. Count each item ONCE only - do not duplicate
2. If you see a price like "$48.99 $120.00" - use $48.99 (the sale price)
3. If you see a price like "$83.99 $170.00" - use $83.99 (the sale price)
4. The TOTAL at the bottom of the receipt should roughly match your item prices added up
5. Look at the Subtotal/Total shown - use it to verify your count is correct
6. Each row with a shoe image = ONE item

Return JSON format:
{
  "items": [
    {"name": "Product Name", "sku": "XX0000-000", "size": "10", "price": 48.99}
  ],
  "orderDate": "",
  "orderNumber": "",
  "subtotal": 0,
  "tax": 0,
  "total": 0
}

VERIFY YOUR WORK:
- Add up all your item prices - does it match or come close to the subtotal shown?
- Count your items - does it seem right for what you see in the image?
- Double-check you used SALE prices, not original prices

Only return error if you truly cannot see ANY products:
{"error": "invalid", "message": "Could not find Nike products. Please use a Nike App or Nike.com order screenshot."}`
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
