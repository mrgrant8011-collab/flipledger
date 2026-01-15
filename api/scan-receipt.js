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
      // STEP 2: Multi-pattern item extraction
      // Use multiple methods and cross-validate
      // ========================================
      
      // METHOD 1: Find all Style codes
      const stylePattern = /Style\s*:?\s*([A-Z]{1,3}[A-Z0-9]{2,7}[\s-]*[0-9]{3})/gi;
      const styleMatches = [];
      let match;
      while ((match = stylePattern.exec(itemsText)) !== null) {
        let sku = match[1].toUpperCase().replace(/\s+/g, '');
        // Ensure proper dash format
        if (!sku.includes('-')) {
          sku = sku.slice(0, -3) + '-' + sku.slice(-3);
        }
        sku = sku.replace(/--+/g, '-');
        styleMatches.push({
          sku: sku,
          index: match.index,
          fullMatch: match[0]
        });
      }
      console.log('Method 1 - Style codes found:', styleMatches.length);
      
      // METHOD 2: Count Size patterns (Size 8, Size 11.5, Size 6Y, Size 4.5Y, Size 5.5Y, etc)
      const sizeMatches = itemsText.match(/Size\s+([0-9]+\.?[0-9]*Y?)\b/gi) || [];
      console.log('Method 2 - Size patterns found:', sizeMatches.length);
      
      // METHOD 3: Count sale price patterns ($48.99, $83.99 - typically ends in .99 or .00)
      // Look for price followed by strikethrough price: $48.99 $120.00
      const pricePairMatches = itemsText.match(/\$[0-9]+\.[0-9]{2}\s+\$[0-9]+\.[0-9]{2}/g) || [];
      console.log('Method 3 - Price pairs found:', pricePairMatches.length);
      
      // METHOD 4: Count product name occurrences
      const jordanCount = (itemsText.match(/Air Jordan/gi) || []).length;
      const maxCount = (itemsText.match(/Air Max/gi) || []).length;
      const dunkCount = (itemsText.match(/Dunk/gi) || []).length;
      const productNameCount = jordanCount + maxCount + dunkCount;
      console.log('Method 4 - Product names found:', productNameCount, `(Jordan:${jordanCount}, Max:${maxCount}, Dunk:${dunkCount})`);
      
      // Use the MAXIMUM count from all methods as our target
      const targetCount = Math.max(
        styleMatches.length,
        sizeMatches.length,
        pricePairMatches.length,
        productNameCount
      );
      console.log('Target item count:', targetCount);
      
      if (targetCount === 0) {
        return res.status(400).json({ 
          error: 'invalid', 
          message: 'Could not find Nike products. Make sure the screenshot shows product details.' 
        });
      }
      
      // ========================================
      // STEP 3: Extract item details using the most reliable method
      // ========================================
      
      const items = [];
      
      // Parse sizes from OCR (including youth sizes like 4.5Y, 5.5Y, 6Y, 6.5Y, etc)
      const sizeRegex = /Size\s+([0-9]+\.?[0-9]*Y?)\b/gi;
      const sizes = [];
      let sizeMatch;
      while ((sizeMatch = sizeRegex.exec(itemsText)) !== null) {
        sizes.push(sizeMatch[1]);
      }
      
      // Parse prices (sale prices - the lower ones)
      const priceRegex = /\$([0-9]+\.[0-9]{2})\s+\$([0-9]+\.[0-9]{2})/g;
      const prices = [];
      let priceMatch;
      while ((priceMatch = priceRegex.exec(itemsText)) !== null) {
        // First price is sale price (lower), second is original (higher)
        const salePrice = parseFloat(priceMatch[1]);
        const origPrice = parseFloat(priceMatch[2]);
        prices.push(Math.min(salePrice, origPrice));
      }
      
      console.log('Parsed sizes:', sizes.length, '| Parsed prices:', prices.length);
      
      // Build items array - use style matches as primary, fill in sizes/prices
      if (styleMatches.length >= targetCount - 1) {
        // Style codes are reliable, use them
        for (let i = 0; i < styleMatches.length; i++) {
          items.push({
            sku: styleMatches[i].sku,
            size: sizes[i] || '',
            price: prices[i] || 0,
            name: ''
          });
        }
        
        // If we're short by 1-2 items, add them from sizes/prices
        while (items.length < targetCount && items.length < sizes.length) {
          const lastSku = items.length > 0 ? items[items.length - 1].sku : 'UNKNOWN';
          items.push({
            sku: lastSku, // Use last known SKU as best guess
            size: sizes[items.length] || '',
            price: prices[items.length] || 0,
            name: ''
          });
        }
      } else {
        // Style codes unreliable, use sizes as primary count
        for (let i = 0; i < sizes.length; i++) {
          // Try to match size to nearest style code
          const sku = styleMatches[i]?.sku || styleMatches[styleMatches.length - 1]?.sku || 'UNKNOWN';
          items.push({
            sku: sku,
            size: sizes[i],
            price: prices[i] || 0,
            name: ''
          });
        }
      }
      
      console.log('Built items array:', items.length);
      
      // ========================================
      // STEP 4: Use Claude ONLY to get product names
      // ========================================
      
      const uniqueSkus = [...new Set(items.map(item => item.sku).filter(s => s !== 'UNKNOWN'))];
      console.log('Unique SKUs:', uniqueSkus);
      
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
      // STEP 5: Build final items with names
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
      
      const summaryText = summaryIndex > 0 ? text.substring(summaryIndex) : '';
      let tax = 0;
      
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
      
      const subtotal = finalItems.reduce((sum, item) => sum + item.price, 0);
      let total = subtotal + tax;
      
      const totalPattern = /Total\s*:?\s*\$([0-9]+\.[0-9]{2})/i;
      const totalMatch = summaryText.match(totalPattern) || text.match(totalPattern);
      if (totalMatch) {
        total = parseFloat(totalMatch[1]);
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
        total: Math.round(total * 100) / 100,
        _debug: {
          methods: {
            styleCodes: styleMatches.length,
            sizes: sizeMatches.length,
            pricePairs: pricePairMatches.length,
            productNames: productNameCount
          },
          targetCount: targetCount
        }
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
