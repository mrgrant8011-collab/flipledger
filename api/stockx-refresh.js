// StockX Token Refresh - Get new access token using refresh token
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'No refresh token provided' });
  }

  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Missing StockX credentials' });
  }

  try {
    const tokenResponse = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh_token,
        audience: 'gateway.stockx.com'
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[StockX Refresh] Error:', tokenData);
      return res.status(400).json({
        error: tokenData.error,
        description: tokenData.error_description,
        needsReconnect: true
      });
    }

    res.status(200).json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refresh_token,
      expires_in: tokenData.expires_in || 3600
    });

  } catch (err) {
    console.error('[StockX Refresh] Error:', err);
    res.status(500).json({ error: 'Failed to refresh token', message: err.message });
  }
}
