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
              text: `This is a Nike order screenshot. Extract ALL products you can see.

For each item, find:
- Product name (e.g., Air Jordan 1 Low, Nike Air Max 270, Dunk Low)
- Style Code (e.g., DC0774-101, AH8050-005) - usually starts with letters, has numbers, dash, then 3 digits
- Size (e.g., 6, 10.5, 11, M, W)
- Price (use the lower/sale price if two prices shown)

Return JSON format:
{
  "items": [
    {"name": "Product Name", "sku": "XX0000-000", "size": "10", "price": 99.99}
  ],
  "orderDate": "",
  "orderNumber": "",
  "tax": 0,
  "total": 0
}

IMPORTANT:
- Extract EVERY visible item, even if some details are hard to read
- If you can see a product image and price but style code is blurry, still include it with your best guess at the SKU
- Size is often shown as "Size 10" or just a number near the product
- There may be 10, 20, or 30+ items - get them ALL
- Do your best even if image quality is not perfect

Only return the error JSON if you truly cannot see ANY products at all:
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
