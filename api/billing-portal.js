/**
 * ═══════════════════════════════════════════════════════════════
 * STRIPE BILLING PORTAL — /api/billing-portal
 * ═══════════════════════════════════════════════════════════════
 *
 * Creates a Stripe Customer Portal session for the authenticated
 * user so they can cancel, update payment, or view billing history.
 *
 * Flow:
 *   1. Authenticate user via Supabase Bearer token
 *   2. Look up their Stripe customer by email
 *   3. Create a billing portal session
 *   4. Return the session URL
 *
 * Required env vars (already set in Vercel):
 *   STRIPE_SECRET_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_APP_URL   ← used as the return URL
 * ═══════════════════════════════════════════════════════════════
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Authenticate the user ──────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const sessionToken = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${sessionToken}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'No email on account' });
  }

  try {
    // ── 2. Find Stripe customer by email ────────────────────────
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return res.status(404).json({
        error: 'No active subscription found for this account.',
        code: 'NO_CUSTOMER',
      });
    }

    const customerId = customers.data[0].id;

    // ── 3. Create billing portal session ────────────────────────
    const returnUrl =
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/?billing=returned`
        : 'https://flipledgerhq.com/?billing=returned';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log(`[BillingPortal] Session created for ${email}`);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[BillingPortal] Error:', err.message);

    // Stripe throws if the portal hasn't been configured in the Dashboard yet
    if (err.message?.includes('configuration')) {
      return res.status(500).json({
        error:
          'Billing portal not configured. Go to Stripe Dashboard → Billing → Customer Portal and save your settings.',
        code: 'PORTAL_NOT_CONFIGURED',
      });
    }

    return res.status(500).json({ error: err.message });
  }
}
