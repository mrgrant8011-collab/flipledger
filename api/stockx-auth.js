export default function handler(req, res) {
  const clientId = process.env.STOCKX_CLIENT_ID;const userId = req.query.userId || '';
  
  const authUrl = `https://accounts.stockx.com/authorize?` +
    `response_type=code&` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent('https://flipledger.vercel.app/api/callback')}&` +
    `scope=offline_access%20openid&` +
    `audience=gateway.stockx.com&` +
    `state=${encodeURIComponent(userId)}`;
  
  res.redirect(authUrl);
}
