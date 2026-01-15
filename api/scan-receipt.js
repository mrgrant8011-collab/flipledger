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

    if (mode === 'text' && text) {
      // ========================================
      // STEP 1: Extract items directly from OCR text using regex
      // This is the SOURCE OF TRUTH for item count
      // ========================================
      
      // Remove the summary/footer section (after "Return to" or "Subtotal" or "Summary")
      const summaryMarkers = /(Return to a Nike|Subtotal|Summary|Payment|Store Address|Need Help|Quick Help)/i;
      const summaryIndex = text.search(summaryMarkers);
      const itemsText = summaryIndex > 0 ? text.substring(0, summaryIndex) : text;
      
      console.log('Items text length:', itemsText.length, '(removed summary section)');
      
      // Find all items by looking for Style codes
      // Nike style codes look like: DC0774-101, AH8050-005, BQ6472-001, etc.
      const items = [];
      
      // Split by style code pattern to get each item block
      // Pattern: Style followed by code like XX0000-000 or XXXXXX-000
      const stylePattern = /Style\s*:?\s*([A-Z]{1,2}[A-Z0-9]{3,6}-[0-9]{3})/gi;
      const sizePattern = /Size\s*:?\s*([0-9]+\.?5?)/gi;
      const pricePattern = /\$([0-9]+\.?[0-9]{0,2})\s*\$?[0-9]*/g; // Gets first price (sale price)
      
      // Find all style codes and their positions
      const styleMatches = [];
      let match;
      while ((match = stylePattern.exec(itemsText)) !== null) {
        styleMatches.push({
          sku: match[1].toUpperCase(),
          index: match.index
        });
      }
      
      console.log('Found', styleMatches.length, 'style codes in OCR text');
      
      // For each style code, find the nearest size and price BEFORE it
      for (let i = 0; i < styleMatches.length; i++) {
        const styleMatch = styleMatches[i];
        const nextStyleIndex = styleMatches[i + 1]?.index || itemsText.length;
        
        // Get the text block for this item (from previous style to this style, plus a bit after)
        const startIndex = i > 0 ? styleMatches[i - 1].index : 0;
        const blockText = itemsText.substring(startIndex, nextStyleIndex);
        
        // Find size in this block
        const sizeRegex = /Size\s*:?\s*([0-9]+\.?5?)/gi;
        let sizeMatch;
        let size = '';
        while ((sizeMatch = sizeRegex.exec(blockText)) !== null) {
          size = sizeMatch[1];
        }
        
        // Find price in this block - look for $XX.XX pattern
        // Nike shows: $48.99 $120.00 (sale price first, original second)
        const priceRegex = /\$([0-9]+\.[0-9]{2})/g;
        let priceMatch;
        let price = 0;
        const prices = [];
        while ((priceMatch = priceRegex.exec(blockText)) !== null) {
          prices.push(parseFloat(priceMatch[1]));
        }
        // Use the lowest price (sale price) or first price
        if (prices.length > 0) {
          price = Math.min(...prices);
        }
        
        items.push({
          sku: styleMatch.sku,
          size: size,
          price: price,
          name: '' // Will be filled by Claude
        });
      }
      
      console.log('Extracted', items.length, 'items from OCR');
      
      if (items.length === 0) {
        return res.status(400).json({ 
          error: 'invalid', 
          message: 'Could not find Nike products. Make sure the screenshot shows Style codes.' 
        });
      }
      
      // ========================================
      // STEP 2: Use Claude ONLY to get product names for each SKU
      // Claude does NOT control the count - we already have that
      // ========================================
      
      const uniqueSkus = [...new Set(items.map(item => item.sku))];
      console.log('Unique SKUs to look up:', uniqueSkus);
      
      const anthropic = new Anthropic({ apiKey });
      
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Given this Nike receipt text, tell me the product name for each Style code.

Receipt text:
${itemsText.substring(0, 3000)}

Style codes to identify: ${uniqueSkus.join(', ')}

Return ONLY a JSON object mapping style code to product name:
{
  "DC0774-101": "Air Jordan 1 Low",
  "AH8050-005": "Nike Air Max 270"
}

Just the mapping, nothing else.`
          }
        ],
      });
      
      // Parse the SKU to name mapping
      let skuToName = {};
      try {
        const content = response.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          skuToName = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Could not parse SKU names, using defaults');
      }
      
      // ========================================
      // STEP 3: Build final items with names
      // ========================================
      
      const finalItems = items.map(item => ({
        name: skuToName[item.sku] || `Nike Product (${item.sku})`,
        sku: item.sku,
        size: item.size,
        price: item.price
      }));
      
      // Calculate totals
      const subtotal = finalItems.reduce((sum, item) => sum + item.price, 0);
      
      // ========================================
      // STEP 4: Extract tax from summary section
      // ========================================
      const summaryText = summaryIndex > 0 ? text.substring(summaryIndex) : '';
      let tax = 0;
      
      // Look for tax patterns: "Tax $XX.XX" or "Tax: $XX.XX" or "Estimated Tax $XX.XX"
      const taxPatterns = [
        /(?:Estimated\s+)?Tax\s*:?\s*\$([0-9]+\.[0-9]{2})/i,
        /Tax\s+\$([0-9]+\.[0-9]{2})/i,
        /Sales\s+Tax\s*:?\s*\$([0-9]+\.[0-9]{2})/i
      ];
      
      for (const pattern of taxPatterns) {
        const taxMatch = summaryText.match(pattern) || text.match(pattern);
        if (taxMatch) {
          tax = parseFloat(taxMatch[1]);
          console.log('Found tax:', tax);
          break;
        }
      }
      
      // Also try to find total to validate
      let total = subtotal + tax;
      const totalPattern = /Total\s*:?\s*\$([0-9]+\.[0-9]{2})/i;
      const totalMatch = summaryText.match(totalPattern) || text.match(totalPattern);
      if (totalMatch) {
        total = parseFloat(totalMatch[1]);
        console.log('Found total from receipt:', total);
        
        // If we have total but no tax, calculate tax
        if (tax === 0 && total > subtotal) {
          tax = Math.round((total - subtotal) * 100) / 100;
          console.log('Calculated tax from total - subtotal:', tax);
        }
      }
      
      console.log('Final item count:', finalItems.length);
      console.log('Subtotal:', subtotal, 'Tax:', tax, 'Total:', total);
      
      return res.status(200).json({
        items: finalItems,
        subtotal: Math.round(subtotal * 100) / 100,
        tax: tax,
        total: Math.round(total * 100) / 100,
        _debug: {
          styleCodesFound: styleMatches.length,
          uniqueSkus: uniqueSkus.length
        }
      });
      
    } else {
      // IMAGE MODE: Fallback for direct image upload (not recommended)
      return res.status(400).json({ 
        error: 'invalid', 
        message: 'Please use Google Vision OCR first. Direct image mode is deprecated.' 
      });
    }

  } catch (error) {
    console.error('Receipt scan error:', error);
    return res.status(500).json({ 
      error: 'Scan failed', 
      message: error.message || 'Failed to scan receipt. Please try again.' 
    });
  }
}
