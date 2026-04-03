import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const subscription = event.data.object;

  // Helper — get email from Stripe customer
  async function getEmail(customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      return customer.email?.toLowerCase() || null;
    } catch (err) {
      console.error('Failed to retrieve customer:', err.message);
      return null;
    }
  }

  // ─── SUBSCRIPTION CREATED — add to whitelist ───────────────────────────────
  if (event.type === 'customer.subscription.created') {
    const email = await getEmail(subscription.customer);
    if (email) {
      const { error } = await supabase
        .from('allowed_emails')
        .insert({ email })
        .select();
      if (error && error.code !== '23505') {
        console.error('Whitelist insert error:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log(`✓ Added ${email} to FlipLedger — subscription started`);
    }
  }

  // ─── SUBSCRIPTION DELETED — remove from whitelist ──────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const email = await getEmail(subscription.customer);
    if (email) {
      const { error } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('email', email);
      if (error) {
        console.error('Whitelist delete error:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log(`✓ Removed ${email} from FlipLedger — subscription cancelled`);
    }
  }

  // ─── PAYMENT FAILED — remove from whitelist ────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    // Only act on subscription invoices, not one-time charges
    if (invoice.subscription) {
      const email = await getEmail(invoice.customer);
      if (email) {
        const { error } = await supabase
          .from('allowed_emails')
          .delete()
          .eq('email', email);
        if (error) {
          console.error('Whitelist delete error:', error);
          return res.status(500).json({ error: error.message });
        }
        console.log(`✓ Removed ${email} from FlipLedger — payment failed`);
      }
    }
  }

  return res.status(200).json({ received: true });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
