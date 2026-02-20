// eBay OAuth Callback - Exchange code for access token
import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;
  const userId = state ? decodeURIComponent(state) : null;
  
  // User declined or error occurred
  if (error) {
    console.log('eBay OAuth error:', error, error_description);
    return res.redirect(`/?ebay_error=${encodeURIComponent(error_description || error)}`);
  }
  
  // No code received
  if (!code) {
    return res.redirect('/?ebay_error=no_code');
  }
  
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RU_NAME;
  
  if (!clientId || !clientSecret || !ruName) {
    return res.redirect('/?ebay_error=missing_config');
  }
  
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
      return res.redirect(`/?ebay_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }
    
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    // Save tokens + auto-fetch policies per-user
    if (userId) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          // Save tokens
          await supabase.from('user_tokens').upsert({
            user_id: userId,
            platform: 'ebay',
            access_token: accessToken,
            refresh_token: refreshToken || null,
            expires_at: new Date(Date.now() + (expiresIn || 7200) * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,platform' });

          // Auto-fetch business policies
          const policyUpdates = {};
          const policyTypes = [
            { endpoint: 'fulfillment_policy', responseKey: 'fulfillmentPolicies', idKey: 'fulfillmentPolicyId', dbField: 'ebay_fulfillment_policy_id' },
            { endpoint: 'payment_policy', responseKey: 'paymentPolicies', idKey: 'paymentPolicyId', dbField: 'ebay_payment_policy_id' },
            { endpoint: 'return_policy', responseKey: 'returnPolicies', idKey: 'returnPolicyId', dbField: 'ebay_return_policy_id' }
          ];

          for (const pt of policyTypes) {
            try {
              const pRes = await fetch(`https://api.ebay.com/sell/account/v1/${pt.endpoint}?marketplace_id=EBAY_US`, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
              });
              if (pRes.ok) {
                const pData = await pRes.json();
                console.log(`[eBay Callback] ${pt.endpoint} response keys:`, Object.keys(pData));
                const policies = pData[pt.responseKey] || pData.policies || [];
                if (policies.length > 0) {
                  const policy = policies.find(p => p.name?.toLowerCase().includes('default')) || policies[0];
                  policyUpdates[pt.dbField] = policy[pt.idKey] || policy.policyId || policy.id;
                }
              } else {
                console.warn(`[eBay Callback] ${pt.endpoint} returned ${pRes.status}`);
              }
            } catch (pErr) {
              console.warn(`[eBay Callback] Failed to fetch ${pt.endpoint}:`, pErr.message);
            }
          }

          if (Object.keys(policyUpdates).length > 0) {
            policyUpdates.user_id = userId;
            policyUpdates.updated_at = new Date().toISOString();
            await supabase.from('user_settings').upsert(policyUpdates, { onConflict: 'user_id' });
            console.log('[eBay Callback] Saved policies:', Object.keys(policyUpdates));
          } else {
            console.warn('[eBay Callback] No business policies found - user may need to create them in Seller Hub');
          }
        // Auto-fetch seller location
          try {
            let addressFound = false;

            // Method 1: Try Identity API for registration address
            console.log('[eBay Callback] Trying Identity API...');
            try {
              const idRes = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
              });
              console.log('[eBay Callback] Identity API status:', idRes.status);
              if (idRes.ok) {
                const idData = await idRes.json();
                console.log('[eBay Callback] Identity keys:', Object.keys(idData));
                const addr = idData.registrationAddress || idData.businessAccount?.address || {};
                console.log('[eBay Callback] Identity address:', JSON.stringify(addr));
                if (addr.city || addr.postalCode) {
                  await supabase.from('user_settings').upsert({
                    user_id: userId,
                    ebay_location_address: addr.addressLine1 || null,
                    ebay_location_city: addr.city || null,
                    ebay_location_state: addr.stateOrProvince || null,
                    ebay_location_zip: addr.postalCode || null,
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'user_id' });
                  console.log('[eBay Callback] Saved location from Identity:', addr.city, addr.stateOrProvince);
                  addressFound = true;
                }
              }
            } catch (idErr) {
              console.warn('[eBay Callback] Identity API error:', idErr.message);
            }

            // Method 2: Fall back to fulfillment policy shipFromLocation
            if (!addressFound) {
              console.log('[eBay Callback] Trying fulfillment policy shipFromLocation...');
              const fpRes = await fetch('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
              });
              if (fpRes.ok) {
                const fpData = await fpRes.json();
                const fps = fpData.fulfillmentPolicies || [];
                for (const fp of fps) {
                  const sfl = fp.shipFromLocation || {};
                  console.log('[eBay Callback] shipFromLocation:', JSON.stringify(sfl));
                  if (sfl.city || sfl.postalCode) {
                    await supabase.from('user_settings').upsert({
                      user_id: userId,
                      ebay_location_address: sfl.addressLine1 || null,
                      ebay_location_city: sfl.city || null,
                      ebay_location_state: sfl.stateOrProvince || null,
                      ebay_location_zip: sfl.postalCode || null,
                      updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                    console.log('[eBay Callback] Saved location from policy:', sfl.city, sfl.stateOrProvince);
                    addressFound = true;
                    break;
                  }
                }
              }
            }

            if (!addressFound) {
              console.warn('[eBay Callback] No address found from any source');
            }
          } catch (locErr) {
            console.warn('[eBay Callback] Failed to fetch location:', locErr.message);
          }
        }
      } catch (dbErr) {
        console.error('[eBay Callback] DB/policy error:', dbErr.message);
      }
    }

    res.redirect(`/?ebay_connected=true&ebay_token=${encodeURIComponent(accessToken)}&ebay_refresh=${encodeURIComponent(refreshToken || '')}&ebay_expires=${expiresIn}`);
    
  } catch (err) {
    console.error('eBay callback error:', err);
    res.redirect(`/?ebay_error=${encodeURIComponent(err.message)}`);
  }
}
