// eBay OAuth - Start Authorization Flow
export default function handler(req, res) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RU_NAME;
  
  // Debug mode - show what we have
  if (req.query.debug === 'true') {
    return res.json({
      hasClientId: !!clientId,
      clientIdPreview: clientId ? clientId.substring(0, 20) + '...' : 'NOT SET',
      hasRuName: !!ruName,
      ruNamePreview: ruName ? ruName.substring(0, 20) + '...' : 'NOT SET'
    });
  }
  
  if (!clientId || !ruName) {
    return res.status(500).json({ 
      error: 'Missing environment variables',
      hasClientId: !!clientId,
      hasRuName: !!ruName
    });
  }
  
  // Request ALL scopes we need - fulfillment for orders, finances for transactions
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.finances'
  ].join(' ');
  
  // eBay OAuth URL
  const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${ruName}&scope=${encodeURIComponent(scopes)}`;
  
  res.redirect(authUrl);
}
