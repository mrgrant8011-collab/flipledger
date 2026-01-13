// Cop Check API - Fetches prices from StockX, GOAT, FlightClub
// Uses Sneaks-API (npm package)

import SneaksAPI from 'sneaks-api';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { sku } = req.query;
  
  if (!sku) {
    return res.status(400).json({ error: 'SKU required' });
  }
  
  try {
    const sneaks = new SneaksAPI();
    
    // Search for the product
    const products = await new Promise((resolve, reject) => {
      sneaks.getProducts(sku, 5, (err, products) => {
        if (err) reject(err);
        else resolve(products);
      });
    });
    
    if (!products || products.length === 0) {
      return res.status(404).json({ error: 'No products found for that style code' });
    }
    
    // Get the best match (first result or exact SKU match)
    let product = products.find(p => p.styleID && p.styleID.toUpperCase() === sku.toUpperCase()) || products[0];
    
    // Get detailed pricing info
    const details = await new Promise((resolve, reject) => {
      sneaks.getProductPrices(product.styleID, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    if (!details) {
      return res.status(404).json({ error: 'Could not fetch pricing data' });
    }
    
    // Build response
    const response = {
      name: details.shoeName || product.shoeName,
      sku: details.styleID || product.styleID,
      image: details.thumbnail || product.thumbnail,
      retail: details.retailPrice || 0,
      lowestAsk: {
        stockx: details.lowestResellPrice?.stockX || 0,
        goat: details.lowestResellPrice?.goat || 0,
        flightclub: details.lowestResellPrice?.flightClub || 0
      },
      // Size-specific pricing if available
      sizes: {},
      // Sales data
      salesLast30: details.resellLinks?.stockX ? estimateSales(details) : 0,
      avgSale: details.lowestResellPrice?.stockX ? Math.round(details.lowestResellPrice.stockX * 0.95) : 0
    };
    
    // Add size-specific prices if available
    if (details.resellPrices) {
      Object.entries(details.resellPrices).forEach(([size, prices]) => {
        response.sizes[size] = {
          stockx: prices.stockX || 0,
          goat: prices.goat || 0,
          flightclub: prices.flightClub || 0
        };
      });
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Cop Check API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch pricing data. Try again.' });
  }
}

// Estimate sales based on available data
// This is a rough estimate - Sneaks-API doesn't provide exact sales counts
function estimateSales(details) {
  // If we had real data, we'd use it
  // For now, estimate based on price spread (popular items have tighter spreads)
  const stockxPrice = details.lowestResellPrice?.stockX || 0;
  const goatPrice = details.lowestResellPrice?.goat || 0;
  
  if (!stockxPrice || !goatPrice) return 50; // Default medium liquidity
  
  const priceDiff = Math.abs(stockxPrice - goatPrice) / stockxPrice;
  
  // Tighter spread = more liquid
  if (priceDiff < 0.05) return 300; // Very high liquidity
  if (priceDiff < 0.10) return 150; // High liquidity
  if (priceDiff < 0.15) return 75;  // Medium liquidity
  return 30; // Low liquidity
}
