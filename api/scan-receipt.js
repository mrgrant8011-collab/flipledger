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
    let expectedCount = 0;

    if (mode === 'text' && text) {
      expectedCount = countItemsInOCR(text);
      console.log(`[Parser] Pre-counted ${expectedCount} items in OCR text`);
      
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: buildNikeParsingPrompt(text, expectedCount)
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
                text: buildNikeParsingPrompt('', 0)
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
      // NO FILTERING - keep ALL items, mark incomplete ones with needsReview
      result.items = result.items.map(item => {
        const sku = normalizeSkuCode(item.sku);
        const size = normalizeSize(item.size);
        const price = parseFloat(item.price) || 0;
        const name = (item.name || 'Nike Product').trim();
        
        const needsReview = !sku || !size || price <= 0;
        
        return {
          name,
          sku: sku || 'UNKNOWN',
          size: size || 'UNKNOWN',
          price,
          needsReview
        };
      });
      
      const validCount = result.items.filter(i => !i.needsReview).length;
      const reviewCount = result.items.filter(i => i.needsReview).length;
      
      console.log(`[Parser] Returning ${result.items.length} total items (${validCount} valid, ${reviewCount} need review)`);
      
      if (expectedCount > 0 && result.items.length !== expectedCount) {
        console.warn(`[Parser] WARNING: Expected ${expectedCount} items but got ${result.items.length}`);
        result.countMismatch = true;
        result.expectedCount = expectedCount;
      }
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

function countItemsInOCR(text) {
  const styleMatches = text.match(/Style\s+[A-Z0-9]{5,8}-\d{3}/gi) || [];
  const salePriceMatches = text.match(/\$\d+\.\d{2}\s+\$\d+\.\d{2}/g) || [];
  const sizeMatches = text.match(/\bSize\s+\d+\.?\d*[CY]?\b/gi) || [];
  
  const count = Math.max(styleMatches.length, salePriceMatches.length, sizeMatches.length);
  console.log(`[Parser] Found ${styleMatches.length} Style codes, ${salePriceMatches.length} price pairs, ${sizeMatches.length} sizes`);
  
  return count;
}

function buildNikeParsingPrompt(ocrText, expectedCount) {
  let countInstruction = '';
  if (expectedCount > 0) {
    countInstruction = `
MANDATORY ITEM COUNT: There are EXACTLY ${expectedCount} items in this receipt.
Your items array MUST contain exactly ${expectedCount} entries.
Each "Style XXXXXX-XXX" line = one item. Count them - there are ${expectedCount}.
`;
  }

  const basePrompt = `You are parsing a Nike receipt for a BULK RESELLER.

${countInstruction}

CRITICAL RULES:
1. This is a BULK ORDER - multiple pairs of the SAME shoe were purchased
2. Each "Style XXXXXX-XXX" line = ONE item in your output
3. If Style 305381-100 appears 6 times, output 6 separate items
4. NEVER combine. NEVER deduplicate. Every Style line = one JSON object.
5. Even if two items are completely identical, output them separately.

PARSING:
- Use the FIRST price (sale price), not the crossed-out original
- Size formats: "Size 11", "11", "7C", "5Y"
- SKU format: XXXXXX-XXX (e.g., 305381-100, IB2255-100)

OUTPUT FORMAT:
{
  "items": [
    {"name": "Air Jordan 8 Retro", "sku": "305381-100", "size": "11", "price": 119.97},
    {"name": "Air Jordan 8 Retro", "sku": "305381-100", "size": "11", "price": 119.97},
    {"name": "Air Jordan 8 Retro", "sku": "305381-100", "size": "12", "price": 119.97}
  ],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}

Same SKU 3 times = 3 separate items in array.`;

  if (ocrText && ocrText.trim()) {
    return `${basePrompt}

---
OCR TEXT:
${ocrText}
---

Return exactly ${expectedCount > 0 ? expectedCount : 'all'} items.`;
  }
  
  return basePrompt;
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
