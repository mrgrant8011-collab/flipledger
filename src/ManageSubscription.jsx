/**
 * ═══════════════════════════════════════════════════════════════
 * MANAGE SUBSCRIPTION BUTTON — src/ManageSubscription.jsx
 * ═══════════════════════════════════════════════════════════════
 *
 * Drop this anywhere in account / settings UI.
 *
 * Usage:
 *   import ManageSubscription from './ManageSubscription';
 *   <ManageSubscription session={supabaseSession} c={c} />
 *
 * Props:
 *   session  — Supabase session object (must have access_token)
 *   c        — your colour theme object (optional, has sensible defaults)
 * ═══════════════════════════════════════════════════════════════
 */

import { useState } from 'react';

const DEFAULT_C = {
  card: '#111111',
  border: '#1a1a1a',
  text: '#ffffff',
  textMuted: '#888888',
  gold: '#C9A962',
  green: '#10b981',
  red: '#ef4444',
};

export default function ManageSubscription({ session, c = DEFAULT_C }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleManage = async () => {
    if (!session?.access_token) {
      setError('You must be logged in to manage your subscription.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to open billing portal.');
      }

      // Redirect to Stripe Customer Portal
      window.location.href = data.url;

    } catch (err) {
      console.error('[ManageSubscription]', err.message);
      setError(err.message);
      setLoading(false);
    }
    // Note: don't reset loading on success — the page is navigating away
  };

  return (
    <div>
      <button
        onClick={handleManage}
        disabled={loading}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            10,
          padding:        '12px 22px',
          borderRadius:   10,
          border:         `1px solid ${c.gold}`,
          background:     loading ? 'rgba(201,169,98,0.08)' : 'rgba(201,169,98,0.12)',
          color:          loading ? c.textMuted : c.gold,
          fontSize:       14,
          fontWeight:     700,
          cursor:         loading ? 'not-allowed' : 'pointer',
          transition:     'all 0.15s',
          letterSpacing:  '0.2px',
        }}
        onMouseEnter={e => {
          if (!loading) e.currentTarget.style.background = 'rgba(201,169,98,0.2)';
        }}
        onMouseLeave={e => {
          if (!loading) e.currentTarget.style.background = 'rgba(201,169,98,0.12)';
        }}
      >
        {/* Icon */}
        <span style={{ fontSize: 16 }}>
          {loading ? '⏳' : '💳'}
        </span>

        {loading ? 'Opening Portal…' : 'Manage Subscription'}

        {/* External link indicator */}
        {!loading && (
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>↗</span>
        )}
      </button>

      {/* Subtitle copy */}
      <p style={{ margin: '8px 0 0', fontSize: 12, color: c.textMuted }}>
        Cancel, update payment method, or view billing history
      </p>

      {/* Inline error */}
      {error && (
        <div style={{
          marginTop:    10,
          padding:      '10px 14px',
          borderRadius: 8,
          background:   'rgba(239,68,68,0.08)',
          border:       '1px solid rgba(239,68,68,0.25)',
          color:        c.red,
          fontSize:     13,
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
