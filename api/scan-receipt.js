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
      // STEP 1: Clean up OCR text - remove summary section
      // ========================================
      
      const summaryMarkers = /(Return to a Nike|Subtotal|Summary|Payment|Store Address|Need Help|Quick Help)/i;
      const summaryIndex = text.search(summaryMarkers);
      const itemsText = summaryIndex > 0 ? text.substring(0, summaryIndex) : text;
      
      console.log('Items text length:', itemsText.length);
      
      // ========================================
      // STEP 2: Find all Style codes and their positions
      // Each Style code marks the END of an item block
      // ========================================
      
      const stylePattern = /Style\s*:?\s*([A-Z0-9]{2,10}[\s-]*[0-9]{3})/gi;
      const styleMatches = [];
      let match;
      
      while ((match = stylePattern.exec(itemsText)) !== null) {
        // Normalize SKU format
        let sku = match[1].toUpperCase().replace(/\s+/g, '');
        if (!sku.includes('-')) {
          sku = sku.slice(0, -3) + '-' + sku.slice(-3);
        }
        sku = sku.replace(/--+/g, '-');
        
        styleMatches.push({
          sku: sku,
          index: match.index,
          endIndex: match.index + match[0].length
        });
      }
      
      console.log('Found', styleMatches.length, 'style codes');
      
      // ========================================
      // STEP 3: For each Style code, extract the item block BEFORE it
      // Look backwards from Style code to find size and price
      // ========================================
      
      const items = [];
      
      for (let i = 0; i < styleMatches.length; i++) {
        const styleMatch = styleMatches[i];
        
        // Get the text block for this item
        // From the end of the previous Style code to the end of this Style code
        const blockStart = i > 0 ? styleMatches[i - 1].endIndex : 0;
        const blockEnd = styleMatch.endIndex;
        const blockText = itemsText.substring(blockStart, blockEnd);
        
        // Find size in this block (get the LAST size mentioned before Style)
        // Handles: Size 10, Size 7Y, Size M, Size XL, Size Large, ONE SIZE
        const sizeRegex = /Size\s+((?:[0-9]+\.?[0-9]*Y?)|(?:X{0,2}S|X{0,3}L|M)|(?:ONE\s*SIZE))/gi;
        let sizeMatch;
        let size = '';
        while ((sizeMatch = sizeRegex.exec(blockText)) !== null) {
          size = sizeMatch[1];
        }
        
        // Find price pair in this block ($29.98 $125.00)
        const priceRegex = /\$([0-9]+\.[0-9]{2})\s+\$([0-9]+\.[0-9]{2})/g;
        let priceMatch;
        let price = 0;
        while ((priceMatch = priceRegex.exec(blockText)) !== null) {
          // Use the lower price (sale price)
          const p1 = parseFloat(priceMatch[1]);
          const p2 = parseFloat(priceMatch[2]);
          price = Math.min(p1, p2);
        }
        
        // If no price pair found, look for single price
        if (price === 0) {
          const singlePriceRegex = /\$([0-9]+\.[0-9]{2})/g;
          const prices = [];
          let sp;
          while ((sp = singlePriceRegex.exec(blockText)) !== null) {
            prices.push(parseFloat(sp[1]));
          }
          if (prices.length > 0) {
            price = Math.min(...prices);
          }
        }
        
        console.log(`Item ${i + 1}: SKU=${styleMatch.sku}, Size=${size}, Price=${price}`);
        
        items.push({
          sku: styleMatch.sku,
          size: size,
          price: price,
          name: ''
        });
      }
      
      console.log('Extracted', items.length, 'items');
      
      if (items.length === 0) {
        return res.status(400).json({ 
          error: 'invalid', 
          message: 'Could not find Nike products. Make sure the screenshot shows Style codes.' 
        });
      }
      
      // ========================================
      // STEP 4: Use Claude to get product names for each unique SKU
      // ========================================
      
      const uniqueSkus = [...new Set(items.map(item => item.sku))];
      console.log('Unique SKUs:', uniqueSkus);
      
      const anthropic = new Anthropic({ apiKey });
      
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Given this Nike receipt text, tell me the EXACT product name for each Style code.

Receipt text:
${itemsText.substring(0, 4000)}

Style codes to identify: ${uniqueSkus.join(', ')}

Return ONLY a JSON object mapping style code to the exact product name from the receipt:
{
  "CW2289-001": "Nike Air Force 1 Mid '07",
  "924453-004": "Nike Air VaporMax Plus"
}

Use the exact product name as shown in the receipt. Just the mapping, nothing else.`
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
      
      console.log('SKU to Name mapping:', skuToName);
      
      // ========================================
      // STEP 5: Build final items with correct names
      // ========================================
      
      const finalItems = items.map(item => ({
        name: skuToName[item.sku] || `Nike Product (${item.sku})`,
        sku: item.sku,
        size: item.size,
        price: item.price
      }));
      
      // ========================================
      // STEP 6: Extract tax from summary section
      // ========================================
      
      // Search in multiple places - summary section, full text, and last portion of text
      const summaryText = summaryIndex > 0 ? text.substring(summaryIndex) : text;
      const lastPortion = text.slice(-800); // Last 800 chars likely has summary
      
      console.log('Summary section length:', summaryText.length);
      console.log('Last portion preview:', lastPortion.substring(0, 200));
      
      let tax = 0;
      
      // More comprehensive tax patterns
      const taxPatterns = [
        /Tax\s*\$([0-9]+\.[0-9]{2})/i,
        /(?:Estimated\s+)?Tax\s*:?\s*\$([0-9]+\.[0-9]{2})/i,
        /Sales\s+Tax\s*:?\s*\$([0-9]+\.[0-9]{2})/i,
        /Tax\s*\n\s*\$([0-9]+\.[0-9]{2})/i,
        /\bTax\b[^\$]*\$([0-9]+\.[0-9]{2})/i
      ];
      
      // Search in: 1) last portion, 2) summary section, 3) full text
      const searchTargets = [lastPortion, summaryText, text];
      
      for (const target of searchTargets) {
        if (tax > 0) break;
        for (const pattern of taxPatterns) {
          const taxMatch = target.match(pattern);
          if (taxMatch) {
            tax = parseFloat(taxMatch[1]);
            console.log('Found tax:', tax, 'in target length:', target.length);
            break;
          }
        }
      }
      
      if (tax === 0) {
        console.log('No tax found in any section');
      }
      
      const subtotal = finalItems.reduce((sum, item) => sum + item.price, 0);
      let total = subtotal + tax;
      
      const totalPattern = /Total\s*:?\s*\$([0-9,]+\.[0-9]{2})/i;
      const totalMatch = summaryText.match(totalPattern) || text.match(totalPattern);
      if (totalMatch) {
        total = parseFloat(totalMatch[1].replace(/,/g, ''));
        if (tax === 0 && total > subtotal) {
          tax = Math.round((total - subtotal) * 100) / 100;
          console.log('Calculated tax:', tax);
        }
      }
      
      console.log('=== FINAL RESULT ===');
      console.log('Items:', finalItems.length);
      console.log('Subtotal:', subtotal, '| Tax:', tax, '| Total:', total);
      
      return res.status(200).json({
        items: finalItems,
        subtotal: Math.round(subtotal * 100) / 100,
        tax: tax,
        total: Math.round(total * 100) / 100
      });
      
    } else {
      return res.status(400).json({ 
        error: 'invalid', 
        message: 'Please use Google Vision OCR first.' 
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
