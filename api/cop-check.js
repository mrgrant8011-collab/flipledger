// Cop Check API - StockX prices via GraphQL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }
  
  try {
    // Step 1: Search for product to get URL key
    const searchQuery = {
      query: `
        query SearchProducts($query: String!) {
          browse(query: $query, first: 5) {
            edges {
              node {
                ... on Product {
                  id
                  urlKey
                  title
                  styleId
                  media {
                    thumbUrl
                    imageUrl
                  }
                  market {
                    bidAskData {
                      lowestAsk
                      highestBid
                      lastSale
                      salesLast72Hours
                    }
                  }
                  variants {
                    id
                    sizeChart {
                      baseSize
                      displayOptions {
                        type
                        value
                      }
                    }
                    market {
                      bidAskData {
                        lowestAsk
                        highestBid
                        lastSale
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: { query: sku }
    };
    
    const searchRes = await fetch('https://stockx.com/p/e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://stockx.com',
        'Referer': 'https://stockx.com/',
        'apollographql-client-name': 'Iron',
        'apollographql-client-version': '2023.12.01.00',
        'x-stockx-device-id': 'web-' + Math.random().toString(36).substring(7),
      },
      body: JSON.stringify(searchQuery)
    });
    
    if (!searchRes.ok) {
      // Fallback: Try simple REST API
      return await fallbackSearch(sku, res);
    }
    
    const searchData = await searchRes.json();
    const edges = searchData?.data?.browse?.edges || [];
    
    if (edges.length === 0) {
      return await fallbackSearch(sku, res);
    }
    
    // Find exact SKU match
    let product = edges.find(e => 
      e.node?.styleId?.toUpperCase() === sku.toUpperCase()
    )?.node || edges[0]?.node;
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Build sizes object
    const sizes = {};
    if (product.variants) {
      product.variants.forEach(v => {
        const sizeDisplay = v.sizeChart?.displayOptions?.find(o => o.type === 'us')?.value 
          || v.sizeChart?.baseSize;
        if (sizeDisplay && v.market?.bidAskData) {
          sizes[sizeDisplay] = {
            stockx: v.market.bidAskData.lowestAsk || 0,
            lastSale: v.market.bidAskData.lastSale || 0,
            highestBid: v.market.bidAskData.highestBid || 0
          };
        }
      });
    }
    
    const market = product.market?.bidAskData || {};
    
    // Build image URL
    let image = product.media?.imageUrl || product.media?.thumbUrl || '';
    if (!image && product.title) {
      const slug = product.title
        .replace(/[()]/g, '')
        .replace(/'/g, '')
        .replace(/&/g, 'and')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2`;
    }
    
    return res.status(200).json({
      name: product.title,
      sku: product.styleId || sku,
      image: image,
      lowestAsk: market.lowestAsk || 0,
      highestBid: market.highestBid || 0,
      lastSale: market.lastSale || 0,
      salesLast72Hours: market.salesLast72Hours || 0,
      sizes: sizes
    });
    
  } catch (error) {
    console.error('Cop Check Error:', error);
    return await fallbackSearch(req.query.sku, res);
  }
}

// Fallback using public browse API
async function fallbackSearch(sku, res) {
  try {
    const url = `https://stockx.com/api/browse?_search=${encodeURIComponent(sku)}&dataType=product`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      return res.status(404).json({ error: 'Could not fetch StockX data' });
    }
    
    const data = await response.json();
    const products = data.Products || [];
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'No products found' });
    }
    
    const product = products.find(p => 
      p.styleId?.toUpperCase() === sku.toUpperCase()
    ) || products[0];
    
    const market = product.market || {};
    
    // Get children/variants for sizes
    const sizes = {};
    if (product.children) {
      Object.values(product.children).forEach(child => {
        if (child.shoeSize && child.market) {
          sizes[child.shoeSize] = {
            stockx: child.market.lowestAsk || 0,
            lastSale: child.market.lastSale || 0,
            highestBid: child.market.highestBid || 0
          };
        }
      });
    }
    
    // Build image
    let image = product.media?.imageUrl || product.media?.thumbUrl || '';
    if (!image && product.title) {
      const slug = product.title
        .replace(/[()]/g, '')
        .replace(/'/g, '')
        .replace(/&/g, 'and')
        .trim()
        .replace(/\s+/g, '-');
      image = `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2`;
    }
    
    return res.status(200).json({
      name: product.title || product.name,
      sku: product.styleId || sku,
      image: image,
      lowestAsk: market.lowestAsk || 0,
      highestBid: market.highestBid || 0,
      lastSale: market.lastSale || 0,
      salesLast72Hours: market.salesLast72Hours || 0,
      sizes: sizes
    });
    
  } catch (error) {
    console.error('Fallback Error:', error);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
