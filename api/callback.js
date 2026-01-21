// One-time use: Gets your refresh token

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Error: ${error} - ${error_description}`);
  }

  if (!code) {
    return res.status(400).send('No code received. Try the auth link again.');
  }

  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('Missing STOCKX_CLIENT_ID or STOCKX_CLIENT_SECRET in Vercel env vars.');
  }

  try {
    const response = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: 'https://flipledger.vercel.app/api/callback',
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).send(`
        <html>
        <body style="font-family: system-ui; padding: 40px; background: #111; color: #fff;">
          <h1 style="color: #ff3232;">❌ Failed</h1>
          <p>Error: ${data.error || 'Unknown'}</p>
          <p>${data.error_description || 'Code may have expired. Try again.'}</p>
        </body>
        </html>
      `);
    }

    return res.status(200).send(`
      <html>
      <body style="font-family: system-ui; padding: 40px; background: #111; color: #fff;">
        <h1 style="color: #00ff64;">✅ Success!</h1>
        <p>Copy this refresh token and add it to Vercel:</p>
        <div style="background: #222; padding: 20px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 14px;">
          ${data.refresh_token}
        </div>
        <h3>Next steps:</h3>
        <ol>
          <li>Copy the token above</li>
          <li>Go to Vercel → Settings → Environment Variables</li>
          <li>Add new variable: <strong>STOCKX_REFRESH_TOKEN</strong></li>
          <li>Paste the token as the value</li>
          <li>Redeploy your app</li>
        </ol>
      </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).send(`Server error: ${err.message}`);
  }
}
