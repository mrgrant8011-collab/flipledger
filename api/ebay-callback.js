// eBay OAuth Callback - Exchange code for access token
export default async function handler(req, res) {
  const { code, error } = req.query;
  
  // User declined
  if (error) {
    return res.redirect('/?ebay_error=declined');
  }
  
  // No code received
  if (!code) {
    return res.redirect('/?ebay_error=no_code');
  }
  
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RU_NAME;
  
  // Base64 encode credentials
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: ruName
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('eBay token error:', tokenData);
      return res.redirect(`/?ebay_error=${tokenData.error}`);
    }
    
    // Success! Redirect with token
    // Token will be stored in localStorage on frontend
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    
    // Redirect back to app with tokens in URL (will be grabbed and stored by frontend)
    res.redirect(`/?ebay_connected=true&ebay_token=${encodeURIComponent(accessToken)}&ebay_refresh=${encodeURIComponent(refreshToken)}&ebay_expires=${expiresIn}`);
    
  } catch (err) {
    console.error('eBay callback error:', err);
    res.redirect('/?ebay_error=callback_failed');
  }
}
