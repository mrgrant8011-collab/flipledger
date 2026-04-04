import { useState } from 'react';
import { supabase } from './supabase';

const DEFAULT_C = {
  card: '#111111',
  border: '#1a1a1a',
  text: '#ffffff',
  textMuted: '#888888',
  gold: '#C9A962',
  red: '#ef4444',
};

export default function ManageSubscription({ c = DEFAULT_C }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleManage = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get session directly from Supabase
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('You must be logged in to manage your subscription.');
      }

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

      window.location.href = data.url;

    } catch (err) {
      console.error('[ManageSubscription]', err.message);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleManage}
        disabled={loading}
        style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           10,
          padding:       '12px 22px',
          borderRadius:  10,
          border:        `1px solid ${c.gold}`,
          background:    loading ? 'rgba(201,169,98,0.08)' : 'rgba(201,169,98,0.12)',
          color:         loading ? c.textMuted : c.gold,
          fontSize:      14,
          fontWeight:    700,
          cursor:        loading ? 'not-allowed' : 'pointer',
          transition:    'all 0.15s',
        }}
      >
        <span style={{ fontSize: 16 }}>{loading ? '⏳' : '💳'}</span>
        {loading ? 'Opening Portal…' : 'Manage Subscription'}
        {!loading && <span style={{ fontSize: 11, opacity: 0.6 }}>↗</span>}
      </button>

      <p style={{ margin: '8px 0 0', fontSize: 12, color: c.textMuted }}>
        Cancel, update payment method, or view billing history
      </p>

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
