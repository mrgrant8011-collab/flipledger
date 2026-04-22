import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Supabase auto-detects the recovery token in the URL and creates a session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setValidSession(true);
          setChecking(false);
          return;
        }
        // Listen for auth state change in case session is still being set up
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY' || session) {
            setValidSession(true);
          }
        });
        // Give it a moment then check again
        setTimeout(async () => {
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          setValidSession(!!retrySession);
          setChecking(false);
          subscription.unsubscribe();
        }, 1500);
      } catch (e) {
        console.error('[ResetPassword] Session check error:', e);
        setChecking(false);
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      // Sign them out so they log in fresh with the new password
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const c = {
    bg: '#0C0C0C',
    card: '#111111',
    border: 'rgba(255,255,255,0.08)',
    text: '#ffffff',
    textMuted: 'rgba(255,255,255,0.5)',
    gold: '#C9A962',
    green: '#10b981',
    red: '#ef4444',
  };

  return (
    <div style={{ background: c.bg, minHeight: '100vh', color: c.text, fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 420, width: '100%', background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: 32 }}>
        <a href="/" style={{ color: c.gold, fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 24 }}>← Back to FlipLedger</a>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Reset Password</h1>
        <p style={{ color: c.textMuted, fontSize: 14, marginBottom: 24 }}>Enter a new password for your account.</p>

        {checking && (
          <div style={{ padding: 16, textAlign: 'center', color: c.textMuted }}>Verifying link...</div>
        )}

        {!checking && !validSession && !success && (
          <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: c.red, fontSize: 14, marginBottom: 16 }}>
            ⚠️ This reset link is invalid or expired. Please request a new one from the login page.
          </div>
        )}

        {!checking && validSession && !success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: c.textMuted, display: 'block', marginBottom: 8, fontWeight: 600 }}>NEW PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ width: '100%', padding: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: c.textMuted, display: 'block', marginBottom: 8, fontWeight: 600 }}>CONFIRM PASSWORD</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                style={{ width: '100%', padding: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            {error && (
              <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: c.red, fontSize: 13, marginBottom: 16 }}>
                ⚠️ {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: 14, background: loading ? 'rgba(201,169,98,0.3)' : c.gold, border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        {success && (
          <div style={{ padding: 20, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.green, marginBottom: 4 }}>Password updated!</div>
            <div style={{ fontSize: 13, color: c.textMuted }}>Redirecting to login...</div>
          </div>
        )}
      </div>
    </div>
  );
}
