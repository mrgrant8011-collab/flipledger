export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }
  
  try {
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.STOCKX_CLIENT_ID,
        client_secret: process.env.STOCKX_CLIENT_SECRET,
        code: code,
        redirect_uri: 'https://flipledger.vercel.app/api/callback'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      return res.status(400).json({ error: tokens.error_description || tokens.error });
    }
    
    res.redirect(`/?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`);
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
}
