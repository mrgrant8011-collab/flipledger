// Debug endpoint - see raw eBay transaction data
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const accessToken = authHeader.replace('Bearer ', '');
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Get ALL transactions
    const txResponse = await fetch(
      `https://api.ebay.com/sell/finances/v1/transaction?filter=transactionDate:[${start}..${end}]&limit=1000`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );
    
    if (!txResponse.ok) {
      const errorText = await txResponse.text();
      return res.status(txResponse.status).json({ 
        error: 'eBay API Failed', 
        status: txResponse.status,
        details: errorText,
        tokenPreview: accessToken.substring(0, 20) + '...'
      });
    }
    
    const txData = await txResponse.json();
    const transactions = txData.transactions || [];
    
    // Filter to just NON_SALE_CHARGE and SALE for analysis
    const nonSaleCharges = transactions.filter(tx => tx.transactionType === 'NON_SALE_CHARGE');
    const sales = transactions.filter(tx => tx.transactionType === 'SALE');
    
    res.status(200).json({
      totalTransactions: transactions.length,
      salesCount: sales.length,
      nonSaleChargeCount: nonSaleCharges.length,
      // Return full raw data for first 5 of each
      sampleSales: sales.slice(0, 5),
      sampleNonSaleCharges: nonSaleCharges.slice(0, 10)
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message, stack: err.stack });
  }
}
