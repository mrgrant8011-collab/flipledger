/**
 * ═══════════════════════════════════════════════════════════════
 * STRIPE WEBHOOK — /api/stripe-webhook
 * ═══════════════════════════════════════════════════════════════
 *
 * Events handled:
 *   customer.subscription.created     → add to allowed_emails + grant access
 *   customer.subscription.updated     → detect cancel_at_period_end + update status
 *   customer.subscription.deleted     → remove from whitelist + ban user
 *   invoice.payment_failed            → immediate revoke + ban
 *   charge.refunded                   → immediate revoke + ban
 *   charge.dispute.created            → immediate revoke + ban (chargeback protection)
 *
 * Required env vars (already set in Vercel):
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * ═══════════════════════════════════════════════════════════════
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Webhook] Received: ${event.type}`);

  const obj = event.data.object;

  // ─── SUBSCRIPTION CREATED — add to whitelist ────────────────────────────────
  if (event.type === 'customer.subscription.created') {
    const email = await getEmail(obj.customer);
    if (email) {
      const { error } = await supabase
        .from('allowed_emails')
        .insert({ email })
        .select();

      if (error && error.code !== '23505') {
        console.error('[Webhook] Whitelist insert error:', error);
        return res.status(500).json({ error: error.message });
      }

      const periodEnd = obj.current_period_end || obj.items?.data?.[0]?.current_period_end;
      await upsertSubscriptionStatus(email, 'active', periodEnd);
      await enableSupabaseUser(email);
      console.log(`[Webhook] ✓ Added ${email} — subscription started`);
    }
  }

  // ─── SUBSCRIPTION UPDATED — detect scheduled cancellation ───────────────────
  if (event.type === 'customer.subscription.updated') {
    const email = await getEmail(obj.customer);
    if (email) {
      if (obj.cancel_at_period_end) {
        const periodEnd = obj.current_period_end || obj.items?.data?.[0]?.current_period_end;
        await upsertSubscriptionStatus(email, 'canceling', periodEnd);
        console.log(
          `[Webhook] ✓ ${email} cancelled — access until ${new Date(periodEnd * 1000).toISOString()}`
        );
      } else if (obj.status === 'active') {
        await upsertSubscriptionStatus(email, 'active', obj.current_period_end);
        console.log(`[Webhook] ✓ ${email} subscription reactivated`);
      }
    }
  }

      // ─── SUBSCRIPTION DELETED — remove from whitelist ───────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const email = await getEmail(obj.customer);
    if (email) {
      const { error } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('email', email);
      if (error) {
        console.error('[Webhook] Whitelist delete error:', error);
        return res.status(500).json({ error: error.message });
      }
      await upsertSubscriptionStatus(email, 'canceled', null);
      await disableSupabaseUser(email);
      console.log(`[Webhook] ✓ Removed ${email} — subscription ended`);
    }
  }
  // ─── INVOICE PAYMENT FAILED — immediate access revocation ───────────────────
  if (event.type === 'invoice.payment_failed') {
    const invoice = obj;
    if (invoice.subscription) {
      const email = await getEmail(invoice.customer);
      if (email) {
        console.log(`[Webhook] Payment failed for ${email} — revoking access immediately`);

        const { error: deleteError } = await supabase
          .from('allowed_emails')
          .delete()
          .eq('email', email);

        if (deleteError) {
          console.error('[Webhook] Whitelist delete error on payment failed:', deleteError);
        }

        await upsertSubscriptionStatus(email, 'payment_failed', null);
        await disableSupabaseUser(email);
        console.log(`[Webhook] ✓ Revoked access for payment failed user: ${email}`);
      }
    }
  }

  // ─── CHARGE REFUNDED — immediate access revocation ─────────────────────────
  if (event.type === 'charge.refunded') {
    const charge = obj;
    const email = await getEmail(charge.customer);

    if (email) {
      console.log(`[Webhook] Charge refunded for ${email} — revoking access immediately`);

      const { error: deleteError } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('email', email);

      if (deleteError) {
        console.error('[Webhook] Whitelist delete error on refund:', deleteError);
      }

      await upsertSubscriptionStatus(email, 'refunded', null);
      await disableSupabaseUser(email);

      console.log(`[Webhook] ✓ Revoked access for refunded user: ${email}`);
    }
  }

  // ─── CHARGE DISPUTE (CHARGEBACK) — immediate access revocation ─────────────
  if (event.type === 'charge.dispute.created') {
    const dispute = obj;
    const email = await getEmail(dispute.customer);

    if (email) {
      console.log(`[Webhook] Dispute created for ${email} — revoking access immediately`);

      const { error: deleteError } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('email', email);

      if (deleteError) {
        console.error('[Webhook] Whitelist delete error on dispute:', deleteError);
      }

      await upsertSubscriptionStatus(email, 'disputed', null);
      await disableSupabaseUser(email);

      console.log(`[Webhook] ✓ Revoked access for disputed user: ${email}`);
    }
  }

  return res.status(200).json({ received: true });
}



// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getEmail(customerId) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer.email?.toLowerCase() || null;
  } catch (err) {
    console.error('[Webhook] Failed to retrieve customer:', err.message);
    return null;
  }
}

async function upsertSubscriptionStatus(email, status, periodEnd) {
  try {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('[Webhook] listUsers error:', listError.message);
      return;
    }

    const authUser = users.find(u => u.email?.toLowerCase() === email);
    if (!authUser) {
      console.warn(`[Webhook] No Supabase user found for ${email}`);
      return;
    }

    const periodEndIso = periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null;

    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id:                 authUser.id,
        subscription_status:     status,
        subscription_period_end: periodEndIso,
        updated_at:              new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('[Webhook] user_settings upsert error:', error.message);
    }
  } catch (err) {
    console.error('[Webhook] upsertSubscriptionStatus error:', err.message);
  }
}

async function disableSupabaseUser(email) {
  try {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) { console.error('[Webhook] listUsers error:', listError.message); return; }
    const authUser = users.find(u => u.email?.toLowerCase() === email);
    if (!authUser) { console.warn(`[Webhook] No Supabase user found for ${email}`); return; }
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, { ban_duration: '876600h' });
    if (error) { console.error('[Webhook] Ban user error:', error.message); }
    else { console.log(`[Webhook] ✓ Banned Supabase user: ${email}`); }
  } catch (err) {
    console.error('[Webhook] disableSupabaseUser error:', err.message);
  }
}

async function enableSupabaseUser(email) {
  try {
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) { console.error('[Webhook] listUsers error:', listError.message); return; }
    const authUser = users.find(u => u.email?.toLowerCase() === email);
    if (!authUser) { console.warn(`[Webhook] No Supabase user found for ${email}`); return; }
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, { ban_duration: 'none' });
    if (error) { console.error('[Webhook] Unban user error:', error.message); }
    else { console.log(`[Webhook] ✓ Unbanned Supabase user: ${email}`); }
  } catch (err) {
    console.error('[Webhook] enableSupabaseUser error:', err.message);
  }
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
  api: { bodyParser: false },
};
