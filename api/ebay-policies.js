// eBay Business Policies - Fetch all policies for user to pick defaults
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const accessToken = authHeader.replace('Bearer ', '').trim();

  const results = { fulfillment: [], payment: [], return: [] };

  const policyTypes = [
    { endpoint: 'fulfillment_policy', responseKey: 'fulfillmentPolicies', idKey: 'fulfillmentPolicyId', type: 'fulfillment' },
    { endpoint: 'payment_policy', responseKey: 'paymentPolicies', idKey: 'paymentPolicyId', type: 'payment' },
    { endpoint: 'return_policy', responseKey: 'returnPolicies', idKey: 'returnPolicyId', type: 'return' }
  ];

  try {
    for (const pt of policyTypes) {
      try {
        const pRes = await fetch(`https://api.ebay.com/sell/account/v1/${pt.endpoint}?marketplace_id=EBAY_US`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          const policies = pData[pt.responseKey] || pData.policies || [];
          results[pt.type] = policies.map(p => ({
            id: p[pt.idKey] || p.policyId || p.id,
            name: p.name || 'Unnamed Policy'
          }));
        }
      } catch (err) {
        console.warn(`[eBay Policies] Failed to fetch ${pt.endpoint}:`, err.message);
      }
    }

    return res.status(200).json({ success: true, policies: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
