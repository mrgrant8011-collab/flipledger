import { getValidToken } from '../lib/token-manager.js';

export default async function handler(req, res) {
  const { listingId, userId } = req.query;
  if (!listingId || !userId) return res.status(400).json({ error: 'Missing listingId or userId' });

  const tokenResult = await getValidToken(userId, 'stockx');
  if (!tokenResult.success) return res.status(401).json({ error: 'No valid StockX token' });

  const response = await fetch(
    `https://api.stockx.com/v2/selling/listings/${listingId}`,
    {
      headers: {
        'Authorization': `Bearer ${tokenResult.accessToken}`,
        'x-api-key': process.env.STOCKX_API_KEY
      }
    }
  );

  const data = await response.json();
  return res.status(response.status).json(data);
}
