import LandingPage from './LandingPage';
import Listings from './Listings';
import CopCheck from './CopCheck';
import { useState, useEffect, Component, useRef } from 'react';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { supabase } from './supabase';
import { NIKE_DESKTOP_EXAMPLE, NIKE_MOBILE_EXAMPLE } from './nike-examples';
import { 
  safeSavePendingCost, 
  safeSaveSale, 
  safeSaveInventory,
  safeBulkSavePendingCosts,
  safeBulkSaveInventory,
  safeBulkSaveSales,
  safeConfirmSale,
  safeDeletePendingCost,
  safeDeleteSale,
  safeDeleteInventory,
  safeUpdateSale,
  safeUpdateInventory,
  safeSaveExpense,
  safeDeleteExpense,
  safeSaveStorageFee,
  safeDeleteStorageFee,
  safeSaveMileage,
  safeDeleteMileage,
  safeBulkDeletePending,
  safeDeleteAllPending,
  safeDeleteAllInventory,
  safeDeleteAllSales,
  safeDeleteAllExpenses,
  checkOrderExists
} from './safeDatabase';
import { AutoMatchButton } from './autoMatch.jsx';
import { syncStockXSales, syncEbaySales, transformPendingForDisplay } from './syncModule';
import { storeEbayTokens, getValidEbayToken, clearEbayTokens } from './ebayTokenHelper';
// ═══════════════════════════════════════════════════════════════════════
// AUTO-DELIST: Store tokens server-side for 24/7 automatic delisting
// ═══════════════════════════════════════════════════════════════════════
async function linkTokensToServer(platform, accessToken, refreshToken, expiresIn) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('[Auto-Delist] No session, skipping server token storage');
      return;
    }
    
    const response = await fetch('/api/link-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        platform: platform,
        access_token: accessToken,
        refresh_token: refreshToken || null,
        expires_in: expiresIn || 7200
      })
    });
    
    if (response.ok) {
      console.log(`[Auto-Delist] ✓ ${platform} tokens stored server-side for 24/7 delisting`);
    } else {
      console.error(`[Auto-Delist] Failed to store ${platform} tokens:`, await response.text());
    }
  } catch (e) {
    console.error(`[Auto-Delist] Error storing ${platform} tokens:`, e);
  }
}
// Auth Component - Login/Signup Page
function AuthPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          alert('Check your email for confirmation link!');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          onLogin(data.user);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const c = {
    bg: '#0a0a0a',
    card: '#111111',
    border: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#888888',
    gold: '#C9A962',
    goldDark: '#B8943F',
    green: '#10b981',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: c.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: 24,
        padding: 40
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64,
            height: 64,
            background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`,
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 24,
            color: '#000',
            marginBottom: 16
          }}>FL</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: c.gold }}>FLIPLEDGER</h1>
          <p style={{ margin: '8px 0 0', color: c.textMuted, fontSize: 14 }}>Wealth Intelligence for Resellers</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: c.textMuted }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 14,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                color: c.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: c.textMuted }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: 14,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                color: c.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`,
              border: 'none',
              borderRadius: 12,
              color: '#000',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {/* Toggle */}
        <p style={{ textAlign: 'center', marginTop: 24, color: c.textMuted, fontSize: 14 }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              background: 'none',
              border: 'none',
              color: c.gold,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

// Helper: Get icon based on product name
const getProductIcon = (name) => {
  if (!name) return '📦';
  const n = name.toLowerCase();
  
  // Electronics
  if (n.includes('playstation') || n.includes('ps5') || n.includes('ps4') || 
      n.includes('xbox') || n.includes('nintendo') || n.includes('console')) return '🎮';
  if (n.includes('iphone') || n.includes('phone')) return '📱';
  if (n.includes('macbook') || n.includes('laptop') || n.includes('ipad')) return '💻';
  if (n.includes('airpod') || n.includes('headphone')) return '🎧';
  
  // Clothing
  if (n.includes('hoodie') || n.includes('sweatshirt') || n.includes('jacket') || 
      n.includes('fleece') || n.includes('pullover') || n.includes('puffer')) return '🧥';
  if (n.includes('tee') || n.includes('t-shirt') || n.includes('shirt') || n.includes('jersey')) return '👕';
  if (n.includes('pants') || n.includes('jogger') || n.includes('jean')) return '👖';
  if (n.includes('hat') || n.includes('cap') || n.includes('beanie')) return '🧢';
  if (n.includes('bag') || n.includes('backpack')) return '👜';
  
  // Default to shoe
  return '👟';
};

// Clean icon component with emoji
const ProductIcon = ({ name, size = 44 }) => {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      background: '#151515',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.45
    }}>
      {getProductIcon(name)}
    </div>
  );
};

// Error Boundary for production stability
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('FlipLedger Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 40 }}>
          <h1 style={{ fontSize: 48, marginBottom: 16 }}>😵</h1>
          <h2 style={{ marginBottom: 16 }}>Something went wrong</h2>
          <p style={{ color: '#888', marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
            Don't worry - your data is safe in your browser. Try refreshing the page.
          </p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Refresh Page
          </button>
          <details style={{ marginTop: 24, color: '#666', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8, maxWidth: 500, overflow: 'auto' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mobile Dashboard Component - Premium, same energy as desktop
function MobileDashboard({ 
  netProfit, totalRevenue, totalCOGS, totalFees, inventoryVal, 
  filteredSales, pendingCosts, goals, year, 
  c, fmt, setPage 
}) {
  const pendingCount = pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length;
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(0) : 0;

  // Monthly data for chart
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const monthNum = String(i + 1).padStart(2, '0');
    const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
    return {
      revenue: monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0),
      profit: monthSales.reduce((sum, s) => sum + (s.profit || 0), 0),
      count: monthSales.length
    };
  });
  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1);

  return (
    <div>
      {/* Pending Costs Alert - Pulsing */}
      {pendingCount > 0 && (
        <div 
          onClick={() => setPage('import')}
          className="pending-pulse"
          style={{ 
            background: 'rgba(251,191,36,0.1)', 
            border: '1px solid rgba(251,191,36,0.2)', 
            borderRadius: 14, 
            padding: '14px 16px', 
            marginBottom: 16, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 10, height: 10 }}>
              <div className="pulse-ring" style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: '#fbbf24', opacity: 0.3 }} />
              <div className="pulse-glow" style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 15px #fbbf24' }} />
            </div>
            <span style={{ color: c.gold, fontWeight: 600, fontSize: 14 }}>{pendingCount} sales need cost basis</span>
          </div>
          <div style={{ padding: '6px 14px', background: c.gold, borderRadius: 8, fontWeight: 700, fontSize: 12, color: '#000' }}>REVIEW</div>
        </div>
      )}

      {/* HERO PROFIT CARD - Full Premium Feel */}
      <div style={{
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: 20,
        padding: '28px 24px',
        marginBottom: 16,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Animated top border */}
        <div className="border-flow" style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, 
          background: `linear-gradient(90deg, transparent, ${c.gold}, ${c.green}, ${c.gold}, transparent)`, 
          backgroundSize: '200% 100%' 
        }} />
        
        {/* Breathing glow */}
        <div className="breathe" style={{ 
          position: 'absolute', top: -80, right: -60, width: 250, height: 250, 
          background: `radial-gradient(circle, rgba(201,169,98,0.15) 0%, transparent 60%)`, 
          pointerEvents: 'none' 
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header with LIVE badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', color: c.textDim, textTransform: 'uppercase' }}>Net Profit YTD</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 100 }}>
              <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: c.green, letterSpacing: '1px' }}>LIVE</span>
            </div>
          </div>
          
          {/* Big Profit Number */}
          <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', marginBottom: 12 }}>
            <span style={{ color: c.gold, textShadow: `0 0 30px rgba(201,169,98,0.4)` }}>$</span>
            <span style={{ 
              background: 'linear-gradient(180deg, #FFFFFF 0%, #34D399 100%)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent', 
              filter: 'drop-shadow(0 0 20px rgba(52,211,153,0.4))' 
            }}>
              {Math.abs(netProfit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          </div>
          
          {/* Stats row */}
          <div style={{ fontSize: 13, color: c.textMuted }}>
            <span style={{ color: c.green, fontWeight: 600 }}>↑ {marginPct}%</span>
            <span style={{ margin: '0 8px' }}>·</span>
            {filteredSales.length} transactions
          </div>

          {/* Margin Ring - Compact */}
          <div style={{ 
            position: 'absolute', 
            top: 20, 
            right: 0, 
            width: 100, 
            height: 100 
          }}>
            <div className="spin-slow" style={{ 
              position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, 
              border: '1px dashed rgba(201,169,98,0.3)', 
              borderRadius: '50%' 
            }} />
            <svg width="100" height="100" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 0 15px rgba(201,169,98,0.3))' }}>
              <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <circle className="ring-pulse" cx="50" cy="50" r="38" fill="none" stroke="url(#mobileMarginGrad)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${totalRevenue > 0 ? Math.max(0, marginPct) * 2.39 : 0} 239`} />
              <defs><linearGradient id="mobileMarginGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={c.green} /><stop offset="100%" stopColor={c.gold} /></linearGradient></defs>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '1px', color: c.textDim, textTransform: 'uppercase' }}>Margin</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: c.gold, textShadow: '0 0 20px rgba(201,169,98,0.4)' }}>{marginPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* STATS ROW - 2x2 Grid with shimmer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Gross Revenue', value: totalRevenue, icon: '📈', color: c.gold, glow: 'rgba(201,169,98,0.3)' },
          { label: 'Cost of Goods', value: totalCOGS, icon: '💎', color: c.green, glow: 'rgba(52,211,153,0.3)' },
          { label: 'Platform Fees', value: totalFees, icon: '⚡', color: c.red, glow: 'rgba(248,113,113,0.3)' },
          { label: 'Inventory Value', value: inventoryVal, icon: '🏦', color: '#8B5CF6', glow: 'rgba(139,92,246,0.3)' },
        ].map((stat, i) => (
          <div key={i} className="stat-card-hover" style={{
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 16,
            padding: '20px 16px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Shimmer line */}
            <div className="shimmer-line" style={{ 
              position: 'absolute', top: 0, left: 0, right: 0, height: 2, 
              background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` 
            }} />
            
            {/* Pulse dot */}
            <div className="pulse-glow" style={{ 
              position: 'absolute', top: 14, right: 14, width: 6, height: 6, 
              background: stat.color, borderRadius: '50%', 
              boxShadow: `0 0 10px ${stat.color}`,
              animationDelay: `${i * 0.5}s`
            }} />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ 
                width: 36, height: 36, borderRadius: 10, 
                background: 'rgba(255,255,255,0.03)', 
                border: `1px solid ${c.border}`, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontSize: 16 
              }}>{stat.icon}</div>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 500, color: c.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: stat.color, textShadow: `0 0 15px ${stat.glow}` }}>{fmt(stat.value)}</p>
          </div>
        ))}
      </div>

      {/* MONTHLY BREAKDOWN - Compact Table */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Monthly Breakdown</h3>
          <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => {
            const data = monthlyData[i];
            if (data.count === 0) return null;
            return (
              <div key={month} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px 20px', 
                borderBottom: `1px solid ${c.border}` 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="pulse-glow" style={{ width: 5, height: 5, background: c.green, borderRadius: '50%' }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{month}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: c.textMuted }}>{data.count}</span>
                  <span style={{ fontSize: 12, color: c.textMuted }}>{fmt(data.revenue)}</span>
                  <span style={{ 
                    fontSize: 13, fontWeight: 700, color: c.green,
                    background: 'rgba(16,185,129,0.1)', 
                    padding: '4px 10px', 
                    borderRadius: 6 
                  }}>+{fmt(data.profit)}</span>
                </div>
              </div>
            );
          })}
          {/* Total row */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '14px 20px', 
            background: 'rgba(16,185,129,0.08)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
              <span style={{ fontWeight: 800, fontSize: 13 }}>TOTAL</span>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{filteredSales.length}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(totalRevenue)}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: c.green, textShadow: '0 0 15px rgba(16,185,129,0.4)' }}>+{fmt(netProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PERFORMANCE CHART - Bars */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Performance Chart</h3>
            <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%' }} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 100, padding: '5px 12px' }}>
            <div className="pulse-glow" style={{ width: 5, height: 5, background: c.green, borderRadius: '50%' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: c.green, letterSpacing: '0.5px' }}>REALTIME</span>
          </div>
        </div>
        <div style={{ padding: '20px 16px' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
            {[{ label: 'Revenue', color: 'rgba(255,255,255,0.5)' }, { label: 'Profit', color: '#10b981' }].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                <span style={{ fontSize: 11, color: c.textMuted }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Bars */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, paddingBottom: 24, position: 'relative' }}>
            {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((month, i) => {
              const data = monthlyData[i];
              const revHeight = data.revenue > 0 ? Math.max((data.revenue / maxRevenue) * 70, 3) : 0;
              const profitHeight = data.profit > 0 ? Math.max((data.profit / maxRevenue) * 70, 3) : 0;
              const hasData = data.revenue > 0;
              
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 70, width: '100%' }}>
                    <div style={{ 
                      width: hasData ? 8 : 4, 
                      height: hasData ? revHeight : 2,
                      background: hasData 
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 100%)' 
                        : 'rgba(255,255,255,0.05)',
                      borderRadius: hasData ? 3 : 1
                    }} />
                    <div style={{ 
                      width: hasData ? 8 : 4, 
                      height: hasData ? profitHeight : 2,
                      background: hasData 
                        ? 'linear-gradient(180deg, #10b981 0%, rgba(16,185,129,0.4) 100%)' 
                        : 'rgba(16,185,129,0.08)',
                      borderRadius: hasData ? 3 : 1,
                      boxShadow: hasData ? '0 0 8px rgba(16,185,129,0.3)' : 'none'
                    }} />
                  </div>
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 600, 
                    color: hasData ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                    marginTop: 6
                  }}>{month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// SalesPage as separate component for proper re-rendering
function SalesPage({ filteredSales, formData, setFormData, salesPage, setSalesPage, selectedSales, setSelectedSales, sales, setSales, settings, setModal, ITEMS_PER_PAGE, cardStyle, btnPrimary, c, fmt, exportCSV, deleteSaleFromSupabase, markSaleRefunded, isMobile }) {
  // Filter
  const searchTerm = (formData.salesSearch || '').toLowerCase().trim();
  const platformFilter = formData.salesFilter || 'all';
  const monthFilter = formData.salesMonth || 'all';
  const sortBy = formData.salesSort || 'newest';
  
  const filtered = filteredSales.filter(s => {
    if (searchTerm) {
      const inName = s.name && s.name.toLowerCase().includes(searchTerm);
      const inSku = s.sku && s.sku.toLowerCase().includes(searchTerm);
      const inSize = s.size && s.size.toString().toLowerCase().includes(searchTerm);
      if (!inName && !inSku && !inSize) return false;
    }
    if (platformFilter !== 'all' && s.platform !== platformFilter) return false;
    if (monthFilter !== 'all' && (!s.saleDate || s.saleDate.substring(5, 7) !== monthFilter)) return false;
    return true;
  });
  
  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch(sortBy) {
      case 'oldest': return new Date(a.saleDate || 0) - new Date(b.saleDate || 0);
      case 'newest': return new Date(b.saleDate || 0) - new Date(a.saleDate || 0);
      case 'nameAZ': return (a.name || '').localeCompare(b.name || '');
      case 'nameZA': return (b.name || '').localeCompare(a.name || '');
      case 'skuAZ': return (a.sku || '').localeCompare(b.sku || '');
      case 'skuZA': return (b.sku || '').localeCompare(a.sku || '');
      case 'sizeAsc': return parseFloat(a.size || 0) - parseFloat(b.size || 0);
      case 'sizeDesc': return parseFloat(b.size || 0) - parseFloat(a.size || 0);
      case 'platformAZ': return (a.platform || '').localeCompare(b.platform || '');
      case 'costLow': return (a.cost || 0) - (b.cost || 0);
      case 'costHigh': return (b.cost || 0) - (a.cost || 0);
      case 'priceLow': return (a.salePrice || 0) - (b.salePrice || 0);
      case 'priceHigh': return (b.salePrice || 0) - (a.salePrice || 0);
      case 'feesLow': return (a.fees || 0) - (b.fees || 0);
      case 'feesHigh': return (b.fees || 0) - (a.fees || 0);
      case 'profitLow': return (a.profit || 0) - (b.profit || 0);
      case 'profitHigh': return (b.profit || 0) - (a.profit || 0);
      default: return new Date(b.saleDate || 0) - new Date(a.saleDate || 0);
    }
  });
  
  // Paginate
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const page = Math.min(salesPage, pages);
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, total);
  const items = sorted.slice(start, end);
  const itemIds = items.map(s => s.id);
  const allSelected = items.length > 0 && itemIds.every(id => selectedSales.has(id));
  const profit = sorted.reduce((sum, s) => sum + (s.profit || 0), 0);
   const groupedBySku = items.reduce((acc, s) => { const key = s.sku || s.name || 'Unknown'; if (!acc[key]) acc[key] = { name: s.name, sku: s.sku, image: s.image, items: [] }; acc[key].items.push(s); return acc; }, {});

  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
      <div style={{ ...cardStyle, padding: 16 }}><span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL SALES</span><p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{total}</p></div>
      <div style={{ ...cardStyle, padding: 16 }}><span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL PROFIT</span><p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: profit >= 0 ? c.green : c.red }}>{fmt(profit)}</p></div>
    </div>

    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <input type="text" placeholder="🔍 Search by name, SKU, or size..." value={formData.salesSearch || ''} onChange={e => { setFormData({ ...formData, salesSearch: e.target.value }); setSalesPage(1); }} style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} />
      <select value={formData.salesMonth || 'all'} onChange={e => { setFormData({ ...formData, salesMonth: e.target.value }); setSalesPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13 }}>
        <option value="all">All Months</option><option value="01">January</option><option value="02">February</option><option value="03">March</option><option value="04">April</option><option value="05">May</option><option value="06">June</option><option value="07">July</option><option value="08">August</option><option value="09">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option>
      </select>
      <select value={formData.salesFilter || 'all'} onChange={e => { setFormData({ ...formData, salesFilter: e.target.value }); setSalesPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13 }}>
        <option value="all">All Platforms</option><option value="StockX Standard">StockX Standard</option><option value="StockX Direct">StockX Direct</option><option value="StockX Flex">StockX Flex</option><option value="GOAT">GOAT</option><option value="eBay">eBay</option><option value="Local">Local</option>
      </select>
      <button onClick={() => { setFormData({}); setModal('sale'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ RECORD SALE</button>
    </div>

    <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => {
          const freshIds = [];
          for (let i = 0; i < items.length; i++) {
            if (items[i] && items[i].id !== undefined && items[i].id !== null) {
              freshIds.push(items[i].id);
            }
          }
          console.log('Selecting', freshIds.length, 'items with IDs:', freshIds);
          const selected = {};
          freshIds.forEach(id => { selected[id] = true; });
          setSelectedSales(new Set(Object.keys(selected).map(k => isNaN(Number(k)) ? k : Number(k))));
        }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: c.green, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Select Page ({items.length})</button>
        {selectedSales.size > 0 && <button onClick={() => setSelectedSales(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>✗ Clear</button>}
      </div>
      <span style={{ fontSize: 13, color: selectedSales.size > 0 ? c.green : c.textMuted, fontWeight: selectedSales.size > 0 ? 700 : 400 }}>{selectedSales.size > 0 ? `${selectedSales.size} selected` : 'None selected'}</span>
    </div>

    {selectedSales.size > 0 && <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 700, color: c.red, fontSize: 14 }}>🗑️ {selectedSales.size} sale{selectedSales.size > 1 ? 's' : ''} selected</span>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setSelectedSales(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>Clear Selection</button>
        <button onClick={async () => { if(confirm(`Delete ${selectedSales.size} sale${selectedSales.size > 1 ? 's' : ''}? This cannot be undone.`)) { for (const id of selectedSales) { await deleteSaleFromSupabase(id); } setSales(sales.filter(s => !selectedSales.has(s.id))); setSelectedSales(new Set()); }}} style={{ padding: '8px 20px', background: c.red, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🗑️ Delete {selectedSales.size} Sale{selectedSales.size > 1 ? 's' : ''}</button>
      </div>
    </div>}

    <div style={cardStyle}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: c.textMuted }}>{total > 0 ? `Showing ${start + 1}-${end} of ${total}` : 'No sales'}</span>
        <button onClick={() => exportCSV(sorted, 'sales.csv', ['saleDate','name','sku','size','platform','salePrice','cost','fees','profit'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
      </div>

      {isMobile ? (
        <div style={{ padding: 12 }}>
      {Object.keys(groupedBySku).length > 0 ? Object.entries(groupedBySku).map(([key, group]) => (
            <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
              <div onClick={() => { const el = document.getElementById('sales-group-' + key.replace(/[^a-zA-Z0-9]/g, '')); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'; }} style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</div>
                  <div style={{ fontSize: 11, color: c.green }}>{group.sku || '-'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{group.items.length} sale{group.items.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: group.items.reduce((s, i) => s + (i.profit || 0), 0) >= 0 ? c.green : c.red }}>{fmt(group.items.reduce((s, i) => s + (i.profit || 0), 0))}</div>
                </div>
              </div>
              <div id={'sales-group-' + key.replace(/[^a-zA-Z0-9]/g, '')} style={{ display: 'none' }}>
                {group.items.map(s => (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px 40px 55px 55px 55px 55px 28px', padding: '8px 10px', borderBottom: `1px solid rgba(255,255,255,0.03)`, gap: 4, alignItems: 'center', background: selectedSales.has(s.id) ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
                    <input type="checkbox" checked={selectedSales.has(s.id)} onChange={e => { const n = new Set(selectedSales); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelectedSales(n); }} style={{ width: 16, height: 16, accentColor: c.green }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{s.size || '-'}</span>
                    <span style={{ fontSize: 9, color: c.textMuted }}>{s.saleDate ? s.saleDate.substring(5) : '-'}</span>
                    <span style={{ fontSize: 11, textAlign: 'right', color: c.gold }}>{fmt(s.cost)}</span>
                    <span style={{ fontSize: 11, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'right', color: s.profit >= 0 ? c.green : c.red }}>{s.profit >= 0 ? '+' : ''}{fmt(s.profit)}</span>
                    <button onClick={() => { setFormData({ editSaleId: s.id, saleName: s.name, saleSku: s.sku, saleSize: s.size, saleCost: s.cost, salePrice: s.salePrice, saleDate: s.saleDate, platform: s.platform, saleImage: s.image, sellerLevel: s.sellerLevel || settings.stockxLevel }); setModal('editSale'); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 12, padding: 2 }}>✏️</button>
                  </div>
                ))}
              </div>
            </div>
          )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💵</div><p style={{ color: c.textMuted }}>No sales</p></div>}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '36px 52px 80px 1fr 100px 45px 90px 65px 65px 60px 70px 28px 28px', padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', gap: 8, alignItems: 'center' }}>
            <div><input type="checkbox" checked={allSelected} onChange={e => setSelectedSales(e.target.checked ? new Set(itemIds) : new Set())} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} /></div>
            <span></span>
            <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'oldest' ? 'newest' : 'oldest' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'oldest' || sortBy === 'newest') ? c.green : c.textMuted, cursor: 'pointer' }}>DATE {sortBy === 'oldest' ? '▲' : sortBy === 'newest' ? '▼' : ''}</span>
            <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'nameAZ' ? 'nameZA' : 'nameAZ' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'nameAZ' || sortBy === 'nameZA') ? c.green : c.textMuted, cursor: 'pointer' }}>ITEM {sortBy === 'nameAZ' ? '▲' : sortBy === 'nameZA' ? '▼' : ''}</span>
            <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'skuAZ' ? 'skuZA' : 'skuAZ' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'skuAZ' || sortBy === 'skuZA') ? c.green : c.textMuted, cursor: 'pointer' }}>SKU {sortBy === 'skuAZ' ? '▲' : sortBy === 'skuZA' ? '▼' : ''}</span>
            <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'sizeAsc' ? 'sizeDesc' : 'sizeAsc' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'sizeAsc' || sortBy === 'sizeDesc') ? c.green : c.textMuted, cursor: 'pointer' }}>SIZE {sortBy === 'sizeAsc' ? '▲' : sortBy === 'sizeDesc' ? '▼' : ''}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>PLATFORM</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PRICE</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>FEES</span>
            <span onClick={() => { setFormData({ ...formData, salesSort: sortBy === 'profitLow' ? 'profitHigh' : 'profitLow' }); setSalesPage(1); }} style={{ fontSize: 10, fontWeight: 700, color: (sortBy === 'profitLow' || sortBy === 'profitHigh') ? c.green : c.textMuted, cursor: 'pointer', textAlign: 'right' }}>PROFIT {sortBy === 'profitLow' ? '▲' : sortBy === 'profitHigh' ? '▼' : ''}</span>
            <span></span><span></span>
          </div>

          {items.length > 0 ? items.map(s => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '36px 52px 80px 1fr 100px 45px 90px 65px 65px 60px 70px 28px 28px', padding: '12px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', gap: 8, background: selectedSales.has(s.id) ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
              <div><input type="checkbox" checked={selectedSales.has(s.id)} onChange={e => { const n = new Set(selectedSales); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelectedSales(n); }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} /></div>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                <ProductIcon name={s.name} size={44} />
                {s.image && (
                  <img 
                    src={s.image} 
                    alt="" 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} 
                    onError={(e) => { e.target.style.display = 'none'; }} 
                  />
                )}
              </div>
              <span style={{ fontSize: 11, color: c.textMuted }}>{s.saleDate}</span>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span style={{ fontSize: 10, color: c.green }}>{s.sku || '-'}</span>
              <span style={{ fontSize: 12, textAlign: 'center' }}>{s.size || '-'}</span>
              <span style={{ fontSize: 10, color: c.textMuted }}>{s.platform}</span>
              <span style={{ fontSize: 11, textAlign: 'right', color: c.textMuted }}>{fmt(s.cost)}</span>
              <span style={{ fontSize: 11, textAlign: 'right' }}>{fmt(s.salePrice)}</span>
              <span style={{ fontSize: 11, textAlign: 'right', color: c.red }}>{fmt(s.fees)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: s.profit >= 0 ? c.green : c.red }}>{s.profit >= 0 ? '+' : ''}{fmt(s.profit)}</span>
             {s.platform?.toLowerCase().includes('ebay') && !s.refunded && <button onClick={() => markSaleRefunded(s)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 12, padding: 4 }} title="Mark as Refunded">↩️</button>}
              {s.refunded && <span style={{ fontSize: 10, background: '#f59e0b', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>REFUNDED</span>}
              <button onClick={() => { setFormData({ editSaleId: s.id, saleName: s.name, saleSku: s.sku, saleSize: s.size, saleCost: s.cost, salePrice: s.salePrice, saleDate: s.saleDate, platform: s.platform, saleImage: s.image, sellerLevel: s.sellerLevel || settings.stockxLevel }); setModal('editSale'); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14, padding: 4 }}>✏️</button>
              <button onClick={() => { deleteSaleFromSupabase(s.id); setSales(sales.filter(x => x.id !== s.id)); setSelectedSales(prev => { const n = new Set(prev); n.delete(s.id); return n; }); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
            </div>
          )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💵</div><p style={{ color: c.textMuted }}>No sales</p></div>}
        </>
      )}
      
      {pages > 1 && <div style={{ padding: '16px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button onClick={() => setSalesPage(1)} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>«</button>
        <button onClick={() => setSalesPage(page - 1)} disabled={page === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === 1 ? c.textMuted : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>‹</button>
        {[...Array(Math.min(5, pages))].map((_, i) => { let n = pages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= pages - 2 ? pages - 4 + i : page - 2 + i; return <button key={n} onClick={() => setSalesPage(n)} style={{ padding: '8px 14px', background: page === n ? c.green : 'rgba(255,255,255,0.05)', border: `1px solid ${page === n ? c.green : c.border}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: page === n ? 700 : 400 }}>{n}</button>; })}
        <button onClick={() => setSalesPage(page + 1)} disabled={page === pages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === pages ? c.textMuted : '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12 }}>›</button>
        <button onClick={() => setSalesPage(pages)} disabled={page === pages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: page === pages ? c.textMuted : '#fff', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: 12 }}>»</button>
      </div>}
    </div>
  </div>;
}


function App() {
  // Auth state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  
  // App state
  const [page, setPage] = useState(() => localStorage.getItem('flipledger_page') || 'dashboard');
  useEffect(() => { localStorage.setItem('flipledger_page', page); }, [page]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 850);
  const [year, setYear] = useState('2026');
  const [stockxImport, setStockxImport] = useState({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  const [ebayImport, setEbayImport] = useState({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  const [ebayApiFilter, setEbayApiFilter] = useState({ year: new Date().getFullYear().toString(), month: 'all' });
  const [stockxApiFilter, setStockxApiFilter] = useState({ year: new Date().getFullYear().toString(), month: 'all' });
  
  // Data state - initialized empty, loaded from Supabase
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [storageFees, setStorageFees] = useState([]);
  const [mileage, setMileage] = useState([]);
  const [goals, setGoals] = useState({ monthly: 3000, yearly: 25000 });
  const [formData, setFormData] = useState({});
  const [settings, setSettings] = useState({ stockxLevel: 9, stockxProcessing: 3, stockxQuickShip: false, stockxDirectFee: 5, stockxDirectProcessing: 3, stockxFlexFee: 5, stockxFlexProcessing: 3, stockxFlexFulfillment: 5, goatFee: 9.5, goatProcessing: 2.9, ebayFee: 12.9, mileageRate: 0.67 });
  const [pendingCosts, setPendingCosts] = useState([]);
  const [savedReceipts, setSavedReceipts] = useState([]);
  
  // Connection state
  const [stockxConnected, setStockxConnected] = useState(false);
  const [stockxToken, setStockxToken] = useState(null);
  const [goatConnected, setGoatConnected] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [ebayToken, setEbayToken] = useState(null);
  const [ebayPolicies, setEbayPolicies] = useState({ fulfillment: [], payment: [], return: [] });
  const [selectedPolicies, setSelectedPolicies] = useState({ fulfillment: '', payment: '', return: '' });
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesSaved, setPoliciesSaved] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [stockxSyncing, setStockxSyncing] = useState(false);
  const [ebaySyncing, setEbaySyncing] = useState(false);
  const [goatSyncing, setGoatSyncing] = useState(false);
  
  // UI state
  const [selectedPending, setSelectedPending] = useState(new Set());
  const [bulkCost, setBulkCost] = useState('');
  const [selectedSales, setSelectedSales] = useState(new Set());
  const [selectedInventory, setSelectedInventory] = useState(new Set());
  const [salesPage, setSalesPage] = useState(1);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [invLookupSearch, setInvLookupSearch] = useState('');
  const [invLookupLimit, setInvLookupLimit] = useState(50);
  const [selectedPendingItem, setSelectedPendingItem] = useState(null);
  const [showInvCsvImport, setShowInvCsvImport] = useState(false);
  const [selectedInvLookup, setSelectedInvLookup] = useState(new Set());
  const [nikeReceipt, setNikeReceipt] = useState({ scanning: false, items: [], image: null, date: '', orderNum: '' });
  const [showNikeExample, setShowNikeExample] = useState(false);
  const [expandedInvProducts, setExpandedInvProducts] = useState(new Set());
  const [expandPages, setExpandPages] = useState({});
  const [mobileInvDrawer, setMobileInvDrawer] = useState(null);

  const ITEMS_PER_PAGE = 50;
const loadedUserRef = useRef(null);
  // Check for existing session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load data from Supabase when user logs in
  useEffect(() => {
    if (!user) {
      setDataLoading(false);
      return;
  }

    if (loadedUserRef.current === user.id) {
      setDataLoading(false);
      return;
    }
    loadedUserRef.current = user.id;

    const loadData = async () => {
      setDataLoading(true);
      try {
        // Load inventory
        const { data: inventoryData, error: invError } = await supabase
          .from('inventory')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (invError) console.error('Inventory load error:', invError);
        if (inventoryData && inventoryData.length > 0) {
          setPurchases(inventoryData.map(item => ({
            id: item.id,
            name: item.name || '',
            sku: item.sku || '',
            size: item.size || '',
            cost: parseFloat(item.cost) || 0,
            quantity: item.quantity || 1,
            date: item.date || '',
            sold: item.sold || false
          })));
        }

        // Load sales
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (salesError) console.error('Sales load error:', salesError);
        if (salesData && salesData.length > 0) {
          setSales(salesData.map(item => ({
            id: item.id,
            name: item.name || '',
            sku: item.sku || '',
            size: item.size || '',
            cost: parseFloat(item.cost) || 0,
            salePrice: parseFloat(item.sale_price) || 0,
            platform: item.platform || '',
            fees: parseFloat(item.fees) || 0,
            profit: parseFloat(item.profit) || 0,
            saleDate: item.sale_date || '',
            refunded: item.refunded || false,
            refundAmount: parseFloat(item.refund_amount) || 0
          })));
        }

        // Load expenses
        const { data: expensesData, error: expError } = await supabase
          .from('expenses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (expError) console.error('Expenses load error:', expError);
        if (expensesData && expensesData.length > 0) {
          setExpenses(expensesData.map(item => ({
            id: item.id,
            description: item.description || '',
            amount: parseFloat(item.amount) || 0,
            category: item.category || '',
            date: item.date || ''
          })));
        }

        // Load pending costs
        const { data: pendingData, error: pendError } = await supabase
          .from('pending_costs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (pendError) console.error('Pending load error:', pendError);
        if (pendingData && pendingData.length > 0) {
          setPendingCosts(pendingData.map(item => ({
            id: item.id,
            name: item.name || '',
            sku: item.sku || '',
            size: item.size || '',
            salePrice: parseFloat(item.sale_price) || 0,
            platform: item.platform || '',
            fees: parseFloat(item.fees) || 0,
            saleDate: item.sale_date || '',
            payout: parseFloat(item.payout) || 0,
            image: item.image || ''
          })));
        }

        // Load storage fees
        const { data: storageData, error: storageError } = await supabase
          .from('storage_fees')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (storageError) console.error('Storage fees load error:', storageError);
        if (storageData && storageData.length > 0) {
          setStorageFees(storageData.map(item => ({
            id: item.id,
            month: item.month || '',
            amount: parseFloat(item.amount) || 0,
            notes: item.notes || ''
          })));
        }

        // Load mileage
        const { data: mileageData, error: mileageError } = await supabase
          .from('mileage')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }).range(0, 999999);
        if (mileageError) console.error('Mileage load error:', mileageError);
        if (mileageData && mileageData.length > 0) {
          setMileage(mileageData.map(item => ({
            id: item.id,
            date: item.date || '',
            miles: parseFloat(item.miles) || 0,
            purpose: item.purpose || 'Pickup/Dropoff',
            from: item.from_location || '',
            to: item.to_location || ''
          })));
        }

        // Load settings from localStorage (user-specific settings stay local for now)
        const savedSettings = localStorage.getItem(`flipledger_settings_${user.id}`);
        if (savedSettings) setSettings(JSON.parse(savedSettings));

        const savedGoals = localStorage.getItem(`flipledger_goals_${user.id}`);
        if (savedGoals) setGoals(JSON.parse(savedGoals));

        // Load tokens from localStorage
        const stockxTok = localStorage.getItem('flipledger_stockx_token');
        if (stockxTok) {
          setStockxToken(stockxTok);
          setStockxConnected(true);
        }

        const ebayTok = await getValidEbayToken((newToken) => {
          setEbayToken(newToken);
        });
       if (ebayTok) {
          setEbayToken(ebayTok);
          setEbayConnected(true);
        }

        // Fetch eBay business policies
        async function loadEbayPolicies(token) {
          setPoliciesLoading(true);
          try {
            const res = await fetch('/api/ebay-policies', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.policies) {
                setEbayPolicies(data.policies);
              }
            }
          } catch (err) {
            console.error('Failed to fetch eBay policies:', err);
          } finally {
            setPoliciesLoading(false);
          }
        }

        if (ebayTok) loadEbayPolicies(ebayTok);
        

      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Track window resize for mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 850);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============ LEGACY FUNCTION WRAPPERS (now use safeDatabase.js) ============
  // These are kept for backward compatibility but delegate to safe functions

  const saveInventoryToSupabase = async (item, isNew = true) => {
    if (!user) return null;
    if (isNew) {
      const result = await safeSaveInventory(user.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        cost: item.cost,
        quantity: item.quantity || 1,
        date: item.date
      });
      return result.success ? result.data.id : null;
    } else {
      const result = await safeUpdateInventory(user.id, item.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        cost: item.cost,
        quantity: item.quantity || 1,
        date: item.date,
        sold: item.sold || false
      });
      return result.success ? item.id : null;
    }
  };

  const deleteInventoryFromSupabase = async (id) => {
    if (!user) return;
    await safeDeleteInventory(user.id, id);
  };

  const saveSaleToSupabase = async (item, isNew = true) => {
    if (!user) return null;
    if (isNew) {
      const result = await safeSaveSale(user.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        cost: item.cost,
        sale_price: item.salePrice,
        platform: item.platform,
        fees: item.fees,
        profit: item.profit,
        sale_date: item.saleDate
      });
      return result.success ? result.data.id : null;
    } else {
      const result = await safeUpdateSale(user.id, item.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        cost: item.cost,
        sale_price: item.salePrice,
        platform: item.platform,
        fees: item.fees,
        profit: item.profit,
        sale_date: item.saleDate
      });
      return result.success ? item.id : null;
    }
  };

  const markSaleRefunded = async (sale) => {
    if (!user) return;
    if (!confirm(`Mark this eBay sale as refunded for $${sale.salePrice}?`)) return;
    await supabase.from('sales').update({
      refunded: true,
      refund_amount: sale.salePrice,
      refund_date: new Date().toISOString().split('T')[0]
    }).eq('id', sale.id).eq('user_id', user.id);
    setSales(sales.map(s => s.id === sale.id ? { ...s, refunded: true, refundAmount: sale.salePrice } : s));
  };
  const deleteSaleFromSupabase = async (id) => {
    if (!user) return;
    await safeDeleteSale(user.id, id);
  };

  const savePendingToSupabase = async (item, isNew = true) => {
    if (!user) return null;
    if (isNew) {
      const result = await safeSavePendingCost(user.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        sale_price: item.salePrice,
        platform: item.platform,
        fees: item.fees,
        sale_date: item.saleDate,
        order_id: item.orderId || null
      });
      return result.success ? result.data.id : null;
    } else {
      // For updates, we just delete and re-add since pending costs don't have an update function
      await safeDeletePendingCost(user.id, item.id);
      const result = await safeSavePendingCost(user.id, {
        name: item.name,
        sku: item.sku,
        size: item.size,
        sale_price: item.salePrice,
        platform: item.platform,
        fees: item.fees,
        sale_date: item.saleDate,
        order_id: item.orderId || null
      });
      return result.success ? result.data.id : null;
    }
  };

  const deletePendingFromSupabase = async (id) => {
    if (!user) return;
    await safeDeletePendingCost(user.id, id);
  };

  const bulkSavePendingToSupabase = async (items) => {
    if (!user || items.length === 0) return [];
    // Transform to safeDatabase format
    const transformedItems = items.map(item => ({
      name: item.name,
      sku: item.sku || '',
      size: item.size || '',
      sale_price: item.salePrice ?? item.sale_price ?? 0,
      platform: item.platform || 'Other',
      fees: item.fees || 0,
      sale_date: item.saleDate || item.sale_date || null,
      payout: item.payout || null,
      image: item.image || null,
      order_id: item.orderId || item.order_id || null
    }));
    const result = await safeBulkSavePendingCosts(user.id, transformedItems);
    return result.saved || [];
  };

  const bulkSaveInventoryToSupabase = async (items) => {
    console.log('bulkSaveInventoryToSupabase called with:', items);
    console.log('Current user:', user);
    if (!user || items.length === 0) {
      console.log('No user or empty items, returning []');
      return [];
    }
    // Transform to safeDatabase format
    const transformedItems = items.map(item => ({
      name: item.name,
      sku: item.sku || '',
      size: item.size || '',
      cost: item.cost ?? 0,
      quantity: item.quantity || 1,
      date: item.date || new Date().toISOString().split('T')[0]
    }));
    console.log('Saving via safeBulkSaveInventory:', transformedItems);
    const result = await safeBulkSaveInventory(user.id, transformedItems);
    console.log('safeBulkSaveInventory result:', result);
    return result.saved || [];
  };

  const bulkSaveSalesToSupabase = async (items) => {
    if (!user || items.length === 0) return [];
    const result = await safeBulkSaveSales(user.id, items);
    return result.saved || [];
  };

  const bulkDeletePendingFromSupabase = async (ids) => {
    if (!user || ids.length === 0) return;
    await safeBulkDeletePending(user.id, ids);
  };

  const deleteAllPendingFromSupabase = async () => {
    if (!user) return;
    await safeDeleteAllPending(user.id);
  };

  const updateInventoryInSupabase = async (item) => {
    if (!user) return;
    await safeUpdateInventory(user.id, item.id, {
      name: item.name,
      sku: item.sku,
      size: item.size,
      cost: item.cost,
      quantity: item.quantity || 1,
      date: item.date,
      sold: item.sold || false
    });
  };

  const updateSaleInSupabase = async (item) => {
    if (!user) return;
    await safeUpdateSale(user.id, item.id, {
      name: item.name,
      sku: item.sku,
      size: item.size,
      cost: item.cost,
      sale_price: item.salePrice,
      platform: item.platform,
      fees: item.fees,
      profit: item.profit,
      sale_date: item.saleDate
    });
  };

  // ============ LOCAL STORAGE BACKUP (for settings/tokens) ============

  // Save eBay policy defaults to Supabase
  async function saveEbayPolicies() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/save-ebay-policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          fulfillment_policy_id: selectedPolicies.fulfillment,
          payment_policy_id: selectedPolicies.payment,
          return_policy_id: selectedPolicies.return
        })
      });
      if (res.ok) {
        setPoliciesSaved(true);
        setTimeout(() => setPoliciesSaved(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save policies:', err);
    }
  }
  // Save settings to localStorage (user-specific)
  useEffect(() => {
    if (user) {
      localStorage.setItem(`flipledger_settings_${user.id}`, JSON.stringify(settings));
    }
  }, [settings, user]);

  // Save goals to localStorage (user-specific)
  useEffect(() => {
    if (user) {
      localStorage.setItem(`flipledger_goals_${user.id}`, JSON.stringify(goals));
    }
  }, [goals, user]);

  // Check for StockX token in URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
   const token = params.get('access_token');
    const stockxRefresh = params.get('refresh_token');
    if (token) {
      localStorage.setItem('flipledger_stockx_token', token);
      if (stockxRefresh) localStorage.setItem('flipledger_stockx_refresh', stockxRefresh);
      setStockxToken(token);
      setStockxConnected(true);
      linkTokensToServer('stockx', token, stockxRefresh, 86400);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Check for eBay OAuth callback on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebayConnectedParam = params.get('ebay_connected');
    const ebayTokenParam = params.get('ebay_token');
    const ebayRefreshParam = params.get('ebay_refresh');
    const ebayError = params.get('ebay_error');
    
    if (ebayConnectedParam === 'true' && ebayTokenParam) {
    const expiresIn = parseInt(params.get('ebay_expires')) || 7200;
      storeEbayTokens(ebayTokenParam, ebayRefreshParam, expiresIn);
      setEbayToken(ebayTokenParam);
      setEbayConnected(true);
      linkTokensToServer('ebay', ebayTokenParam, ebayRefreshParam, expiresIn);
      window.history.replaceState({}, document.title, window.location.pathname);
      setPage('settings');
    } else if (ebayError) {
      console.error('eBay connection error:', ebayError);
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('eBay connection failed: ' + ebayError);
    }
  }, []);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #C9A962 0%, #B8943F 100%)',
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 24,
            color: '#000',
            marginBottom: 16
          }}>FL</div>
          <p style={{ color: '#888' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LandingPage onLogin={setUser} />;
  }

  // Show loading while fetching data
  if (dataLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #C9A962 0%, #B8943F 100%)',
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 24,
            color: '#000',
            marginBottom: 16
          }}>FL</div>
          <p style={{ color: '#888' }}>Loading your data...</p>
        </div>
      </div>
    );
  }

  // Fetch StockX sales - Filter by selected year - SAFE VERSION v2.0
  const fetchStockXSales = async () => {
    if (!stockxToken) return;
    setStockxSyncing(true);
    
    try {
      const result = await syncStockXSales(user.id, stockxToken, {
        year: stockxApiFilter.year,
        month: stockxApiFilter.month
      });
      
      if (result.success) {
        if (result.saved.length > 0) {
          setPendingCosts(prev => [...prev, ...result.saved.map(transformPendingForDisplay)]);
        }
        
        const msg = [];
        if (result.saved.length > 0) msg.push(`✓ ${result.saved.length} new sales synced`);
        if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} already existed`);
        if (result.errors.length > 0) msg.push(`${result.errors.length} errors`);
        alert(msg.join('\n') || 'Sync complete - no new sales');
      } else {
        alert('Sync failed: ' + result.error);
      }
    } catch (error) {
      alert('Sync failed: ' + error.message);
    }
    
    setStockxSyncing(false);
  };

  // Disconnect StockX
  const disconnectStockX = () => {
    localStorage.removeItem('flipledger_stockx_token');
    localStorage.removeItem('flipledger_stockx_refresh');
    setStockxToken(null);
    setStockxConnected(false);
  };

  const c = { 
    bg: '#0C0C0C', 
    card: '#141414', 
    cardHover: '#1A1A1A',
    border: 'rgba(255,255,255,0.06)', 
    gold: '#C9A962', 
    goldLight: '#E8D5A3',
    goldDark: '#8B7355',
    goldGlow: 'rgba(201,169,98,0.3)',
    green: '#34D399', 
    greenMuted: '#10B981',
    greenGlow: 'rgba(52,211,153,0.3)',
    red: '#F87171', 
    text: '#FFFFFF', 
    textMuted: 'rgba(255,255,255,0.5)',
    textDim: 'rgba(255,255,255,0.3)'
  };

  const filterByYear = (items, dateField = 'date') => year === 'all' ? items : items.filter(item => item[dateField]?.startsWith(year));
  const inventory = purchases.filter(p => !sales.find(s => s.purchaseId === p.id));
  const filteredInventory = purchases; // Inventory shows ALL items regardless of year
  const filteredSales = filterByYear(sales, 'saleDate');
  const filteredExpenses = filterByYear(expenses);
  const filteredMileage = filterByYear(mileage);
  const filteredStorage = filterByYear(storageFees, 'month');

  const calcFees = (price, platform) => {
    if (platform === 'StockX Standard') return price * ((settings.stockxLevel + settings.stockxProcessing + (settings.stockxQuickShip ? -2 : 0)) / 100);
    if (platform === 'StockX Direct') return price * ((settings.stockxDirectFee + settings.stockxDirectProcessing) / 100);
    if (platform === 'StockX Flex') return price * ((settings.stockxFlexFee + settings.stockxFlexProcessing) / 100) + settings.stockxFlexFulfillment;
    if (platform === 'GOAT') return price * ((settings.goatFee + settings.goatProcessing) / 100);
    if (platform === 'eBay') return price * (settings.ebayFee / 100);
    return 0;
  };

  const totalRevenue = filteredSales.reduce((s, x) => s + (x.salePrice || 0), 0);
  const totalCOGS = filteredSales.reduce((s, x) => s + (x.cost || 0), 0);
  const totalFees = filteredSales.reduce((s, x) => s + (x.fees || 0), 0);
  const totalExp = filteredExpenses.reduce((s, x) => s + (x.amount || 0), 0);
  const totalStor = filteredStorage.reduce((s, x) => s + (x.amount || 0), 0);
  const totalMiles = filteredMileage.reduce((s, x) => s + (x.miles || 0), 0);
  const totalMileageDeduction = totalMiles * settings.mileageRate;
  const totalDeductions = totalFees + totalExp + totalStor + totalMileageDeduction;
  const netProfit = totalRevenue - totalCOGS - totalDeductions;
  const inventoryVal = purchases.filter(p => !p.sold).reduce((s, x) => s + (x.cost || 0), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const selfEmploymentTax = netProfit > 0 ? netProfit * 0.153 : 0;
  const federalTax = netProfit > 0 ? netProfit * 0.22 : 0;
  const stateTax = netProfit > 0 ? netProfit * 0.05 : 0;
  const totalTax = selfEmploymentTax + federalTax + stateTax;
  const fmt = n => (n < 0 ? '-$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: 2}) : '$' + (n || 0).toLocaleString('en-US', {minimumFractionDigits: 2}));

  const expenseCategories = ['Shipping', 'Packaging & Supplies', 'Labels & Printing', 'Storage Unit', 'Software & Subscriptions', 'Authentication Fees', 'Office Supplies', 'Travel & Meals', 'Other'];

  const platformBreakdown = filteredSales.reduce((acc, s) => {
    const p = s.platform || 'Other';
    if (!acc[p]) acc[p] = { sales: 0, revenue: 0, fees: 0, profit: 0 };
    acc[p].sales++; acc[p].revenue += s.salePrice || 0; acc[p].fees += s.fees || 0; acc[p].profit += s.profit || 0;
    return acc;
  }, {});

  const expenseByCategory = filteredExpenses.reduce((acc, e) => {
    if (!acc[e.category]) acc[e.category] = 0;
    acc[e.category] += e.amount;
    return acc;
  }, {});

  const syncPlatform = async (platform) => {
    setEbaySyncing(true);
    if (platform === 'StockX' && stockxToken) {
      await fetchStockXSales();
    } else {
      // Mock data for other platforms
      await new Promise(r => setTimeout(r, 2000));
      const mockSales = [
        { id: platform + '_' + Date.now(), name: 'Jordan 4 Retro Military Black', size: '10', salePrice: 340, fees: 37.40, saleDate: '2025-01-05', platform, payout: 302.60 },
        { id: platform + '_' + Date.now() + 1, name: 'Nike Dunk Low Panda', size: '9.5', salePrice: 115, fees: 12.65, saleDate: '2025-01-04', platform, payout: 102.35 },
      ];
      setPendingCosts(prev => [...prev, ...mockSales]);
    }
    setEbaySyncing(false);
  };

  // Lookup product by SKU
  const lookupSku = async (sku) => {
    if (!sku || sku.length < 3) return null;
    try {
      const response = await fetch(`/api/stockx-lookup?sku=${encodeURIComponent(sku)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('SKU lookup failed:', error);
    }
    return null;
  };

  const confirmSaleWithCost = async (saleId, cost, channel = 'StockX Standard') => {
    const sale = pendingCosts.find(s => s.id === saleId);
    if (!sale) {
      alert('Sale not found');
      return;
    }
    if (!cost && cost !== 0) {
      alert('Cost is required');
      return;
    }
    
    const costNum = parseFloat(cost);
    if (isNaN(costNum) || costNum < 0) {
      alert('Cost must be a valid non-negative number');
      return;
    }
    
    // SAFE: Use centralized confirm sale function
    const result = await safeConfirmSale(user.id, saleId, costNum);
    
    if (result.success) {
      // Update local state
      setSales(prev => [...prev, {
        id: result.sale.id,
        name: result.sale.name,
        sku: result.sale.sku,
        size: result.sale.size,
        cost: parseFloat(result.sale.cost) || 0,
        salePrice: parseFloat(result.sale.sale_price) || 0,
        platform: result.sale.platform,
        fees: parseFloat(result.sale.fees) || 0,
        profit: parseFloat(result.sale.profit) || 0,
        saleDate: result.sale.sale_date,
        orderId: result.sale.order_id
      }]);
      setPendingCosts(prev => prev.filter(s => s.id !== saleId));
      // Mark matching inventory item as sold
    const matchedItem = [...purchases].sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at)).find(p => !p.sold && sale.sku && p.sku && p.sku.toLowerCase() === sale.sku.toLowerCase() && (!sale.size || !p.size || p.size.toString() === sale.size.toString()));
      if (matchedItem) {
        await updateInventoryInSupabase({ ...matchedItem, sold: true });
        setPurchases(prev => prev.map(p => p.id === matchedItem.id ? { ...p, sold: true } : p));
      }
    } else if (result.duplicate) {
      // Already confirmed - just remove from pending view
      setPendingCosts(prev => prev.filter(s => s.id !== saleId));
      console.log('Sale was already confirmed:', result.error);
    } else {
      alert('Error confirming sale: ' + result.error);
    }
  };

  const addPurchase = async () => { 
    if (!formData.name || !formData.cost) {
      alert('Name and cost are required');
      return;
    }
    
    const costNum = parseFloat(formData.cost);
    if (isNaN(costNum) || costNum < 0) {
      alert('Cost must be a valid non-negative number');
      return;
    }
    
    // SAFE: Use centralized save function
    const result = await safeSaveInventory(user.id, {
      name: formData.name,
      sku: formData.sku || '',
      size: formData.size || '',
      cost: costNum,
      date: formData.date || new Date().toISOString().split('T')[0]
    });
    
    if (result.success) {
      setPurchases([...purchases, {
        id: result.data.id,
        name: result.data.name,
        sku: result.data.sku,
        size: result.data.size,
        cost: parseFloat(result.data.cost) || 0,
        date: result.data.date,
        sold: result.data.sold || false
      }]);
      setModal(null);
      setFormData({});
    } else {
      alert('Error adding item: ' + result.error);
    }
  };

  const addSale = async () => { 
    if (!formData.saleName || !formData.salePrice || !formData.saleCost) {
      alert('Name, sale price, and cost are required');
      return;
    }
    
    const price = parseFloat(formData.salePrice);
    const cost = parseFloat(formData.saleCost);
    
    if (isNaN(price) || price <= 0) {
      alert('Sale price must be greater than zero');
      return;
    }
    if (isNaN(cost) || cost < 0) {
      alert('Cost must be a valid non-negative number');
      return;
    }
    
    const fees = calcFees(price, formData.platform || 'StockX Standard');
    
    // SAFE: Use centralized save function
    const result = await safeSaveSale(user.id, {
      name: formData.saleName,
      sku: formData.saleSku || '',
      size: formData.saleSize || '',
      cost: cost,
      sale_price: price,
      platform: formData.platform || 'StockX Standard',
      fees: fees,
      profit: price - cost - fees,
      sale_date: formData.saleDate || new Date().toISOString().split('T')[0]
    });
    
    if (result.success) {
      setSales([...sales, {
        id: result.data.id,
        name: result.data.name,
        sku: result.data.sku,
        size: result.data.size,
        cost: parseFloat(result.data.cost) || 0,
        salePrice: parseFloat(result.data.sale_price) || 0,
        platform: result.data.platform,
        fees: parseFloat(result.data.fees) || 0,
        profit: parseFloat(result.data.profit) || 0,
        saleDate: result.data.sale_date
      }]);
      setModal(null);
      setFormData({});
    } else {
      alert('Error adding sale: ' + result.error);
    }
  };

  const addExpense = async () => { 
    if (!formData.amount) return; 
    const newExpense = { 
      category: formData.category || 'Shipping', 
      amount: parseFloat(formData.amount), 
      description: formData.description || '', 
      date: formData.date || new Date().toISOString().split('T')[0] 
    };
    // Save to Supabase using centralized function
    const result = await safeSaveExpense(user.id, newExpense);
    if (result.success && result.data) {
      setExpenses([...expenses, result.data]); 
      console.log('[Expenses] Added:', result.data.id);
    } else {
      console.error('[Expenses] Failed to add:', result.error);
      alert('Failed to save expense: ' + (result.error || 'Unknown error'));
    }
    setModal(null); 
    setFormData({}); 
  };

  const addStorage = async () => { 
    if (!formData.amount) return; 
    const newStorage = {
      month: formData.month || new Date().toISOString().substring(0, 7),
      amount: parseFloat(formData.amount),
      notes: formData.notes || ''
    };
    const result = await safeSaveStorageFee(user.id, newStorage);
    if (result.success && result.data) {
      setStorageFees([...storageFees, result.data]);
      console.log('[Storage] Added:', result.data.id);
    } else {
      console.error('[Storage] Failed to add:', result.error);
      alert('Failed to save storage fee: ' + (result.error || 'Unknown error'));
    }
    setModal(null); 
    setFormData({}); 
  };

  const addMileage = async () => { 
    if (!formData.miles) return; 
    const newMileage = {
      date: formData.date || new Date().toISOString().split('T')[0],
      miles: parseFloat(formData.miles),
      purpose: formData.purpose || 'Pickup/Dropoff',
      from: formData.from || '',
      to: formData.to || ''
    };
    const result = await safeSaveMileage(user.id, newMileage);
    if (result.success && result.data) {
      setMileage([...mileage, {
        id: result.data.id,
        date: result.data.date,
        miles: result.data.miles,
        purpose: result.data.purpose,
        from: result.data.from_location,
        to: result.data.to_location
      }]);
      console.log('[Mileage] Added:', result.data.id);
    } else {
      console.error('[Mileage] Failed to add:', result.error);
      alert('Failed to save mileage: ' + (result.error || 'Unknown error'));
    }
    setModal(null); 
    setFormData({}); 
  };

  // Nike Receipt Scanner
  const parseNikeReceipt = async (imageFile) => {
    setNikeReceipt(prev => ({ ...prev, scanning: true, items: [], image: null, error: null }));
    
    try {
      console.log('=== NIKE RECEIPT SCANNER (Google Vision + Claude) ===');
      console.log('Input:', imageFile.name, '|', imageFile.type, '|', (imageFile.size / 1024).toFixed(1), 'KB');
      
      // Load image
      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(imageFile);
      });
      
      // STEP 1: Google Vision OCR (accurate text extraction)
      console.log('Step 1: Google Vision OCR...');
      const ocrResponse = await fetch('/api/google-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 })
      });
      
      const ocrResult = await ocrResponse.json();
      
      if (ocrResult.error) {
        throw new Error(ocrResult.message || ocrResult.error);
      }
      
      const ocrText = ocrResult.text;
      console.log('OCR complete. Text length:', ocrText.length);
      console.log('--- OCR TEXT PREVIEW ---');
      console.log(ocrText.substring(0, 1500));
      console.log('--- END PREVIEW ---');
      
      if (!ocrText || ocrText.length < 50) {
        throw new Error('Could not read text from image. Please try a clearer screenshot.');
      }
      
      // STEP 2: Send text to Claude for structuring
      console.log('Step 2: Claude structuring...');
      const response = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText, mode: 'text' })
      });
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.message || result.error);
      }
      // IMPORTANT: Do not dedupe receipt items. Each receipt line = one purchase.

      // Extract items (do NOT dedupe — each receipt line is a separate purchase)
const items = (result.items || []).map(item => ({
  name: item.name || 'Nike Product',
  sku: item.sku || '',
  size: item.size || '',
  price: parseFloat(item.price) || 0
}));

console.log('Found', items.length, 'items');

      
      // Distribute tax if present
      if (result.tax && result.tax > 0 && items.length > 0) {
        const totalBeforeTax = items.reduce((sum, item) => sum + item.price, 0);
        items.forEach(item => {
          const taxShare = (item.price / totalBeforeTax) * result.tax;
          item.price = Math.round((item.price + taxShare) * 100) / 100;
        });
        console.log('Distributed $' + result.tax + ' tax across items');
      }
      
      setNikeReceipt({ 
        scanning: false, 
        items, 
        image: imageBase64, 
        date: result.orderDate || '', 
        orderNum: result.orderNumber || '',
        error: items.length === 0 ? 'No items found. Make sure this is a Nike order screenshot.' : null
      });
      
      console.log('=== SCAN COMPLETE ===');
      
    } catch (error) {
      console.error('=== SCAN ERROR ===', error);
      setNikeReceipt({ 
        scanning: false, 
        items: [], 
        image: null, 
        date: '', 
        orderNum: '', 
        error: error.message || 'Failed to scan receipt. Please try again.' 
      });
    }
  };
  
  
  // Add scanned items to inventory
  const addNikeItemsToInventory = async () => {
    const itemsToSave = nikeReceipt.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      size: item.size,
      cost: item.price,
      date: nikeReceipt.date || new Date().toISOString().split('T')[0],
      sold: false
    }));
    
    // Save receipt
    if (nikeReceipt.image) {
      setSavedReceipts(prev => [...prev, {
        id: nikeReceipt.orderNum || Date.now().toString(),
        image: nikeReceipt.image,
        date: nikeReceipt.date,
        items: nikeReceipt.items.length,
        total: nikeReceipt.items.reduce((sum, item) => sum + item.price, 0),
        createdAt: new Date().toISOString()
      }]);
    }
    
    // Save to Supabase
    const savedItems = await bulkSaveInventoryToSupabase(itemsToSave);
    if (savedItems.length > 0) {
      const newItems = savedItems.map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        size: item.size,
        cost: parseFloat(item.cost) || 0,
        date: item.date,
        sold: item.sold || false
      }));
      setPurchases(prev => [...prev, ...newItems]);
    }
    setNikeReceipt({ scanning: false, items: [], image: null, date: '', orderNum: '' });
  };

  const exportCSV = (data, filename, headers) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  };

  // Download inventory template CSV
  const downloadInventoryTemplate = () => {
    const template = 'Date,Name,SKU,Size,Cost\n1/15/2024,Jordan 4 Retro Example,AB1234-001,10,150\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flipledger-inventory-template.csv';
    a.click();
  };

  // Import inventory from CSV or XLSX
  const handleInventoryFileUpload = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      // Handle Excel file
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          
          if (rows.length < 2) {
            alert('Excel file is empty or has no data rows');
            return;
          }
          
          // Parse headers (first row)
          const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
          
          // Find column indexes
          const dateIdx = headers.findIndex(h => h === 'date');
          const nameIdx = headers.findIndex(h => h === 'name');
          const skuIdx = headers.findIndex(h => h === 'sku');
          const sizeIdx = headers.findIndex(h => h === 'size');
          const costIdx = headers.findIndex(h => h === 'cost');
          
          const newItems = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            // Excel dates might be numbers - convert them
            let rawDate = dateIdx >= 0 ? row[dateIdx] : '';
            if (typeof rawDate === 'number') {
              // Excel date serial number to JS date
              const excelDate = new Date((rawDate - 25569) * 86400 * 1000);
              rawDate = excelDate.toISOString().split('T')[0];
            }
            
            const name = nameIdx >= 0 ? String(row[nameIdx] || '') : '';
            const sku = skuIdx >= 0 ? String(row[skuIdx] || '') : '';
            const size = sizeIdx >= 0 ? String(row[sizeIdx] || '') : '';
            const cost = costIdx >= 0 ? parseFloat(row[costIdx]) || 0 : 0;
            
            if (name || sku) {
              newItems.push({
                date: parseDate(String(rawDate)) || new Date().toISOString().split('T')[0],
                name: name || 'Unknown Item',
                sku: sku,
                size: size,
                cost: cost,
                sold: false
              });
            }
          }
          
          if (newItems.length > 0) {
            // Save to Supabase
            const savedItems = await bulkSaveInventoryToSupabase(newItems);
            if (savedItems.length > 0) {
              setPurchases(prev => [...prev, ...savedItems.map(item => ({
                id: item.id,
                name: item.name,
                sku: item.sku,
                size: item.size,
                cost: parseFloat(item.cost) || 0,
                date: item.date,
                sold: item.sold || false
              }))]);
              alert(`Imported ${savedItems.length} items to inventory!`);
            }
          } else {
            alert('No items found. Make sure your Excel file has headers: Date, Name, SKU, Size, Cost');
          }
          
          setShowInvCsvImport(false);
        } catch (err) {
          console.error('Excel parse error:', err);
          alert('Error reading Excel file. Please check the format.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle CSV file
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        const lines = text.split('\n');
        
        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        
        // Find column indexes
        const dateIdx = headers.findIndex(h => h === 'date');
        const nameIdx = headers.findIndex(h => h === 'name');
        const skuIdx = headers.findIndex(h => h === 'sku');
        const sizeIdx = headers.findIndex(h => h === 'size');
        const costIdx = headers.findIndex(h => h === 'cost');
        
        const newItems = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          // Parse CSV line (handle commas in quotes)
          const values = [];
          let current = '';
          let inQuotes = false;
          for (const char of lines[i]) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
          }
          values.push(current.trim());
          
          // Extract values
          const rawDate = dateIdx >= 0 ? values[dateIdx]?.replace(/"/g, '') : '';
          const name = nameIdx >= 0 ? values[nameIdx]?.replace(/"/g, '') : '';
          const sku = skuIdx >= 0 ? values[skuIdx]?.replace(/"/g, '') : '';
          const size = sizeIdx >= 0 ? values[sizeIdx]?.replace(/"/g, '') : '';
          const cost = costIdx >= 0 ? parseFloat(values[costIdx]?.replace(/[$",]/g, '')) || 0 : 0;
          
          if (name || sku) {
            newItems.push({
              date: parseDate(rawDate) || new Date().toISOString().split('T')[0],
              name: name || 'Unknown Item',
              sku: sku || '',
              size: size || '',
              cost: cost,
              sold: false
            });
          }
        }
        
        if (newItems.length > 0) {
          // Save to Supabase
          const savedItems = await bulkSaveInventoryToSupabase(newItems);
          if (savedItems.length > 0) {
            setPurchases(prev => [...prev, ...savedItems.map(item => ({
              id: item.id,
              name: item.name,
              sku: item.sku,
              size: item.size,
              cost: parseFloat(item.cost) || 0,
              date: item.date,
              sold: item.sold || false
            }))]);
            alert(`Imported ${savedItems.length} items to inventory!`);
          }
        } else {
          alert('No items found. Make sure your CSV has headers: Date, Name, SKU, Size, Cost');
        }
        
        setShowInvCsvImport(false);
      };
      reader.readAsText(file);
    }
    
    if (e.target) e.target.value = ''; // Reset file input
  };

  // Parse date from various formats to YYYY-MM-DD
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const str = dateStr.trim();
    
    // Already YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.substring(0, 10);
    }
    
    // MM/DD/YYYY or M/D/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
      const parts = str.split('/');
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].substring(0, 4);
      return `${year}-${month}-${day}`;
    }
    
    // MM-DD-YYYY format
    if (/^\d{1,2}-\d{1,2}-\d{4}/.test(str)) {
      const parts = str.split('-');
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].substring(0, 4);
      return `${year}-${month}-${day}`;
    }
    
    // Try to parse with Date object as fallback
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toISOString().substring(0, 10);
      }
    } catch {}
    
    return str.substring(0, 10);
  };

  // Helper to parse CSV line with quote handling
  const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/"/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/"/g, ''));
    return values;
  };

  // StockX CSV Import
  const handleStockxCsvUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').replace(/^\uFEFF/, ''));
      
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        
        const dateField = row['Sale Date'] || row['SaleDate'] || row['Date'] || '';
        if (dateField) {
          row['_parsedDate'] = parseDate(dateField);
          parsed.push(row);
        }
      }
      
      console.log('StockX CSV - Parsed rows:', parsed.length);
      setStockxImport({ show: true, data: parsed, headers, year: 'all', month: 'all' });
    };
    reader.readAsText(file);
  };

  // eBay CSV Import
  const handleEbayCsvUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file) return;
    
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      
      // Find header row - look for common eBay column names
      let headerIndex = 0;
      for (let i = 0; i < Math.min(30, lines.length); i++) {
        if (lines[i].includes('Order number') || lines[i].includes('Order creation date') || lines[i].includes('Transaction creation date')) {
          headerIndex = i;
          break;
        }
      }
      
      const headers = parseCSVLine(lines[headerIndex]).map(h => h.replace(/^\uFEFF/, ''));
      console.log('eBay CSV Headers:', headers.slice(0, 10));
      
      // Check what type of report this is
      const hasOrderEarnings = headers.includes('Order earnings');
      const hasType = headers.includes('Type');
      console.log('Has Order earnings column:', hasOrderEarnings);
      console.log('Has Type column (Transaction Report):', hasType);
      
      const orders = [];
      const adFees = {}; // For Transaction Report ad fee matching
      
      for (let i = headerIndex + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        
        // Parse date from either format
        const dateField = row['Order creation date'] || row['Transaction creation date'] || '';
        if (dateField && dateField !== '--') {
          const match = dateField.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
          if (match) {
            row['_parsedDate'] = `${match[3]}-${months[match[1]] || '01'}-${match[2].padStart(2, '0')}`;
          }
        }
        
        // For Order Earnings Report: every data row is an order
        if (hasOrderEarnings && !hasType) {
          if (row['Order number'] && row['Order number'] !== '--') {
            orders.push(row);
          }
        }
        // For Transaction Report: only 'Order' type rows, and capture ad fees
        else if (hasType) {
          if (row['Type'] === 'Order') {
            orders.push(row);
          }
          // Capture ad fees from 'Other fee' rows
          if ((row['Type'] === 'Other fee' || row['Type'] === 'Fee') && 
              (row['Description'] || '').toLowerCase().includes('promoted')) {
            const orderNum = row['Order number'];
            if (orderNum && orderNum !== '--') {
              const feeAmt = Math.abs(parseFloat((row['Net amount'] || '0').replace(/[$,]/g, ''))) || 0;
              adFees[orderNum] = (adFees[orderNum] || 0) + feeAmt;
            }
          }
        }
      }
      
      // Attach ad fees to orders (for Transaction Report)
      if (hasType && Object.keys(adFees).length > 0) {
        orders.forEach(order => {
          order['_adFee'] = adFees[order['Order number']] || 0;
        });
        console.log('Ad fees attached:', Object.keys(adFees).length);
      }
      
      console.log('eBay CSV - Orders parsed:', orders.length);
      
      // Log first order for debugging
      if (orders.length > 0) {
        const first = orders[0];
        console.log('First order:', {
          title: first['Item title']?.substring(0, 30),
          gross: first['Gross amount'] || first['Gross transaction amount'],
          orderEarnings: first['Order earnings'],
          net: first['Net amount'],
          adFee: first['_adFee']
        });
      }
      
      setEbayImport({ show: true, data: orders, headers, year: 'all', month: 'all' });
    };
    reader.readAsText(file);
  };

  // Drag and drop handlers
  const handleStockxDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleStockxCsvUpload({ target: { files: [file] } });
  };
  
  const handleEbayDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleEbayCsvUpload({ target: { files: [file] } });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Filter functions for each platform
  const filterStockxData = () => {
    const { data, year: filterYear, month: filterMonth } = stockxImport;
    return data.filter(row => {
      const parsedDate = row['_parsedDate'] || '';
      if (!parsedDate) return false;
      const rowYear = parsedDate.substring(0, 4);
      const rowMonth = parsedDate.substring(5, 7);
      if (filterYear !== 'all' && rowYear !== filterYear) return false;
      if (filterMonth !== 'all' && rowMonth !== filterMonth) return false;
      return true;
    });
  };

  const filterEbayData = () => {
    const { data, year: filterYear, month: filterMonth } = ebayImport;
    return data.filter(row => {
      const parsedDate = row['_parsedDate'] || '';
      if (!parsedDate) return false;
      const rowYear = parsedDate.substring(0, 4);
      const rowMonth = parsedDate.substring(5, 7);
      if (filterYear !== 'all' && rowYear !== filterYear) return false;
      if (filterMonth !== 'all' && rowMonth !== filterMonth) return false;
      return true;
    });
  };

  // Import StockX sales - SAFE VERSION
  const importStockxSales = async () => {
    const filtered = filterStockxData();
    
    const itemsToSave = filtered.map((row) => {
      const orderNum = row['Order Number'] || row['Order Id'] || row['Order #'] || '';
      const salePrice = parseFloat((row['Price'] || row['Sale Price'] || row['Order Total'] || '0').replace(/[$,]/g, '')) || 0;
      const payout = parseFloat((row['Final Payout Amount'] || row['Payout'] || row['Total Payout'] || '0').replace(/[$,]/g, '')) || 0;
      let productName = row['Item'] || row['Product Name'] || row['Product'] || row['Name'] || 'Unknown Item';
      
      // Generate image URL from product name
      let nameForSlug = productName;
      if (/^Jordan\s/i.test(nameForSlug) && !/^Air\s+Jordan/i.test(nameForSlug)) {
        nameForSlug = 'Air ' + nameForSlug;
      }
      
      const slug = nameForSlug
        .replace(/\(Women's\)/gi, 'W')
        .replace(/\(Men's\)/gi, '')
        .replace(/\(GS\)/gi, 'GS')
        .replace(/\(PS\)/gi, 'PS')
        .replace(/\(TD\)/gi, 'TD')
        .replace(/\([^)]*\)/g, '')
        .replace(/'/g, '')
        .replace(/"/g, '')
        .replace(/&/g, 'and')
        .replace(/\+/g, 'Plus')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      const image = slug 
        ? `https://images.stockx.com/images/${slug}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&q=90&dpr=2&trim=color`
        : '';
      
      return {
        name: productName,
        sku: row['Style'] || row['SKU'] || row['Style Code'] || '',
        size: String(row['Sku Size'] || row['Size'] || row['Product Size'] || ''),
        sale_price: salePrice,
        payout: payout,
        fees: salePrice - payout,
        sale_date: row['_parsedDate'] || null,
        platform: 'StockX',
        order_id: orderNum || `stockx_csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        image: image
      };
    });
    
    // SAFE: Use centralized bulk save with automatic duplicate detection
    const result = await safeBulkSavePendingCosts(user.id, itemsToSave);
    
    // Update local state with saved items
    if (result.saved.length > 0) {
      setPendingCosts(prev => [...prev, ...result.saved.map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        size: item.size,
        salePrice: parseFloat(item.sale_price) || 0,
        platform: item.platform,
        fees: parseFloat(item.fees) || 0,
        saleDate: item.sale_date,
        payout: parseFloat(item.payout) || 0,
        orderId: item.order_id
      }))]);
    }
    
    // Show result message
    const msg = [];
    if (result.saved.length > 0) msg.push(`✓ ${result.saved.length} StockX sales imported`);
    if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} duplicates skipped`);
    if (result.errors.length > 0) msg.push(`${result.errors.length} errors`);
    alert(msg.join('\n') || 'Import complete');
    
    setStockxImport({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  };

  // Import eBay sales - SAFE VERSION
  const importEbaySales = async () => {
    const filtered = filterEbayData();
    const parseAmount = (val) => {
      if (!val || val === '--') return 0;
      return parseFloat(val.toString().replace(/[$,]/g, '')) || 0;
    };
    
    console.log('eBay CSV import starting:', filtered.length, 'rows');
    
    const itemsToSave = filtered.map((row) => {
      // SOLD: Use 'Gross amount' or 'Gross transaction amount'
      let salePrice = parseAmount(row['Gross amount']) || parseAmount(row['Gross transaction amount']) || parseAmount(row['Item subtotal']);
      
      // PAYOUT: Use 'Order earnings' if it exists (best), otherwise calculate
      let payout;
      const rawOrderEarnings = row['Order earnings'];
      
      if (rawOrderEarnings && rawOrderEarnings !== '--' && rawOrderEarnings !== '0') {
        payout = parseAmount(rawOrderEarnings);
      } else {
        const netAmount = parseAmount(row['Net amount']);
        const adFee = parseFloat(row['_adFee'] || 0);
        payout = netAmount - adFee;
      }
      
      // FEES
      const fees = Math.abs(parseAmount(row['Expenses'])) || 
        (Math.abs(parseAmount(row['Final Value Fee - fixed'])) + 
         Math.abs(parseAmount(row['Final Value Fee - variable'])) + 
         Math.abs(parseAmount(row['Regulatory operating fee'])) + 
         Math.abs(parseAmount(row['International fee'])) +
         Math.abs(parseAmount(row['Promoted Listing Standard fee'])) +
         parseFloat(row['_adFee'] || 0));
      
      const orderNum = row['Order number'] || '';
      
      return {
        name: row['Item title'] || 'Unknown Item',
        sku: row['Custom label'] || '',
        size: '',
        sale_price: salePrice,
        payout: payout,
        fees: fees,
        sale_date: row['_parsedDate'] || null,
        platform: 'eBay',
        order_id: orderNum ? `ebay_${orderNum}` : `ebay_csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        order_number: orderNum
      };
    });
    
    console.log('eBay import:', itemsToSave.length, 'items to process');
    
    // SAFE: Use centralized bulk save with automatic duplicate detection
    const result = await safeBulkSavePendingCosts(user.id, itemsToSave);
    
    // Update local state with saved items
    if (result.saved.length > 0) {
      setPendingCosts(prev => [...prev, ...result.saved.map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        size: item.size,
        salePrice: parseFloat(item.sale_price) || 0,
        platform: item.platform,
        fees: parseFloat(item.fees) || 0,
        saleDate: item.sale_date,
        payout: parseFloat(item.payout) || 0,
        orderId: item.order_id,
        orderNumber: item.order_number
      }))]);
    }
    
    // Show result message
    const msg = [];
    if (result.saved.length > 0) msg.push(`✓ ${result.saved.length} eBay sales imported`);
    if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} duplicates skipped`);
    if (result.errors.length > 0) msg.push(`${result.errors.length} errors`);
    alert(msg.join('\n') || 'Import complete');
    
    setEbayImport({ show: false, data: [], year: 'all', month: 'all', headers: [] });
  };

  const printTaxPackage = () => {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>FlipLedger Tax Summary ${year}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: letter; margin: 0.75in; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; padding: 40px; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      .header { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #000; }
      .header p { margin: 4px 0; color: #444; }
      .section { margin-bottom: 25px; }
      .section h2 { font-size: 14px; font-weight: bold; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
      .row.total { border-top: 2px solid #000; border-bottom: none; font-weight: bold; font-size: 14px; margin-top: 8px; padding-top: 12px; }
      .label { color: #333; }
      .value { font-weight: 600; }
      .negative { color: #c00; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 10px; color: #666; }
    </style></head><body>
    
    <div class="header">
      <h1>Tax Summary</h1>
      <p><strong>Tax Year:</strong> ${year === 'all' ? 'All Time' : year}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Total Transactions:</strong> ${filteredSales.length}</p>
    </div>

    <div class="section">
      <h2>Income</h2>
      <div class="row">
        <span class="label">Gross Sales Revenue</span>
        <span class="value">${fmt(totalRevenue)}</span>
      </div>
      <div class="row">
        <span class="label">Cost of Goods Sold</span>
        <span class="value negative">(${fmt(totalCOGS)})</span>
      </div>
      <div class="row total">
        <span class="label">Gross Profit</span>
        <span class="value">${fmt(totalRevenue - totalCOGS)}</span>
      </div>
    </div>

    <div class="section">
      <h2>Expenses</h2>
      <div class="row">
        <span class="label">Platform Selling Fees</span>
        <span class="value negative">(${fmt(totalFees)})</span>
      </div>
      <div class="row">
        <span class="label">Business Expenses</span>
        <span class="value negative">(${fmt(totalExp)})</span>
      </div>
      <div class="row total">
        <span class="label">Total Expenses</span>
        <span class="value negative">(${fmt(totalFees + totalExp)})</span>
      </div>
    </div>

    <div class="section">
      <h2>Net Income</h2>
      <div class="row total" style="font-size: 18px;">
        <span class="label">Net Profit (Schedule C, Line 31)</span>
        <span class="value" style="color: ${netProfit >= 0 ? '#000' : '#c00'}">${fmt(netProfit)}</span>
      </div>
    </div>

    <div class="footer">
      Generated by FlipLedger • For informational purposes only • Consult a licensed CPA for tax advice
    </div>

    </body></html>`);
    w.document.close();
    w.print();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'inventory', label: 'Inventory', icon: '◫', count: purchases.filter(p => !p.sold).length },
    { id: 'sales', label: 'Sales', icon: '◈', count: filteredSales.length },
    { type: 'divider' },
    { id: 'expenses', label: 'Expenses', icon: '◧' },
    { id: 'reports', label: 'CPA Reports', icon: '📊' },
    { type: 'divider' },
    { id: 'import', label: 'Import', icon: '📥', badge: pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length || null },
   { id: 'copcheck', label: 'Cop Check', icon: '🔍' },
    { id: 'listings', label: 'Listings', icon: '🏷' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const inputStyle = { width: '100%', padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14, boxSizing: 'border-box', outline: 'none' };
  const cardStyle = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden', transition: 'all 0.3s ease' };
  const btnPrimary = { background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, border: 'none', borderRadius: 10, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: `0 4px 20px ${c.goldGlow}` };
  const btnSecondary = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' };

  return (
    <div id="appWrapper" style={{ display: 'flex', minHeight: '100vh', background: c.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: c.text, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0% 0%, rgba(201,169,98,0.04) 0%, transparent 50%), radial-gradient(ellipse at 100% 100%, rgba(52,211,153,0.03) 0%, transparent 50%)` }} />
      
      {/* Mobile Header */}
      <div className="no-print mobile-only" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: 60, background: '#0A0A0A', borderBottom: `1px solid ${c.border}`, zIndex: 100, padding: '0 16px', alignItems: 'center', justifyContent: 'space-between' }} id="mobileHeader">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 8 }}>☰</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#000' }}>FL</div>
          <span style={{ fontWeight: 700, fontSize: 14, color: c.gold }}>FLIPLEDGER</span>
        </div>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '8px 28px 8px 12px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: c.text, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
          {[2026,2025,2024,2023].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && <div className="mobile-only" onClick={() => setMobileMenuOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 199 }} id="mobileOverlay" />}

      <aside className={`no-print ${mobileMenuOpen ? 'open' : ''}`} id="sidebar" style={{ width: 240, minWidth: 240, background: '#0A0A0A', borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', zIndex: 200, position: 'relative' }}>
        <div style={{ padding: 24, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${c.gold} 0%, ${c.goldDark} 100%)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#000' }}>FL</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '1px', color: c.gold }}>FLIPLEDGER</div>
              <div style={{ fontSize: 10, color: c.textDim, letterSpacing: '2px', fontWeight: 500 }}>WEALTH INTELLIGENCE</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {navItems.map((item, i) => item.type === 'divider' ? <div key={i} style={{ height: 1, background: c.border, margin: '12px 8px' }} /> : (
            <button key={item.id} className="nav-item" onClick={() => { setPage(item.id); setMobileMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 16px', marginBottom: 4, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: page === item.id ? `rgba(201,169,98,0.1)` : 'transparent', color: page === item.id ? c.gold : c.textMuted, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 16, opacity: page === item.id ? 1 : 0.6 }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && <span style={{ background: c.red, padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{item.badge}</span>}
              {item.count !== undefined && <span style={{ background: c.gold, color: '#000', padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: `1px solid ${c.border}` }}>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('purchase'); }} style={{ width: '100%', padding: 12, marginBottom: 8, background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Add Purchase</button>
          <button className="btn-hover" onClick={() => { setFormData({}); setModal('sale'); }} style={{ width: '100%', padding: 12, ...btnPrimary }}>+ Record Sale</button>
        </div>
      </aside>

      <main id="mainContent" style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
        <div className="desktop-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${c.border}` }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '0.5px' }}>{navItems.find(n => n.id === page)?.label || 'Dashboard'}</h1>
          </div>
          <div className="no-mobile" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 100, fontSize: 12, fontWeight: 500, color: c.textMuted }}>
              <div style={{ width: 8, height: 8, background: c.green, borderRadius: '50%', animation: 'pulse 3s ease-in-out infinite' }} />
              Connected
            </div>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '10px 24px 10px 20px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 100, fontSize: 13, fontWeight: 600, color: c.text, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
              {[2026,2025,2024,2023].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* DASHBOARD */}
        {page === 'dashboard' && (() => {
          // MOBILE: Render clean mobile dashboard
          if (isMobile) {
            return (
              <MobileDashboard
                netProfit={netProfit}
                totalRevenue={totalRevenue}
                totalCOGS={totalCOGS}
                totalFees={totalFees}
                inventoryVal={inventoryVal}
                filteredSales={filteredSales}
                pendingCosts={pendingCosts}
                goals={goals}
                year={year}
                c={c}
                fmt={fmt}
                setPage={setPage}
              />
            );
          }

          // DESKTOP: Original dashboard with all the bells and whistles
          // Live Pulse Component
          const LivePulse = ({ color = '#10b981', size = 8, speed = 2, label = null, style = {} }) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
              <div style={{ position: 'relative', width: size, height: size }}>
                <div className="pulse-ring" style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: color, opacity: 0.3 }} />
                <div className="pulse-glow" style={{ width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 ${size * 1.5}px ${color}` }} />
              </div>
              {label && <span style={{ fontSize: 11, fontWeight: 600, color, letterSpacing: '0.05em' }}>{label}</span>}
            </div>
          );

          // Status Indicator Component
          const StatusIndicator = ({ status = 'live', label = null }) => {
            const configs = { live: { color: '#10b981', label: label || 'LIVE' }, profit: { color: '#10b981', label: label || 'PROFIT' }, synced: { color: '#8b5cf6', label: label || 'SYNCED' } };
            const config = configs[status] || configs.live;
            return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${config.color}15`, border: `1px solid ${config.color}30`, borderRadius: 100, padding: '6px 14px' }}>
                <LivePulse color={config.color} size={6} speed={2} />
                <span style={{ fontSize: 11, fontWeight: 700, color: config.color, letterSpacing: '0.08em' }}>{config.label}</span>
              </div>
            );
          };

          return <>
          {/* Pending costs alert */}
          {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length > 0 && (
            <div className="pending-pulse" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <LivePulse color="#fbbf24" size={10} speed={1.5} />
                <span style={{ color: c.gold, fontWeight: 600 }}>{pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length} sales need cost basis</span>
              </div>
              <button className="btn-hover" onClick={() => setPage('import')} style={{ padding: '8px 16px', background: c.gold, border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', color: '#000' }}>REVIEW</button>
            </div>
          )}

          {/* HERO PROFIT CARD - GAMIFIED */}
          <div className="hero-card" style={{
            background: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 24,
            padding: '48px 56px',
            marginBottom: 28,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Animated top border */}
            <div className="border-flow" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${c.gold}, ${c.green}, ${c.gold}, transparent)`, backgroundSize: '200% 100%' }} />
            
            {/* Breathing glow */}
            <div className="breathe" style={{ position: 'absolute', top: -100, right: -50, width: 400, height: 400, background: `radial-gradient(circle, rgba(201,169,98,0.15) 0%, transparent 60%)`, pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '1px', color: c.textDim, textTransform: 'uppercase' }}>Net Profit YTD</span>
                  <div className="live-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 100 }}>
                    <div className="pulse-glow" style={{ width: 8, height: 8, background: c.green, borderRadius: '50%', boxShadow: `0 0 12px ${c.green}` }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.green, letterSpacing: '1px' }}>LIVE</span>
                  </div>
                </div>
                
                <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px', marginBottom: 16 }}>
                  <span style={{ color: c.gold, textShadow: `0 0 40px rgba(201,169,98,0.4)` }}>${netProfit < 0 ? '-' : ''}</span>
                  <span style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #34D399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 30px rgba(52,211,153,0.4))' }}>{Math.abs(netProfit).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                
                <div style={{ fontSize: 14, color: c.textMuted }}>
                  <span style={{ color: c.green, fontWeight: 600 }}>↑ {filteredSales.length > 0 && totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%</span>
                  <span style={{ margin: '0 8px' }}>·</span>
                  {filteredSales.length} transactions
                </div>
              </div>

              {/* Animated Margin Ring */}
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                {/* Spinning dashed ring */}
                <div className="spin-slow" style={{ position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, border: '1px dashed rgba(201,169,98,0.3)', borderRadius: '50%' }} />
                
                <svg width="180" height="180" style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 20px rgba(201,169,98,0.3))` }}>
                  <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                  <circle className="ring-pulse" cx="90" cy="90" r="70" fill="none" stroke="url(#marginGradGameified)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${totalRevenue > 0 ? Math.max(0, (netProfit / totalRevenue * 100)) * 4.4 : 0} 440`} />
                  <defs><linearGradient id="marginGradGameified" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={c.green} /><stop offset="100%" stopColor={c.gold} /></linearGradient></defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '2px', color: c.textDim, textTransform: 'uppercase', marginBottom: 4 }}>Margin</span>
                  <span style={{ fontSize: 42, fontWeight: 800, color: c.gold, textShadow: `0 0 30px rgba(201,169,98,0.4)` }}>{totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(0) : '0'}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* STATS ROW - GAMIFIED */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 28 }}>
            {[
              { label: 'Gross Revenue', value: totalRevenue, icon: '📈', color: c.gold, glow: 'rgba(201,169,98,0.3)', trend: filteredSales.length > 0 ? '+' + ((totalRevenue / (totalRevenue || 1)) * 18).toFixed(0) + '%' : '+0%' },
              { label: 'Cost of Goods', value: totalCOGS, icon: '💎', color: c.green, glow: 'rgba(52,211,153,0.3)', trend: '+12%' },
              { label: 'Platform Fees', value: totalFees, icon: '⚡', color: c.red, glow: 'rgba(248,113,113,0.3)', trend: '-3%' },
              { label: 'Inventory Value', value: inventoryVal, icon: '🏦', color: '#8B5CF6', glow: 'rgba(139,92,246,0.3)', trend: '+8%' },
            ].map((stat, i) => (
              <div key={i} className="stat-card-hover" style={{
                background: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: 20,
                padding: '28px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}>
                {/* Animated shimmer top line */}
                <div className="shimmer-line" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
                
                {/* Pulse dot */}
                <div className="pulse-glow" style={{ position: 'absolute', top: 20, right: 20, width: 8, height: 8, background: stat.color, borderRadius: '50%', boxShadow: `0 0 12px ${stat.color}`, animationDelay: `${i * 0.5}s` }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{stat.icon}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: stat.trend.startsWith('+') ? c.green : c.red, marginRight: 24 }}>{stat.trend}</span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: c.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: stat.color, textShadow: `0 0 20px ${stat.glow}` }}>{fmt(stat.value)}</p>
              </div>
            ))}
          </div>

          {/* TWO COLUMN - TABLE & CHART */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* MONTHLY TABLE */}
            <div style={{ ...cardStyle }}>
              <div style={{ padding: '24px 28px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Monthly Breakdown</h3>
                  <div className="pulse-glow" style={{ width: 6, height: 6, background: c.green, borderRadius: '50%', boxShadow: `0 0 10px ${c.green}` }} />
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '14px 24px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: c.textDim, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Month</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Sales</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Revenue</th>
                      <th style={{ padding: '14px 24px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: c.textDim }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      if (monthSales.length === 0) return null;
                      const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                      const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      return (
                        <tr key={month} className="row-hover" style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <LivePulse color="#10b981" size={6} speed={2} />
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{month}</span>
                            </div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, color: c.textMuted }}>{monthSales.length}</td>
                          <td style={{ padding: '16px', textAlign: 'right', fontSize: 14 }}>{fmt(monthRevenue)}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: c.green, background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: 6 }}>+{fmt(monthProfit)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <LivePulse color="#10b981" size={8} speed={1.5} />
                          <span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{filteredSales.length}</td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: c.green, textShadow: '0 0 20px rgba(16,185,129,0.4)' }}>+{fmt(netProfit)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* CHART */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Performance Chart</h3>
                  <LivePulse color="#10b981" size={6} speed={2} />
                </div>
                <StatusIndicator status="live" label="REALTIME" />
              </div>
              <div style={{ padding: '24px' }}>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
                  {[{ label: 'Revenue', color: 'rgba(255,255,255,0.5)' }, { label: 'Profit', color: '#10b981' }].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                      <span style={{ fontSize: 12, color: c.textMuted }}>{item.label}</span>
                      <LivePulse color={item.color} size={4} speed={2} />
                    </div>
                  ))}
                </div>

                {/* Chart Container */}
                <div style={{ position: 'relative', height: 200, display: 'flex', flexDirection: 'column' }}>
                  {/* Y-axis grid lines */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    {[100, 75, 50, 25, 0].map((pct, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                      </div>
                    ))}
                  </div>

                  {/* Bars */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 40 }}>
                    {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((month, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                      const monthRevenue = monthSales.reduce((sum, s) => sum + (s.salePrice || 0), 0);
                      const monthProfit = monthSales.reduce((sum, s) => sum + (s.profit || 0), 0);
                      
                      // Calculate max value for scaling (use highest month value, minimum 1000)
                      const allMonthsRevenue = ['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => 
                        filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === m).reduce((sum, s) => sum + (s.salePrice || 0), 0)
                      );
                      const maxVal = Math.max(...allMonthsRevenue, 1000);
                      
                      // Scale to max 120px height
                      const revHeight = monthRevenue > 0 ? Math.max((monthRevenue / maxVal) * 120, 4) : 0;
                      const profitHeight = monthProfit > 0 ? Math.max((monthProfit / maxVal) * 120, 4) : 0;
                      const hasData = monthRevenue > 0;
                      
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                          {/* Bar group */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 120, width: '100%' }}>
                            {/* Revenue bar */}
                            <div style={{ 
                              width: hasData ? 14 : 8, 
                              height: hasData ? revHeight : 2,
                              background: hasData 
                                ? 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 100%)' 
                                : 'rgba(255,255,255,0.05)',
                              borderRadius: hasData ? '4px 4px 0 0' : 2,
                              transition: 'all 0.5s ease'
                            }} />
                            {/* Profit bar */}
                            <div style={{ 
                              width: hasData ? 14 : 8, 
                              height: hasData ? profitHeight : 2,
                              background: hasData 
                                ? 'linear-gradient(180deg, #10b981 0%, rgba(16,185,129,0.4) 100%)' 
                                : 'rgba(16,185,129,0.08)',
                              borderRadius: hasData ? '4px 4px 0 0' : 2,
                              boxShadow: hasData ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
                              transition: 'all 0.5s ease'
                            }} />
                          </div>
                          
                          {/* Month label */}
                          <div style={{ 
                            position: 'absolute', 
                            bottom: 0, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: 4 
                          }}>
                            <span style={{ 
                              fontSize: 11, 
                              fontWeight: 600, 
                              color: hasData ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'
                            }}>{month}</span>
                            {hasData && <LivePulse color="#10b981" size={4} speed={2.5} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>;
        })()}

        {/* INVENTORY */}
        {page === 'inventory' && (() => {
          const currentSort = formData.inventorySort || 'newest';
          
          // Filter inventory
          const filteredInventory = purchases.filter(p => {
            const search = (formData.inventorySearch || '').toLowerCase().trim();
            const filter = formData.inventoryFilter || 'all';
            
            let matchesSearch = true;
            if (search) {
              matchesSearch = p.name?.toLowerCase().includes(search) || 
                             p.sku?.toLowerCase().includes(search) || 
                             p.size?.toString().toLowerCase().includes(search);
            }
            
            const matchesFilter = filter === 'all' || (filter === 'instock' && !p.sold) || (filter === 'sold' && p.sold);
            return matchesSearch && matchesFilter;
          });
          
          // Sort inventory
          const sortedInventory = [...filteredInventory].sort((a, b) => {
            switch(currentSort) {
              case 'newest': return new Date(b.date) - new Date(a.date);
              case 'oldest': return new Date(a.date) - new Date(b.date);
              case 'costHigh': return (b.cost || 0) - (a.cost || 0);
              case 'costLow': return (a.cost || 0) - (b.cost || 0);
              case 'nameAZ': return (a.name || '').localeCompare(b.name || '');
              case 'nameZA': return (b.name || '').localeCompare(a.name || '');
              case 'skuAZ': return (a.sku || '').localeCompare(b.sku || '');
              case 'skuZA': return (b.sku || '').localeCompare(a.sku || '');
              case 'sizeAsc': return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
              case 'sizeDesc': return (parseFloat(b.size) || 0) - (parseFloat(a.size) || 0);
              default: return 0;
            }
          });
          
          // Pagination
          const totalPages = Math.ceil(sortedInventory.length / ITEMS_PER_PAGE);
          const startIdx = (inventoryPage - 1) * ITEMS_PER_PAGE;
          const paginatedInventory = sortedInventory.slice(startIdx, startIdx + ITEMS_PER_PAGE);
      // MOBILE: Group ALL items by SKU, paginate groups instead of individual items
          const allGroups = {};
          sortedInventory.forEach(p => {
            const key = p.sku || p.name || 'Unknown';
            if (!allGroups[key]) allGroups[key] = { name: p.name, sku: p.sku, items: [] };
            allGroups[key].items.push(p);
          });
          const allGroupEntries = Object.entries(allGroups);
          const mobileGroupPages = Math.max(1, Math.ceil(allGroupEntries.length / ITEMS_PER_PAGE));
          const mobileStartIdx = (inventoryPage - 1) * ITEMS_PER_PAGE;
          const paginatedGroups = allGroupEntries.slice(mobileStartIdx, mobileStartIdx + ITEMS_PER_PAGE);
          const ITEMS_PER_EXPAND = 20;
          const effectiveTotalPages = isMobile ? mobileGroupPages : totalPages;
          const allPageIds = paginatedInventory.map(p => p.id);
          const allSelected = paginatedInventory.length > 0 && allPageIds.every(id => selectedInventory.has(id));
          
          // Handlers
          const handleSort = (sortKey, sortKeyAlt) => {
            setInventoryPage(1); // Reset to page 1 when sorting
            if (currentSort === sortKey) {
              setFormData(prev => ({ ...prev, inventorySort: sortKeyAlt }));
            } else {
              setFormData(prev => ({ ...prev, inventorySort: sortKey }));
            }
          };
          
          const handleSelectAll = (checked) => {
            if (checked) {
              setSelectedInventory(new Set(allPageIds));
            } else {
              setSelectedInventory(new Set());
            }
          };
          
          const handleSelectOne = (id, checked) => {
            setSelectedInventory(prev => {
              const newSet = new Set(prev);
              if (checked) newSet.add(id);
              else newSet.delete(id);
              return newSet;
            });
          };
          
          const isActiveSort = (key1, key2) => currentSort === key1 || currentSort === key2;
          const getSortArrow = (key1) => currentSort === key1 ? '▲' : '▼';
          
          return <div>
          
          {/* NIKE RECEIPT SCANNER */}
          <div style={{ marginBottom: 20 }}>
            {/* Drop Zone */}
            {!nikeReceipt.scanning && nikeReceipt.items.length === 0 && (
              <div style={{ background: 'rgba(249,115,22,0.05)', border: `1px solid rgba(249,115,22,0.2)`, borderRadius: 16, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid rgba(249,115,22,0.1)` }}>
                  <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #F97316, #EA580C)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📸</div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Scan Nike Receipt</h3>
                    <p style={{ margin: 0, fontSize: 12, color: c.textMuted }}>Auto-extract items from Nike App or Nike.com</p>
                  </div>
                </div>
                
                {/* Warning Box */}
                <div style={{ margin: '16px', padding: 12, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.gold, marginBottom: 8 }}>⚠️ REQUIREMENTS</div>
                  <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.6 }}>
                    <span style={{ color: c.green }}>✓</span> Nike App or Nike.com orders only<br/>
                    <span style={{ color: c.green }}>✓</span> Must show Style Code, Size & Price<br/>
                    <span style={{ color: c.red }}>✗</span> Paper receipts will NOT work
                  </div>
                </div>
                
                {/* See Example Button */}
                <div style={{ margin: '0 16px 16px' }}>
                  <button 
                    onClick={() => setShowNikeExample(true)}
                    style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px dashed #444', borderRadius: 8, color: c.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >👁️ See Example of Valid Screenshot</button>
                </div>
                
                {/* Drop Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#F97316'; e.currentTarget.style.background = 'rgba(249,115,22,0.15)'; }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                      parseNikeReceipt(file);
                    } else {
                      alert('Please drop an image file');
                    }
                  }}
                  style={{
                    margin: '0 16px 16px',
                    padding: '30px 20px',
                    background: 'rgba(0,0,0,0.2)',
                    border: `2px dashed transparent`,
                    borderRadius: 12,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => document.getElementById('nikeReceiptInput').click()}
                >
                  <input
                    id="nikeReceiptInput"
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files[0] && parseNikeReceipt(e.target.files[0])}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
                  <p style={{ margin: 0, fontSize: 13, color: c.textMuted }}>Drop Nike screenshot here or tap to upload</p>
                </div>
              </div>
            )}
            
            {/* Scanning State */}
            {nikeReceipt.scanning && (
              <div style={{ padding: 40, background: 'rgba(249,115,22,0.05)', border: `2px solid rgba(249,115,22,0.3)`, borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1s infinite' }}>🔍</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Scanning Receipt...</h3>
                <p style={{ margin: 0, color: c.textMuted, fontSize: 14 }}>Extracting items, prices, and sizes</p>
              </div>
            )}
            
            {/* Error State */}
            {nikeReceipt.error && (
              <div style={{ padding: 24, background: 'rgba(239,68,68,0.1)', border: `2px solid rgba(239,68,68,0.3)`, borderRadius: 16, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>😕</div>
                <p style={{ margin: '0 0 12px', color: c.red, fontWeight: 600 }}>{nikeReceipt.error}</p>
                <button onClick={() => setNikeReceipt({ scanning: false, items: [], image: null, date: '', orderNum: '' })} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Try Again</button>
              </div>
            )}
            
            {/* Scanned Items Review */}
            {nikeReceipt.items.length > 0 && (
              <div style={{ background: 'rgba(249,115,22,0.05)', border: `2px solid rgba(249,115,22,0.3)`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: 'rgba(249,115,22,0.1)', borderBottom: `1px solid rgba(249,115,22,0.2)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#F97316' }}>📸 Found {nikeReceipt.items.length} Items</h3>
                    {nikeReceipt.date && <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>{nikeReceipt.date} • {nikeReceipt.orderNum || 'Nike Order'}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setNikeReceipt({ scanning: false, items: [], image: null, date: '', orderNum: '' })} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: c.textMuted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={addNikeItemsToInventory} style={{ padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>✓ Add All to Inventory</button>
                  </div>
                </div>
                
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {nikeReceipt.items.map((item, idx) => (
                    <div key={idx} style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 36, height: 36, background: 'rgba(249,115,22,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#F97316' }}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>{item.name}</h4>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: c.textMuted }}>
                          <span style={{ color: '#F97316', fontWeight: 600 }}>{item.sku}</span>
                          {item.size && <span>Size {item.size}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: c.green }}>{fmt(item.price)}</div>
                        <div style={{ fontSize: 10, color: c.textDim }}>Cost</div>
                      </div>
                      {/* Edit button for manual corrections */}
                      <button
                        onClick={() => {
                          const newSku = prompt('Edit Style Code:', item.sku);
                          if (newSku !== null) {
                            const newSize = prompt('Edit Size:', item.size);
                            if (newSize !== null) {
                              const newPrice = prompt('Edit Price:', item.price);
                              if (newPrice !== null) {
                                setNikeReceipt(prev => ({
                                  ...prev,
                                  items: prev.items.map((it, i) => i === idx ? { ...it, sku: newSku, size: newSize, price: parseFloat(newPrice) || it.price } : it)
                                }));
                              }
                            }
                          }
                        }}
                        style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.textMuted, fontSize: 11, cursor: 'pointer' }}
                      >✏️ Edit</button>
                    </div>
                  ))}
                </div>
                
                <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: c.textMuted }}>Total Cost</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{fmt(nikeReceipt.items.reduce((sum, item) => sum + item.price, 0))}</span>
                </div>
              </div>
            )}
          </div>
          
          {/* STATS BAR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL ITEMS</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{purchases.length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>IN STOCK</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.green }}>{purchases.filter(p => !p.sold).length}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>INVESTED</span>
              <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: c.gold }}>{fmt(purchases.filter(p => !p.sold).reduce((s, x) => s + (x.cost || 0), 0))}</p>
            </div>
          </div>

          {/* SEARCH & ACTIONS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Search by name, SKU, or size..." 
              value={formData.inventorySearch || ''} 
              onChange={e => { setFormData(prev => ({ ...prev, inventorySearch: e.target.value })); setInventoryPage(1); }}
              style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.inventoryFilter || 'all'} onChange={e => { setFormData(prev => ({ ...prev, inventoryFilter: e.target.value })); setInventoryPage(1); }} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All ({purchases.length})</option>
              <option value="instock">In Stock ({purchases.filter(p => !p.sold).length})</option>
              <option value="sold">Sold ({purchases.filter(p => p.sold).length})</option>
            </select>
            <button onClick={() => setShowInvCsvImport(true)} style={{ padding: '14px 20px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, color: c.gold, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📥 IMPORT CSV</button>
            <button onClick={() => { setFormData(prev => ({ ...prev, bulkRows: [{ qty: '', size: '', cost: '' }], bulkSameCost: false, bulkUniformCost: '', bulkDate: '' })); setModal('bulkAdd'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ BULK ADD</button>
            <button onClick={() => { setFormData({}); setModal('purchase'); }} style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ SINGLE</button>
          </div>

          {/* CSV IMPORT PANEL */}
          {showInvCsvImport && (
            <div style={{ marginBottom: 16, padding: 20, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.gold }}>📥 Import Inventory CSV</h3>
                <button onClick={() => setShowInvCsvImport(false)} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              
              <p style={{ margin: '0 0 16px', fontSize: 13, color: c.textMuted }}>
                CSV or Excel file with columns: <strong style={{ color: '#fff' }}>Date, Name, SKU, Size, Cost</strong>
              </p>
              
              {/* Drag & Drop Zone */}
              <div 
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                onDrop={(e) => { 
                  e.preventDefault(); 
                  e.currentTarget.style.borderColor = c.border; 
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    handleInventoryFileUpload({ target: { files: [file] } });
                  } else {
                    alert('Please drop a CSV or Excel file');
                  }
                }}
                style={{ 
                  padding: 40, 
                  border: `2px dashed ${c.border}`, 
                  borderRadius: 12, 
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  marginBottom: 16,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                <p style={{ margin: 0, fontSize: 14, color: c.textMuted }}>
                  Drag & drop your CSV or Excel file here
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: c.textMuted }}>or</p>
                <label style={{ display: 'inline-block', marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 12, cursor: 'pointer' }}>
                  Browse Files
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleInventoryFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              
              <button onClick={downloadInventoryTemplate} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                📄 Download Template
              </button>
            </div>
          )}

          {/* SELECTION BAR */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => {
                const pageIds = paginatedInventory.map(p => p.id);
                setSelectedInventory(new Set(pageIds));
              }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: c.green, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Select Page ({paginatedInventory.length})</button>
              {selectedInventory.size > 0 && <button onClick={() => setSelectedInventory(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>✗ Clear</button>}
            </div>
            <span style={{ fontSize: 13, color: selectedInventory.size > 0 ? c.green : c.textMuted, fontWeight: selectedInventory.size > 0 ? 700 : 400 }}>{selectedInventory.size > 0 ? `${selectedInventory.size} selected` : 'None selected'}</span>
          </div>

          {/* BULK DELETE BAR */}
          {selectedInventory.size > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(239,68,68,0.15)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: c.red, fontSize: 14 }}>
                🗑️ {selectedInventory.size} item{selectedInventory.size > 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setSelectedInventory(new Set())} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, cursor: 'pointer', fontSize: 12 }}>
                  Clear Selection
                </button>
                <button onClick={async () => {
                  if (confirm(`Delete ${selectedInventory.size} item${selectedInventory.size > 1 ? 's' : ''}? This cannot be undone.`)) {
                    // Delete from Supabase
                    for (const id of selectedInventory) {
                      await deleteInventoryFromSupabase(id);
                    }
                    setPurchases(prev => prev.filter(p => !selectedInventory.has(p.id)));
                    setSelectedInventory(new Set());
                  }
                }} style={{ padding: '8px 20px', background: c.red, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  🗑️ Delete {selectedInventory.size} Item{selectedInventory.size > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* INVENTORY TABLE/CARDS */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: 13, color: c.textMuted }}>{isMobile ? `Showing ${mobileStartIdx + 1}-${Math.min(mobileStartIdx + ITEMS_PER_PAGE, allGroupEntries.length)} of ${allGroupEntries.length} SKUs · ${sortedInventory.length} items` : `Showing ${startIdx + 1}-${Math.min(startIdx + ITEMS_PER_PAGE, sortedInventory.length)} of ${sortedInventory.length} items`}</span>
              <button onClick={() => exportCSV(sortedInventory, 'inventory.csv', ['date','name','sku','size','cost','sold'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
                     {/* MOBILE CARD VIEW - Grouped by product */}
           {isMobile ? (
              <div style={{ padding: 12 }}>
                {paginatedGroups.length ? paginatedGroups.map(([key, group]) => {
                    const isExpanded = expandedInvProducts.has(key);
                    const inStock = group.items.filter(i => !i.sold).length;
                    const soldCount = group.items.filter(i => i.sold).length;
                    const costs = group.items.filter(i => i.cost).map(i => parseFloat(i.cost));
                    const minCost = costs.length ? Math.min(...costs) : 0;
                    const maxCost = costs.length ? Math.max(...costs) : 0;
                    const totalInvested = costs.reduce((a, b) => a + b, 0);
                    const sizes = group.items.map(i => i.size).filter(Boolean).sort((a, b) => parseFloat(a) - parseFloat(b));
                    const uniqueSizes = [...new Set(sizes)];
                    
                    const subPage = expandPages[key] || 1;
                    const totalSubPages = Math.ceil(group.items.length / ITEMS_PER_EXPAND);
                    const subStart = (subPage - 1) * ITEMS_PER_EXPAND;
                    const visibleItems = group.items.slice(subStart, subStart + ITEMS_PER_EXPAND);
                    
                    const getVisibleSubPages = () => {
                      if (totalSubPages <= 5) return Array.from({ length: totalSubPages }, (_, i) => i + 1);
                      if (subPage <= 3) return [1, 2, 3, 4, '...', totalSubPages];
                      if (subPage >= totalSubPages - 2) return [1, '...', totalSubPages - 3, totalSubPages - 2, totalSubPages - 1, totalSubPages];
                      return [1, '...', subPage - 1, subPage, subPage + 1, '...', totalSubPages];
                    };
                    
                    return (
                      <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${isExpanded ? 'rgba(201,169,98,0.3)' : c.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
                        <div
                          onClick={() => setExpandedInvProducts(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                          style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span style={{ fontSize: 10, color: c.textMuted, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</div>
                            <div style={{ fontSize: 10, color: c.green, marginTop: 1 }}>{group.sku || '-'}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{group.items.length}</div>
                            <div style={{ fontSize: 10, color: c.textMuted }}>{minCost === maxCost ? fmt(minCost) : `${fmt(minCost)} – ${fmt(maxCost)}`}</div>
                          </div>
                        </div>

                        {!isExpanded && uniqueSizes.length > 0 && (
                          <div style={{ padding: '0 14px 10px 32px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {uniqueSizes.slice(0, 14).map((s, i) => (
                              <span key={i} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`, borderRadius: 20, fontSize: 9, color: c.textMuted }}>{s}</span>
                            ))}
                            {uniqueSizes.length > 14 && <span style={{ padding: '2px 8px', fontSize: 9, color: c.textMuted }}>+{uniqueSizes.length - 14} more</span>}
                          </div>
                        )}

                        {isExpanded && (
                          <div style={{ borderTop: `1px solid ${c.border}` }}>
                            <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 16, borderBottom: `1px solid ${c.border}` }}>
                              <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>IN STOCK</div><div style={{ fontSize: 13, fontWeight: 700, color: c.green, marginTop: 2 }}>{inStock}</div></div>
                              {soldCount > 0 && <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>SOLD</div><div style={{ fontSize: 13, fontWeight: 700, color: c.gold, marginTop: 2 }}>{soldCount}</div></div>}
                              <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>INVESTED</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmt(totalInvested)}</div></div>
                              <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>SIZES</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: c.textMuted }}>{uniqueSizes.length}</div></div>
                            </div>

                            {visibleItems.map(p => {
                              const daysInStock = Math.floor((new Date() - new Date(p.date)) / (1000 * 60 * 60 * 24));
                              return (
                                <div key={p.id} style={{ padding: '10px 14px', borderTop: `1px solid ${c.border}`, opacity: p.sold ? 0.5 : 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <div style={{ width: 36, height: 36, background: p.sold ? 'rgba(201,169,98,0.08)' : 'rgba(255,255,255,0.06)', border: `1px solid ${p.sold ? 'rgba(201,169,98,0.3)' : c.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{p.size || '-'}</div>
                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                      <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600 }}>COST</div><div style={{ fontSize: 12, fontWeight: 700, color: c.gold, marginTop: 1 }}>{fmt(p.cost)}</div></div>
                                      <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600 }}>DAYS</div><div style={{ fontSize: 12, fontWeight: 700, marginTop: 1, color: !p.sold && daysInStock > 60 ? c.red : !p.sold && daysInStock > 30 ? c.gold : c.textMuted }}>{p.sold ? '-' : daysInStock}</div></div>
                                      <div><div style={{ fontSize: 7, color: c.textMuted, fontWeight: 600 }}>STATUS</div><div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: p.sold ? c.gold : c.green }}>{p.sold ? 'SOLD' : 'IN STOCK'}</div></div>
                                    </div>
                                  </div>
                                  {!p.sold && (
                                    <div style={{ display: 'flex', gap: 6, marginLeft: 44 }}>
                                      <button 
                                        onClick={() => { setFormData({ editId: p.id, name: p.name, sku: p.sku, size: p.size, cost: p.cost, date: p.date }); setModal('editInventory'); }} 
                                        style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                      >✏️ Edit</button>
                                      <button 
                                        onClick={() => { const updated = { ...p, sold: !p.sold }; updateInventoryInSupabase(updated); setPurchases(purchases.map(x => x.id === p.id ? updated : x)); }} 
                                        style={{ flex: 1, padding: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                      >💰 Sold</button>
                                      <button 
                                        onClick={() => { deleteInventoryFromSupabase(p.id); setPurchases(purchases.filter(x => x.id !== p.id)); setSelectedInventory(prev => { const n = new Set(prev); n.delete(p.id); return n; }); }} 
                                        style={{ padding: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: c.red, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                      >🗑️</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {totalSubPages > 1 && (
                              <div style={{ padding: '10px 14px', borderTop: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
                                <span style={{ fontSize: 10, color: c.textMuted }}>{subStart + 1}–{Math.min(subStart + ITEMS_PER_EXPAND, group.items.length)} of {group.items.length}</span>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <button onClick={(e) => { e.stopPropagation(); if (subPage > 1) setExpandPages(prev => ({ ...prev, [key]: subPage - 1 })); }} disabled={subPage === 1} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.04)', color: subPage === 1 ? 'rgba(255,255,255,0.15)' : c.textMuted, fontSize: 13, fontWeight: 700, cursor: subPage === 1 ? 'default' : 'pointer' }}>‹</button>
                                  {getVisibleSubPages().map((p, i) => p === '...' ? (
                                    <span key={`e-${i}`} style={{ fontSize: 11, color: c.textMuted, padding: '0 2px' }}>···</span>
                                  ) : (
                                    <button key={p} onClick={(e) => { e.stopPropagation(); setExpandPages(prev => ({ ...prev, [key]: p })); }} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${subPage === p ? c.green : c.border}`, background: subPage === p ? c.green : 'rgba(255,255,255,0.04)', color: subPage === p ? '#000' : c.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p}</button>
                                  ))}
                                  <button onClick={(e) => { e.stopPropagation(); if (subPage < totalSubPages) setExpandPages(prev => ({ ...prev, [key]: subPage + 1 })); }} disabled={subPage === totalSubPages} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.04)', color: subPage === totalSubPages ? 'rgba(255,255,255,0.15)' : c.textMuted, fontSize: 13, fontWeight: 700, cursor: subPage === totalSubPages ? 'default' : 'pointer' }}>›</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                }) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📦</div><p style={{ color: c.textMuted }}>No inventory matches your filters</p><button onClick={() => { setFormData(prev => ({ ...prev, bulkRows: [{ qty: 1, size: '', cost: '' }] })); setModal('bulkAdd'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Add Items</button></div>}
              </div>
            ) : (
              <>
                {/* TABLE HEADER - Clickable for sorting */}
                <div style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 130px 60px 80px 70px 90px 60px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" checked={allSelected} onChange={(e) => handleSelectAll(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} />
                  </div>
                  <span onClick={() => handleSort('oldest', 'newest')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('oldest', 'newest') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                    DATE {isActiveSort('oldest', 'newest') && getSortArrow('oldest')}
                  </span>
                  <span onClick={() => handleSort('nameAZ', 'nameZA')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('nameAZ', 'nameZA') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                    NAME {isActiveSort('nameAZ', 'nameZA') && getSortArrow('nameAZ')}
                  </span>
                  <span onClick={() => handleSort('skuAZ', 'skuZA')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('skuAZ', 'skuZA') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                    SKU {isActiveSort('skuAZ', 'skuZA') && getSortArrow('skuAZ')}
                  </span>
                  <span onClick={() => handleSort('sizeAsc', 'sizeDesc')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('sizeAsc', 'sizeDesc') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none' }}>
                    SIZE {isActiveSort('sizeAsc', 'sizeDesc') && getSortArrow('sizeAsc')}
                  </span>
                  <span onClick={() => handleSort('costLow', 'costHigh')} style={{ fontSize: 10, fontWeight: 700, color: isActiveSort('costLow', 'costHigh') ? c.green : c.textMuted, cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>
                    COST {isActiveSort('costLow', 'costHigh') && getSortArrow('costLow')}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>DAYS</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>STATUS</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>ACTIONS</span>
                </div>

                {/* TABLE ROWS */}
                {paginatedInventory.length ? paginatedInventory.map(p => {
                  const daysInStock = Math.floor((new Date() - new Date(p.date)) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 130px 60px 80px 70px 90px 60px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', background: selectedInventory.has(p.id) ? 'rgba(239,68,68,0.1)' : p.sold ? 'rgba(251,191,36,0.05)' : 'transparent' }}>
                      <div>
                        <input type="checkbox" checked={selectedInventory.has(p.id)} onChange={(e) => handleSelectOne(p.id, e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.green }} />
                      </div>
                      <span style={{ fontSize: 12, color: c.textMuted }}>{p.date}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: p.sold ? c.textMuted : '#fff' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: c.green }}>{p.sku || '-'}</span>
                      <span style={{ fontSize: 13 }}>{p.size || '-'}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmt(p.cost)}</span>
                      <span style={{ fontSize: 12, textAlign: 'center', color: !p.sold && daysInStock > 60 ? c.red : !p.sold && daysInStock > 30 ? c.gold : c.textMuted }}>{p.sold ? '-' : daysInStock}</span>
                      <div style={{ textAlign: 'center' }}>
                        <button onClick={() => { const updated = { ...p, sold: !p.sold }; updateInventoryInSupabase(updated); setPurchases(purchases.map(x => x.id === p.id ? updated : x)); }} style={{ padding: '4px 10px', background: p.sold ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.1)', border: `1px solid ${p.sold ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 6, color: p.sold ? c.gold : c.green, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          {p.sold ? '🟡 SOLD' : 'IN STOCK'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button onClick={() => { setFormData({ editId: p.id, name: p.name, sku: p.sku, size: p.size, cost: p.cost, date: p.date }); setModal('editInventory'); }} style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer', fontSize: 14 }}>✏️</button>
                        <button onClick={() => { deleteInventoryFromSupabase(p.id); setPurchases(purchases.filter(x => x.id !== p.id)); setSelectedInventory(prev => { const n = new Set(prev); n.delete(p.id); return n; }); }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                    </div>
                  );
                }) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>📦</div><p style={{ color: c.textMuted }}>No inventory matches your filters</p><button onClick={() => { setFormData(prev => ({ ...prev, bulkRows: [{ qty: 1, size: '', cost: '' }] })); setModal('bulkAdd'); }} style={{ marginTop: 12, padding: '10px 20px', ...btnPrimary, fontSize: 13 }}>+ Add Items</button></div>}
              </>
            )}
            
            {/* PAGINATION */}
            {effectiveTotalPages > 1 && (
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setInventoryPage(1)} disabled={inventoryPage === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === 1 ? c.textMuted : '#fff', cursor: inventoryPage === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>«</button>
                <button onClick={() => setInventoryPage(p => Math.max(1, p - 1))} disabled={inventoryPage === 1} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === 1 ? c.textMuted : '#fff', cursor: inventoryPage === 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>‹</button>
                
                {Array.from({ length: Math.min(5, effectiveTotalPages) }, (_, i) => {
                  let pageNum;
                 if (effectiveTotalPages <= 5)pageNum = i + 1;
                  else if (inventoryPage <= 3) pageNum = i + 1;
                  else if (inventoryPage >= effectiveTotalPages - 2) pageNum = effectiveTotalPages - 4 + i;
                  else pageNum = inventoryPage - 2 + i;
                  return (
                    <button key={pageNum} onClick={() => setInventoryPage(pageNum)} style={{ padding: '8px 14px', background: inventoryPage === pageNum ? c.green : 'rgba(255,255,255,0.05)', border: `1px solid ${inventoryPage === pageNum ? c.green : c.border}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: inventoryPage === pageNum ? 700 : 400 }}>{pageNum}</button>
                  );
                })}
                
                <button onClick={() => setInventoryPage(p => Math.min(effectiveTotalPages, p + 1))} disabled={inventoryPage === effectiveTotalPages} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === effectiveTotalPages ? c.textMuted : '#fff', cursor: inventoryPage === effectiveTotalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>›</button>
                <button onClick={() => setInventoryPage(effectiveTotalPages)} disabled={inventoryPage === effectiveTotalPages}style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: inventoryPage === effectiveTotalPages ? c.textMuted : '#fff', cursor: inventoryPage === effectiveTotalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}>»</button>
              </div>
            )}
          </div>
        </div>;
        })()}

        {/* SALES */}
        {page === 'sales' && <SalesPage 
          key={`sales-${salesPage}-${formData.salesSort}-${formData.salesMonth}-${formData.salesFilter}`}
          filteredSales={filteredSales}
          formData={formData}
          setFormData={setFormData}
          salesPage={salesPage}
          setSalesPage={setSalesPage}
          selectedSales={selectedSales}
          setSelectedSales={setSelectedSales}
          sales={sales}
          setSales={setSales}
          settings={settings}
          setModal={setModal}
          ITEMS_PER_PAGE={ITEMS_PER_PAGE}
          cardStyle={cardStyle}
          btnPrimary={btnPrimary}
          c={c}
          fmt={fmt}
          exportCSV={exportCSV}
          deleteSaleFromSupabase={deleteSaleFromSupabase}
          markSaleRefunded={markSaleRefunded} 
          isMobile={isMobile}                     
        />}

        {/* EXPENSES */}
        {page === 'expenses' && (() => {
          // Category icons
          const categoryIcons = {
            'Shipping': '📦',
            'Packaging & Supplies': '🛍️',
            'Labels & Printing': '🏷️',
            'Storage Unit': '🏠',
            'Software & Subscriptions': '💻',
            'Authentication Fees': '✅',
            'Office Supplies': '📎',
            'Travel & Meals': '🚗',
            'Other': '📋'
          };
          
          // Filter expenses
          const expenseSearch = (formData.expenseSearch || '').toLowerCase().trim();
          const expenseCatFilter = formData.expenseCatFilter || 'all';
          
          const filteredExp = filteredExpenses.filter(e => {
            if (expenseSearch) {
              const inCat = e.category?.toLowerCase().includes(expenseSearch);
              const inDesc = e.description?.toLowerCase().includes(expenseSearch);
              if (!inCat && !inDesc) return false;
            }
            if (expenseCatFilter !== 'all' && e.category !== expenseCatFilter) return false;
            return true;
          });
          
          // Monthly breakdown
          const monthlyExpenses = {};
          filteredExpenses.forEach(e => {
            if (e.date) {
              const month = e.date.substring(0, 7);
              monthlyExpenses[month] = (monthlyExpenses[month] || 0) + (e.amount || 0);
            }
          });
          const monthlyData = Object.entries(monthlyExpenses).sort((a, b) => a[0].localeCompare(b[0]));
          
          return <div style={{ maxWidth: 900 }}>
          {/* STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>TOTAL EXPENSES</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.red }}>{fmt(totalExp)}</p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>THIS MONTH</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: c.gold }}>
                {fmt(filteredExpenses.filter(e => e.date && e.date.startsWith(new Date().toISOString().substring(0, 7))).reduce((s, e) => s + (e.amount || 0), 0))}
              </p>
            </div>
            <div style={{ ...cardStyle, padding: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted }}>ENTRIES</span>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#fff' }}>{filteredExpenses.length}</p>
            </div>
          </div>
          
          {/* Monthly Chart */}
          {monthlyData.length > 0 && (
            <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>📊 Monthly Breakdown</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                {monthlyData.slice(-6).map(([month, amount]) => {
                  const maxAmount = Math.max(...monthlyData.map(d => d[1]));
                  const height = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                  return (
                    <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, color: c.textMuted }}>{fmt(amount)}</span>
                      <div style={{ width: '100%', height: height + '%', minHeight: 4, background: `linear-gradient(180deg, ${c.red} 0%, rgba(239,68,68,0.3) 100%)`, borderRadius: 4 }} />
                      <span style={{ fontSize: 9, color: c.textMuted }}>{month.substring(5)}/{month.substring(2, 4)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* SEARCH & FILTER */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Search expenses..." 
              value={formData.expenseSearch || ''} 
              onChange={e => setFormData({ ...formData, expenseSearch: e.target.value })}
              style={{ flex: 1, minWidth: 200, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 14 }} 
            />
            <select value={formData.expenseCatFilter || 'all'} onChange={e => setFormData({ ...formData, expenseCatFilter: e.target.value })} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">All Categories</option>
              {expenseCategories.map(cat => <option key={cat} value={cat}>{categoryIcons[cat]} {cat}</option>)}
            </select>
            <button onClick={() => { setFormData({}); setModal('expense'); }} style={{ padding: '14px 24px', ...btnPrimary, fontSize: 13 }}>+ Add Expense</button>
          </div>
          
          {/* EXPENSES TABLE */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: c.textMuted }}>
                {filteredExp.length} expense{filteredExp.length !== 1 ? 's' : ''} 
                {expenseCatFilter !== 'all' && ` in ${expenseCatFilter}`}
              </span>
              <button onClick={() => exportCSV(filteredExp, 'expenses.csv', ['date','category','description','amount'])} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>📥 Export</button>
            </div>
            
            {filteredExp.length ? filteredExp.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {categoryIcons[e.category] || '📋'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.category}</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>{e.date} • {e.description || 'No description'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: c.red, fontWeight: 700, fontSize: 16 }}>{fmt(e.amount)}</span>
                  <button onClick={() => { setFormData({ editExpenseId: e.id, category: e.category, amount: e.amount, description: e.description, date: e.date }); setModal('editExpense'); }} style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer', fontSize: 14 }}>✏️</button>
                  <button onClick={async () => {
                    const result = await safeDeleteExpense(user.id, e.id);
                    if (result.success) {
                      setExpenses(expenses.filter(x => x.id !== e.id));
                      console.log('[Expenses] Deleted:', e.id);
                    } else {
                      console.error('[Expenses] Delete failed:', result.error);
                      alert('Failed to delete expense: ' + (result.error || 'Unknown error'));
                    }
                  }} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              </div>
            )) : <div style={{ padding: 50, textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 12 }}>💳</div><p style={{ color: c.textMuted }}>{expenseSearch || expenseCatFilter !== 'all' ? 'No matching expenses' : 'No expenses yet'}</p></div>}
          </div>
        </div>;
        })()}

        {/* MILEAGE */}
        {/* CPA REPORTS */}
        {page === 'reports' && <div style={{ maxWidth: 1000 }}>
                   {/* ALL GROSS METHOD — Report full selling price, deduct ALL fees */}
          {(() => {
            // ALL GROSS: Every platform reports salePrice as income, fees deducted separately
            // This is HIGHER than 1099-Ks for StockX (which reports payout) = safe with IRS
            
            let line1_gross = 0;      // Full selling price, all platforms
            let line10_fees = 0;       // ALL platform fees
            let totalCostOfGoods = 0;  // COGS
            
            const platformData = {};
            
            filteredSales.forEach(s => {
              const platform = s.platform || 'Other';
              
              // Initialize platform data
              if (!platformData[platform]) {
                platformData[platform] = { 
                  sales: 0, 
                  gross1099K: 0,   // Full selling price
                  fees: 0,         // All fees
                  cogs: 0,
                  payout: 0
                };
              }
              
              platformData[platform].sales++;
              platformData[platform].cogs += s.cost || 0;
              platformData[platform].gross1099K += s.salePrice || 0;
              platformData[platform].fees += s.fees || 0;
              platformData[platform].payout += (s.payout || (s.salePrice - (s.fees || 0)));
              totalCostOfGoods += s.cost || 0;
              
              // Same rule for ALL platforms
              line1_gross += s.salePrice || 0;
              line10_fees += s.fees || 0;
            });

            
            const line5_grossProfit = line1_gross - totalCostOfGoods;
            const line31_netProfit = line1_gross - totalCostOfGoods - line10_fees - totalExp;
            
            return (
              <>
          {/* ACTION BUTTONS */}
          <div style={{ marginBottom: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn-hover" onClick={() => {
              // Export CPA-ready Excel with multiple sheets
              const wb = XLSX.utils.book_new();
              
              // Sheet 1: Schedule C Summary (1099-K Compliant)
              const scheduleC = [
                ['SCHEDULE C - PROFIT OR LOSS FROM BUSINESS', ''],
                ['Tax Year:', year],
                ['Generated:', new Date().toLocaleDateString()],
                ['', ''],
                ['*** ALL GROSS METHOD ***', ''],
                ['All platforms: Report full selling price as gross income', ''],
                ['All platforms: Deduct ALL fees on Line 10', ''],
                ['', ''],
                ['LINE', 'DESCRIPTION', 'AMOUNT'],
                ['Line 1', 'Gross receipts (full selling price, all platforms)', line1_gross],
                ['Line 4', 'Cost of goods sold', totalCostOfGoods],
                ['Line 5', 'Gross profit (Line 1 - Line 4)', line5_grossProfit],
                ['Line 10', 'Commissions/fees (all platforms)', line10_fees],
                ['Line 27a', 'Other expenses', totalExp],
                ['Line 31', 'NET PROFIT', line31_netProfit],
              ];
              const ws1 = XLSX.utils.aoa_to_sheet(scheduleC);
              XLSX.utils.book_append_sheet(wb, ws1, 'Schedule C');
              
              // Sheet 2: Platform Breakdown (1099-K Reconciliation)
              const platformRows = [
                ['1099-K RECONCILIATION BY PLATFORM'],
                [''],
                ['PLATFORM', 'SALES', '1099-K AMOUNT', 'DEDUCTIBLE FEES', 'COGS', 'NET PROFIT', 'NOTES']
              ];
              Object.entries(platformData).forEach(([p, d]) => {
                const isStockX = p.toLowerCase().includes('stockx');
                const isGoat = p.toLowerCase().includes('goat');
                const netProfit = d.gross1099K - d.cogs - d.fees;
                platformRows.push([
                  p, 
                  d.sales, 
                  d.gross1099K, 
                  d.fees,
                  d.cogs, 
                  netProfit,
                  'Gross (all fees deducted on Line 10)'
                ]);
              });
              platformRows.push(['TOTAL', filteredSales.length, line1_gross, line10_fees, totalCostOfGoods, line31_netProfit + totalExp, '']);
              const ws2 = XLSX.utils.aoa_to_sheet(platformRows);
              XLSX.utils.book_append_sheet(wb, ws2, '1099-K Reconciliation');
              
              // Sheet 3: Monthly Breakdown
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const monthlyRows = [['MONTH', 'SALES', '1099-K AMOUNT', 'COGS', 'FEES', 'NET PROFIT']];
              months.forEach((month, i) => {
                const monthNum = String(i + 1).padStart(2, '0');
                const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                if (monthSales.length > 0) {
                  let mGross = 0, mFees = 0, mCogs = 0;
                  monthSales.forEach(s => {
                   mCogs += s.cost || 0;
              mGross += s.salePrice || 0;
              mFees += s.fees || 0;
                    
                  });
                  monthlyRows.push([month, monthSales.length, mGross, mCogs, mFees, mGross - mCogs - mFees]);
                }
              });
              monthlyRows.push(['TOTAL', filteredSales.length, line1_gross, totalCostOfGoods, line10_fees, line31_netProfit + totalExp]);
              const ws3 = XLSX.utils.aoa_to_sheet(monthlyRows);
              XLSX.utils.book_append_sheet(wb, ws3, 'By Month');
              
              // Sheet 4: All Transactions
              const txRows = [['DATE', 'PLATFORM', 'ITEM', 'SKU', 'SIZE', 'SALE PRICE', 'PAYOUT', 'COGS', 'FEES', '1099-K AMOUNT', 'NET PROFIT']];
              filteredSales.forEach(s => {
                const payout = s.payout || (s.salePrice - (s.fees || 0));
              txRows.push([
                s.saleDate,
                s.platform,
                s.name,
                s.sku,
                s.size,
                s.salePrice || 0,
                payout,
                s.cost || 0,
                s.fees || 0,
                s.salePrice || 0,
                (s.salePrice || 0) - (s.cost || 0) - (s.fees || 0)
              ]);

              });
              const ws4 = XLSX.utils.aoa_to_sheet(txRows);
              XLSX.utils.book_append_sheet(wb, ws4, 'All Transactions');
              
              XLSX.writeFile(wb, `FlipLedger_TaxReport_${year}.xlsx`);
            }} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📊 Export CPA Package (Excel)
            </button>
            <button className="btn-hover" onClick={printTaxPackage} style={{ padding: '12px 24px', ...btnPrimary, fontSize: 13 }}>🖨️ Print Tax Summary</button>
          </div>
          
      {/* ALL GROSS REPORTING METHOD */}
          <div style={{ ...cardStyle, padding: 20, marginBottom: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#34d399' }}>✅ All Gross Method</h3>
            <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.8 }}>
              <div>Your reported gross income may be higher than your 1099-K totals. This is normal — we report the full selling price and deduct fees separately, which is the safest method for IRS reporting.</div>
            </div>
          </div>
          
          {/* SCHEDULE C MAPPING */}
          <div className="print-report" style={{ ...cardStyle, padding: 32, marginBottom: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #333' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>📋 SCHEDULE C SUMMARY</h1>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: c.textMuted }}>Tax Year {year} • All Gross Method</p>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${c.border}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: c.textMuted }}>LINE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: c.textMuted }}>DESCRIPTION</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: c.textMuted }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#60a5fa' }}>Line 1</td>
                  <td style={{ padding: '14px 16px' }}>
                    Gross receipts or sales
                    <div style={{ fontSize: 11, color: c.textMuted }}>Full selling price, all platforms</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15 }}>{fmt(line1_gross)}</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#60a5fa' }}>Line 4</td>
                  <td style={{ padding: '14px 16px' }}>Cost of goods sold</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, color: c.gold }}>{fmt(totalCostOfGoods)}</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#60a5fa' }}>Line 5</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600 }}>Gross profit (Line 1 − Line 4)</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, fontWeight: 700 }}>{fmt(line5_grossProfit)}</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#60a5fa' }}>Line 10</td>
                  <td style={{ padding: '14px 16px' }}>
                    Commissions and fees
                    <div style={{ fontSize: 11, color: c.textMuted }}>All platform fees (StockX, eBay, GOAT, etc.)</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, color: c.red }}>{fmt(line10_fees)}</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#60a5fa' }}>Line 27a</td>
                  <td style={{ padding: '14px 16px' }}>Other expenses</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 15, color: c.red }}>{fmt(totalExp)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <td style={{ padding: '18px 16px', fontWeight: 800, color: c.green }}>Line 31</td>
                  <td style={{ padding: '18px 16px', fontWeight: 800 }}>NET PROFIT (or Loss)</td>
                  <td style={{ padding: '18px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: line31_netProfit >= 0 ? c.green : c.red }}>
                    {fmt(line31_netProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* 1099-K RECONCILIATION BY PLATFORM */}
          <div className="no-print" style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}` }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🔗 1099-K Reconciliation by Platform</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Match these totals to your 1099-K forms</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PLATFORM</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SALES</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>1099-K AMOUNT</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>DEDUCTIBLE FEES</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(platformData).sort((a,b) => b[1].gross1099K - a[1].gross1099K).map(([platform, data]) => {
                  const isStockX = platform.toLowerCase().includes('stockx');
                  const isGoat = platform.toLowerCase().includes('goat');
                  return (
                    <tr key={platform} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ 
                          display: 'inline-block', 
                          padding: '4px 10px', 
                          borderRadius: 20, 
                          fontSize: 11, 
                          fontWeight: 600,
                          background: platform.toLowerCase().includes('ebay') ? 'rgba(229,50,56,0.2)' : (isStockX || isGoat) ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
                          color: platform.toLowerCase().includes('ebay') ? '#e53238' : (isStockX || isGoat) ? '#22c55e' : c.text
                        }}>{platform}</span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>{data.sales}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(data.gross1099K)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', color: data.fees > 0 ? c.red : c.textMuted }}>{data.fees > 0 ? fmt(data.fees) : '$0.00'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 11, color: c.textMuted }}>
                       {platform.toLowerCase().includes('stockx') ? '← 1099-K shows payout (lower) — difference is fees' : `← Should be close to ${platform} 1099-K`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 700 }}>Total (Line 1)</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700 }}>{filteredSales.length}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(line1_gross)}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: c.red }}>{fmt(line10_fees)}</td>
                  <td style={{ padding: '14px 16px', fontSize: 11, color: c.textMuted }}>← Total reported gross (all platforms)</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* MONTHLY BREAKDOWN */}
          <div className="card-hover no-print" style={{ ...cardStyle, marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📅 MONTHLY BREAKDOWN</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.textMuted }}>MONTH</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>SALES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>1099-K AMT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>COGS</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>FEES</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: c.textMuted }}>PROFIT</th>
                  </tr>
                </thead>
                <tbody>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                    const monthNum = String(i + 1).padStart(2, '0');
                    const monthSales = filteredSales.filter(s => s.saleDate && s.saleDate.substring(5, 7) === monthNum);
                    if (monthSales.length === 0) return null;
                    
                    let mGross = 0, mFees = 0, mCogs = 0;
                    monthSales.forEach(s => {
                      mCogs += s.cost || 0;
              mGross += s.salePrice || 0;
              mFees += s.fees || 0;
                    });
                    const mProfit = mGross - mCogs - mFees;
                    
                    return (
                      <tr key={month} className="row-hover" style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{month}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{monthSales.length}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(mGross)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', color: c.gold }}>{fmt(mCogs)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', color: c.red }}>{fmt(mFees)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: mProfit >= 0 ? c.green : c.red }}>{fmt(mProfit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <td style={{ padding: '16px', fontWeight: 800 }}>TOTAL</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700 }}>{filteredSales.length}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(line1_gross)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: c.gold }}>{fmt(totalCostOfGoods)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: c.red }}>{fmt(line10_fees)}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', fontSize: 16, color: line31_netProfit + totalExp >= 0 ? c.green : c.red }}>{fmt(line31_netProfit + totalExp)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* QUICK EMAIL TEMPLATE */}
          <div className="card-hover no-print" style={{ ...cardStyle, padding: 24, marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>✉️ COPY FOR YOUR CPA</h4>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: c.textMuted }}>Click to copy a ready-to-send summary:</p>
            <div 
              onClick={() => {
                const platformLines = Object.entries(platformData).map(([p, d]) => {
                 return `• ${p}: ${fmt(d.gross1099K)} (${d.sales} sales) - gross, all fees on Line 10`;
                }).join('\n');
                
                const text = `Hi,

Here are my reselling business numbers for ${year}:

SCHEDULE C SUMMARY (ALL GROSS METHOD):
• Line 1 - Gross Receipts: ${fmt(line1_gross)}
• Line 4 - Cost of Goods Sold: ${fmt(totalCostOfGoods)}
• Line 5 - Gross Profit: ${fmt(line5_grossProfit)}
• Line 10 - Fees (all platforms): ${fmt(line10_fees)}
• Line 27a - Other Expenses: ${fmt(totalExp)}
• Line 31 - Net Profit: ${fmt(line31_netProfit)}

1099-K BREAKDOWN BY PLATFORM:
${platformLines}

IMPORTANT NOTES:
- All platforms: I report FULL GROSS selling price and deduct ALL fees on Line 10
- StockX 1099-K shows payout (lower than reported gross) - difference is their fees

I've attached the detailed Excel with all ${filteredSales.length} transactions.

Let me know if you need anything else.`;
                navigator.clipboard.writeText(text);
                alert('Copied to clipboard! Paste into your email.');
              }}
              style={{ 
                padding: 16, 
                background: 'rgba(255,255,255,0.03)', 
                border: `1px solid ${c.border}`, 
                borderRadius: 12, 
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: 'monospace'
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 700 }}>SCHEDULE C ({year}):</div>
              <div>• Line 1 (Gross): {fmt(line1_gross)}</div>
              <div>• Line 4 (COGS): {fmt(totalCostOfGoods)}</div>
              <div>• Line 10 (Fees): {fmt(line10_fees)}</div>
              <div>• Line 31 (Profit): {fmt(line31_netProfit)}</div>
              <div style={{ marginTop: 12, color: c.green }}>📋 Click to copy full email</div>
            </div>
          </div>
          
          {/* EXPORT DETAIL REPORTS */}
          <div className="card-hover no-print" style={{ ...cardStyle, padding: 24 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>📎 EXPORT DETAIL REPORTS</h4>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: c.textMuted }}>Download detailed data for backup documentation</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <button className="btn-hover" onClick={() => exportCSV(filteredSales, 'sales-detail.csv', ['saleDate','name','sku','size','platform','salePrice','payout','cost','fees','profit'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>💰</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Sales Detail</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{filteredSales.length} transactions</div>
              </button>
              <button className="btn-hover" onClick={() => exportCSV(filteredExpenses, 'expenses-detail.csv', ['date','category','description','amount'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🧾</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Expenses Detail</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{filteredExpenses.length} expenses</div>
              </button>
              <button className="btn-hover" onClick={() => exportCSV(inventory, 'inventory.csv', ['date','name','sku','size','cost'])} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 12, color: '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Inventory</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{inventory.length} items • {fmt(inventory.reduce((s, x) => s + (x.cost || 0), 0))}</div>
              </button>
            </div>
          </div>
              </>
            );
          })()}
        </div>}
        {/* IMPORT */}
        {page === 'import' && <div style={{ maxWidth: 1100 }}>
          {/* SPLIT SCREEN LAYOUT - Always visible */}
         <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
            {/* LEFT SIDE - Main Content */}
            <div>
          {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {/* Header */}
              <div style={{ padding: '12px 16px', background: 'rgba(251,191,36,0.08)', border: `1px solid rgba(251,191,36,0.15)`, borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Pending Costs</span>
                  <span style={{ background: 'rgba(251,191,36,0.2)', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: c.gold }}>{pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select 
                    defaultValue="date"
                    onChange={(e) => {
                      const sortBy = e.target.value;
                      setPendingCosts(prev => {
                        const sorted = [...prev];
                        if (sortBy === 'item') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                        if (sortBy === 'date') sorted.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
                        if (sortBy === 'price') sorted.sort((a, b) => (b.payout || 0) - (a.payout || 0));
                        if (sortBy === 'sku') sorted.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
                        return sorted;
                      });
                    }}
                    style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 4, color: c.text, fontSize: 11, cursor: 'pointer' }}
                  >
                    <option value="date">Date</option>
                    <option value="item">Name</option>
                    <option value="sku">SKU</option>
                    <option value="price">Payout</option>
                  </select>
                  <AutoMatchButton userId={user.id} onComplete={() => loadUserData(user.id)} />
                  <button onClick={async () => { 
                    if (confirm(`Clear all?`)) {
                      await deleteAllPendingFromSupabase();
                      setPendingCosts([]);
                      setSelectedPending(new Set());
                    }
                  }} style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 4, color: c.red, cursor: 'pointer', fontSize: 11 }}>
                    Clear
                  </button>
                </div>
              </div>

              {/* Multi-Select Bulk Action Bar */}
              {selectedPending.size > 0 && (
                <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.15)', borderLeft: `1px solid ${c.green}`, borderRight: `1px solid ${c.green}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 700, color: c.green, fontSize: 15 }}>{selectedPending.size} selected</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, color: c.textMuted }}>Cost each:</span>
                    <input 
                      type="number" 
                      placeholder="$0"
                      value={bulkCost}
                      onChange={e => setBulkCost(e.target.value)}
                      style={{ width: 100, padding: '10px 12px', background: 'rgba(255,255,255,0.1)', border: `2px solid ${c.green}`, borderRadius: 6, color: c.text, fontSize: 16, fontWeight: 700, textAlign: 'center' }} 
                    />
                    <button 
                      onClick={async () => {
                        if (!bulkCost) { alert('Enter a cost first'); return; }
                        for (const id of selectedPending) { await confirmSaleWithCost(id, bulkCost, 'StockX Standard'); }
                        setSelectedPending(new Set());
                        setBulkCost('');
                      }}
                      style={{ padding: '10px 24px', background: c.green, border: 'none', borderRadius: 6, color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                    >
                      Apply to All
                    </button>
                  </div>
                  <button onClick={() => setSelectedPending(new Set())} style={{ marginLeft: 'auto', padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.textMuted, cursor: 'pointer', fontSize: 13 }}>
                    Cancel
                  </button>
                </div>
              )}

                           {isMobile ? (
              <div style={{ padding: 12 }}>
                {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map((s, idx, arr) => (
                  <div key={s.id} style={{ marginBottom: 10 }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${mobileInvDrawer === s.id ? 'rgba(201,169,98,0.3)' : c.border}`, borderRadius: mobileInvDrawer === s.id ? '12px 12px 0 0' : 12, padding: 12 }}>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                          <ProductIcon name={s.name} size={40} />
                          {s.image && <img src={s.image} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} onError={e => { e.target.style.display = 'none'; }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: c.textMuted }}>{s.sku && <span style={{ color: '#666' }}>{s.sku} · </span>}{s.saleDate} <span style={{ color: s.platform === 'eBay' ? '#3b82f6' : '#00c165', fontWeight: 600 }}>· {s.platform || 'eBay'}</span></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginBottom: 8, borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>SIZE</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{s.size || '-'}</div></div>
                        <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>PAYOUT</div><div style={{ fontSize: 15, fontWeight: 700, color: c.green, marginTop: 2 }}>{fmt(s.payout)}</div></div>
                        <div style={{ textAlign: 'center', flex: 1 }}><div style={{ fontSize: 9, color: c.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>DATE</div><div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginTop: 3 }}>{s.saleDate ? s.saleDate.slice(5) : '-'}</div></div>
                      </div>
                      <input type="number" placeholder="Enter cost..." id={`cost-${s.id}`} onKeyDown={async (e) => {if (e.key === 'Enter' && e.target.value) { await confirmSaleWithCost(s.id, e.target.value, s.platform || 'StockX'); e.target.value = ''; }}} style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setMobileInvDrawer(mobileInvDrawer === s.id ? null : s.id)} style={{ flex: 1, padding: 10, background: 'rgba(201,169,98,0.1)', border: '1px solid rgba(201,169,98,0.3)', borderRadius: 8, color: c.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📦</button>
                        <button onClick={async () => { const input = document.getElementById(`cost-${s.id}`); if (input && input.value) { await confirmSaleWithCost(s.id, input.value, s.platform || 'StockX'); input.value = ''; }}} style={{ flex: 1, padding: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: c.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ ✓</button>
                        <button onClick={() => { deletePendingFromSupabase(s.id); setPendingCosts(prev => prev.filter(x => x.id !== s.id)); setSelectedPending(prev => { const n = new Set(prev); n.delete(s.id); return n; }); }} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: c.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                      </div>
                    </div>
                    {mobileInvDrawer === s.id && (
                      <div style={{ background: 'rgba(201,169,98,0.04)', border: '1px solid rgba(201,169,98,0.2)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: c.gold }}>📦 Matching Inventory</span>
                          <span onClick={() => setMobileInvDrawer(null)} style={{ fontSize: 11, color: c.textMuted, cursor: 'pointer' }}>✕ Close</span>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {(() => {
                            const matches = purchases.filter(p => !p.sold && s.sku && p.sku && p.sku.toLowerCase() === s.sku.toLowerCase());
                            return matches.length > 0 ? matches.map(p => (
                              <div key={p.id} onClick={() => { const input = document.getElementById(`cost-${s.id}`); if (input) input.value = p.cost || ''; setMobileInvDrawer(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`, borderRadius: 8, marginBottom: 4, cursor: 'pointer' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                  <div style={{ fontSize: 9, color: c.textMuted }}>{p.sku} · Size {p.size} · {p.date}</div>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: c.gold, flexShrink: 0 }}>{fmt(p.cost)}</div>
                              </div>
                            )) : <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: c.textMuted }}>No matching inventory found for this SKU</div>;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, color: c.textMuted }}>{pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length} pending items</div>
              </div>
              ) : (

              <div style={{ border: `1px solid ${c.border}`, borderTop: selectedPending.size > 0 ? 'none' : `1px solid ${c.border}`, borderRadius: '0 0 12px 12px', overflow: 'hidden', background: c.card }}>
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {/* Table Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '36px 56px 1fr 50px 85px 100px 36px', padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.03)', position: 'sticky', top: 0, gap: 12, alignItems: 'center', fontSize: 11, fontWeight: 600, color: c.textMuted }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={selectedPending.size === pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length && selectedPending.size > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPending(new Set(pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map(s => s.id)));
                          } else {
                            setSelectedPending(new Set());
                          }
                        }}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: c.green }}
                      />
                    </div>
                    <span></span>
                    <span>Item</span>
                    <span style={{ textAlign: 'center' }}>Size</span>
                    <span style={{ textAlign: 'right' }}>Payout</span>
                    <span style={{ textAlign: 'center' }}>Cost</span>
                    <span></span>
                  </div>

                  {/* Table Rows */}
                  {pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).map((s, idx, arr) => (
                    <div 
                      key={s.id}
                      onClick={() => { setSelectedPendingItem(selectedPendingItem === s.id ? null : s.id); setInvLookupSearch(selectedPendingItem === s.id ? '' : (s.sku || '')); }}
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '36px 56px 1fr 50px 85px 100px 36px', 
                        padding: '14px 16px', 
                        borderBottom: `1px solid ${c.border}`,
                        borderLeft: selectedPendingItem === s.id ? `3px solid ${c.green}` : '3px solid transparent',
                        background: selectedPendingItem === s.id ? 'rgba(16,185,129,0.12)' : selectedPending.has(s.id) ? 'rgba(16,185,129,0.05)' : 'transparent',
                        cursor: 'pointer',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={selectedPending.has(s.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedPending);
                            if (e.target.checked) newSet.add(s.id);
                            else newSet.delete(s.id);
                            setSelectedPending(newSet);
                          }}
                          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: c.green }}
                        />
                      </div>
                      <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                        <ProductIcon name={s.name} size={52} />
                        {s.image && (
                          <img 
                            src={s.image} 
                            alt="" 
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }} 
                            onError={(e) => { e.target.style.display = 'none'; }} 
                          />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: '1.3', marginBottom: 3 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: c.textMuted }}>
                          {s.sku && <span style={{ color: '#666', marginRight: 6 }}>{s.sku} • </span>}
                          {s.saleDate} <span style={{ color: s.platform === 'eBay' ? '#3b82f6' : '#00c165', fontWeight: 600 }}>• {s.platform || 'eBay'}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{s.size || '-'}</div>
                      <div style={{ textAlign: 'right', fontWeight: 700, color: c.green, fontSize: 16 }}>{fmt(s.payout)}</div>
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input 
                          type="number" 
                          placeholder="$"
                          id={`cost-${s.id}`}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && e.target.value) {
                              await confirmSaleWithCost(s.id, e.target.value, s.platform || 'StockX');
                              e.target.value = '';
                              const nextIdx = idx + 1;
                              if (nextIdx < arr.length) {
                                const nextInput = document.getElementById(`cost-${arr[nextIdx].id}`);
                                if (nextInput) nextInput.focus();
                              }
                            }
                          }}
                          onChange={(e) => {
                            // Show/hide confirm button
                            const btn = document.getElementById(`confirm-${s.id}`);
                            if (btn) btn.style.display = e.target.value ? 'flex' : 'none';
                          }}
                          style={{ width: 70, padding: '8px 6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 14, textAlign: 'center', fontWeight: 600 }} 
                        />
                        <button
                          id={`confirm-${s.id}`}
                          onClick={async () => {
                            const input = document.getElementById(`cost-${s.id}`);
                            if (input && input.value) {
                              await confirmSaleWithCost(s.id, input.value, s.platform || 'StockX');
                              input.value = '';
                              document.getElementById(`confirm-${s.id}`).style.display = 'none';
                            }
                          }}
                          style={{ display: 'none', width: 28, height: 28, background: c.green, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}
                        >✓</button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => {
                            deletePendingFromSupabase(s.id);
                            setPendingCosts(prev => prev.filter(x => x.id !== s.id));
                            setSelectedPending(prev => { const n = new Set(prev); n.delete(s.id); return n; });
                          }} 
                          style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 20, padding: 4 }}
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderTop: `1px solid ${c.border}`, fontSize: 12, color: c.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{selectedPendingItem ? '👆 Click inventory item on right →' : 'Click row to match with inventory'}</span>
                  <span style={{ fontWeight: 600 }}>{pendingCosts.filter(s => year === 'all' || (s.saleDate && s.saleDate.startsWith(year))).length} items</span>
                </div>
              </div>
                    )}
            </div>
          )}
          
          {/* StockX Import Section - Unified */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: '#00c165', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff' }}>SX</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>STOCKX IMPORT</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Upload Historical Sales CSV</p>
                </div>
              </div>
              
              {!stockxImport.show ? (
                <div>
                  <input type="file" accept=".csv" onChange={handleStockxCsvUpload} id="stockx-csv-upload" style={{ display: 'none' }} />
                  <label htmlFor="stockx-csv-upload" onDrop={handleStockxDrop} onDragOver={handleDragOver}
                    style={{ display: 'block', padding: 30, border: '2px dashed rgba(0,193,101,0.3)', borderRadius: 16, textAlign: 'center', cursor: 'pointer', background: 'rgba(0,193,101,0.05)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#00c165' }}>Click or drag StockX CSV</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>Download from StockX → Seller Tools → Historical Sales</div>
                  </label>
                  
                  {/* Quick Sync Section */}
                  <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      🔄 Quick Sync
                    </div>
                    {stockxConnected ? (
                      <div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <select 
                            value={stockxApiFilter.year} 
                            onChange={e => setStockxApiFilter({ ...stockxApiFilter, year: e.target.value })} 
                            style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13, width: 90 }}
                          >
                            {['2026', '2025', '2024', '2023', '2022'].map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                          <button 
                            onClick={() => fetchStockXSales()} 
                            disabled={stockxSyncing} 
                            style={{ flex: 1, padding: '12px', background: '#00c165', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: stockxSyncing ? 'default' : 'pointer', opacity: stockxSyncing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                          >
                            {stockxSyncing ? '🔄 Syncing...' : `🔄 Sync ${stockxApiFilter.year} Sales`}
                          </button>
                          <button onClick={disconnectStockX} style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                            Disconnect
                          </button>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: c.textMuted }}>
                          Syncs from last 1,000 completed sales. For older history, use CSV.
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => window.location.href = `/api/stockx-auth?userId=${user.id}`}
                        style={{ width: '100%', padding: '12px', background: '#00c165', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                      >
                        Connect StockX
                      </button>
                    )}
                  </div>
                  
                  {/* Summary */}
                  <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: c.textMuted }}>Summary:</div>
                    <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.6 }}>
                      <div><span style={{ color: '#00c165', fontWeight: 600 }}>CSV Import:</span> Any year, any month. Full history.</div>
                      <div><span style={{ color: '#00c165', fontWeight: 600 }}>Quick Sync:</span> Last 1,000 completed sales by year.</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select value={stockxImport.year} onChange={e => setStockxImport({ ...stockxImport, year: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Years</option>
                      {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={stockxImport.month} onChange={e => setStockxImport({ ...stockxImport, month: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Months</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ background: 'rgba(0,193,101,0.1)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 12, color: c.textMuted }}>Total in CSV</div><div style={{ fontSize: 22, fontWeight: 800 }}>{stockxImport.data.length}</div></div>
                    <div style={{ fontSize: 24 }}>→</div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: c.textMuted }}>Filtered</div><div style={{ fontSize: 22, fontWeight: 800, color: '#00c165' }}>{filterStockxData().length}</div></div>
                  </div>
                  {filterStockxData().length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 16, borderRadius: 10, border: `1px solid ${c.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          {filterStockxData().slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                              <td style={{ padding: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Item'] || row['Product Name'] || 'Unknown'}</td>
                              <td style={{ padding: 10 }}>{row['Sku Size'] || '-'}</td>
                              <td style={{ padding: 10, textAlign: 'right', color: '#00c165' }}>${row['Price'] || '0'}</td>
                            </tr>
                          ))}
                          {filterStockxData().length > 5 && <tr><td colSpan={3} style={{ padding: 8, textAlign: 'center', color: c.textMuted, fontSize: 10 }}>+{filterStockxData().length - 5} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setStockxImport({ show: false, data: [], year: 'all', month: 'all', headers: [] })} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={importStockxSales} disabled={filterStockxData().length === 0} style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg, #00c165 0%, #009e52 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: filterStockxData().length === 0 ? 0.5 : 1 }}>Import {filterStockxData().length} StockX Sales</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* eBay CSV Import Section */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff' }}>eB</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>EBAY IMPORT</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>Upload Order Earnings Report</p>
                </div>
              </div>
              
              {!ebayImport.show ? (
                <div>
                  <input type="file" accept=".csv" onChange={handleEbayCsvUpload} id="ebay-csv-upload" style={{ display: 'none' }} />
                  <label htmlFor="ebay-csv-upload" onDrop={handleEbayDrop} onDragOver={handleDragOver}
                    style={{ display: 'block', padding: 30, border: '2px dashed rgba(229,50,56,0.3)', borderRadius: 16, textAlign: 'center', cursor: 'pointer', background: 'rgba(229,50,56,0.05)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#e53238' }}>Click or drag eBay CSV</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>eBay → Payments → Reports → Order earnings report</div>
                  </label>
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ color: c.green }}>✓</span> Exact payouts
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ color: c.green }}>✓</span> All fees included
                    </div>
                  </div>
                  
                  {/* API Sync Section */}
                  <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      🔄 eBay API Sync
                      <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 400 }}>Get images + exact payouts</span>
                    </div>
                    {ebayConnected ? (
                      <div>
                        {/* Year/Month Filters */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                          <select 
                            value={ebayApiFilter.year} 
                            onChange={e => setEbayApiFilter({ ...ebayApiFilter, year: e.target.value })} 
                            style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
                          >
                            {['2026', '2025', '2024', '2023', '2022', '2021'].map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                          <select 
                            value={ebayApiFilter.month} 
                            onChange={e => setEbayApiFilter({ ...ebayApiFilter, month: e.target.value })} 
                            style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
                          >
                            <option value="all">All Months</option>
                            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => 
                              <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>
                            )}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={async () => {
                            setEbaySyncing(true);
                            try {
                              const result = await syncEbaySales(user.id, ebayToken, {
                                year: ebayApiFilter.year,
                                month: ebayApiFilter.month,
                                refreshToken: localStorage.getItem('flipledger_ebay_refresh'),
                                onTokenRefresh: (newToken) => {
                                  localStorage.setItem('flipledger_ebay_token', newToken);
                                  setEbayToken(newToken);
                                }
                              });
                              
                              if (result.success) {
                                if (result.saved.length > 0) {
                                  setPendingCosts(prev => [...prev, ...result.saved.map(transformPendingForDisplay)]);
                                }
                                
                                const msg = [];
                                if (result.saved.length > 0) {
                                  const withImages = result.saved.filter(s => s.image).length;
                                  msg.push(`✓ ${result.saved.length} eBay sales synced (${withImages} with images)`);
                                }
                                if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} already existed`);
                                alert(msg.join('\n') || 'All caught up - no new sales');
                              } else {
                                alert('Sync failed: ' + result.error);
                              }
                            } catch (err) {
                              alert('Sync failed: ' + err.message);
                            }
                            setEbaySyncing(false);
                          }}
                          disabled={ebaySyncing}
                          style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, cursor: ebaySyncing ? 'wait' : 'pointer', fontWeight: 600, opacity: ebaySyncing ? 0.7 : 1 }}
                        >
                          {ebaySyncing ? '⏳ Syncing...' : '🔄 Sync eBay Sales'}
                        </button>
                        <button
                        onClick={() => {
                      clearEbayTokens();
                      setEbayToken(null);
                      setEbayConnected(false);
                    }}
                          style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: c.red, fontSize: 11, cursor: 'pointer' }}
                        >
                          Disconnect
                        </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => window.location.href = `/api/ebay-auth?userId=${user.id}`}
                        style={{ width: '100%', padding: '12px', background: '#e53238', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Connect eBay Account
                      </button>
                    )}
                    <div style={{ fontSize: 10, color: c.textMuted, marginTop: 10 }}>
                      Select year/month and sync. Up to 5 years of history available.
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <select value={ebayImport.year} onChange={e => setEbayImport({ ...ebayImport, year: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Years</option>
                      {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={ebayImport.month} onChange={e => setEbayImport({ ...ebayImport, month: e.target.value })} style={{ ...inputStyle, padding: 10, flex: 1 }}>
                      <option value="all">All Months</option>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ background: 'rgba(229,50,56,0.1)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 12, color: c.textMuted }}>Orders in CSV</div><div style={{ fontSize: 22, fontWeight: 800 }}>{ebayImport.data.length}</div></div>
                    <div style={{ fontSize: 24 }}>→</div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: c.textMuted }}>Filtered</div><div style={{ fontSize: 22, fontWeight: 800, color: '#e53238' }}>{filterEbayData().length}</div></div>
                  </div>
                  {filterEbayData().length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 16, borderRadius: 10, border: `1px solid ${c.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          {filterEbayData().slice(0, 5).map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                              <td style={{ padding: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Item title'] || 'Unknown'}</td>
                              <td style={{ padding: 10, textAlign: 'right', color: '#e53238' }}>${String(row['Gross transaction amount'] || '0').replace(/[$,]/g, '')}</td>
                            </tr>
                          ))}
                          {filterEbayData().length > 5 && <tr><td colSpan={2} style={{ padding: 8, textAlign: 'center', color: c.textMuted, fontSize: 10 }}>+{filterEbayData().length - 5} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setEbayImport({ show: false, data: [], year: 'all', month: 'all', headers: [] })} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={async () => {
                      if (confirm('This will CLEAR all pending sales and do a fresh import. Continue?')) {
                        await deleteAllPendingFromSupabase();
                        setPendingCosts([]);
                        setTimeout(() => importEbaySales(), 100);
                      }
                    }} disabled={filterEbayData().length === 0} style={{ flex: 1, padding: 12, background: 'rgba(239,68,68,0.2)', border: `1px solid ${c.red}`, borderRadius: 10, color: c.red, fontWeight: 700, cursor: 'pointer', opacity: filterEbayData().length === 0 ? 0.5 : 1 }}>🔄 Fresh Import</button>
                    <button onClick={importEbaySales} disabled={filterEbayData().length === 0} style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg, #e53238 0%, #c62828 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: filterEbayData().length === 0 ? 0.5 : 1 }}>Import {filterEbayData().length} eBay Sales</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Other Platforms */}
          {[
            { name: 'GOAT', code: 'GT', color: '#1a1a1a', border: '#333', connected: goatConnected, setConnected: setGoatConnected, desc: 'Auto-import your GOAT sales' },
            { name: 'QuickBooks', code: 'QB', color: '#2CA01C', connected: qbConnected, setConnected: setQbConnected, desc: 'Sync with QuickBooks accounting' }
          ].map(p => (
            <div key={p.name} style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 54, height: 54, background: p.color, border: p.border ? `2px solid ${p.border}` : 'none', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: p.color === '#1a1a1a' ? '#fff' : '#fff' }}>{p.code}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>{p.name.toUpperCase()}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: c.textMuted }}>{p.desc}</p>
                </div>
                {p.connected ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {p.name !== 'QuickBooks' && (
                      <button onClick={() => syncPlatform(p.name)} disabled={goatSyncing} style={{ padding: '10px 18px', ...btnPrimary, fontSize: 12, opacity: goatSyncing ? 0.6 : 1 }}>
                        {goatSyncing ? '...' : 'Sync'}
                      </button>
                    )}
                    <button onClick={() => p.setConnected(false)} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 10, color: c.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Disconnect</button>
                  </div>
                ) : (
                  <button onClick={() => p.setConnected(true)} style={{ padding: '12px 22px', ...btnPrimary }}>Connect</button>
                )}
              </div>
              {p.connected && (
                <div style={{ padding: '12px 20px', borderTop: `1px solid ${c.border}`, background: `${p.color}10` }}>
                  <span style={{ color: c.green, fontWeight: 600, fontSize: 12 }}>✓ Connected</span>
                </div>
              )}
            </div>
          ))}
            </div>

            {!isMobile && (
        
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden', height: 'fit-content', position: 'sticky', top: 20 }}>
              <div style={{ padding: '12px', borderBottom: `1px solid ${c.border}`, background: selectedPendingItem ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedPendingItem ? '👆 Select Item' : '📦 Inventory'}</span>
                {selectedInvLookup.size > 0 && (
                  <button 
                    onClick={async () => {
                      if (confirm(`Mark ${selectedInvLookup.size} sold?`)) {
                        // Update each selected item in Supabase
                        for (const id of selectedInvLookup) {
                          const item = purchases.find(p => p.id === id);
                          if (item) {
                            await updateInventoryInSupabase({ ...item, sold: true });
                          }
                        }
                        setPurchases(prev => prev.map(p => selectedInvLookup.has(p.id) ? { ...p, sold: true } : p));
                        setSelectedInvLookup(new Set());
                      }
                    }}
                    style={{ padding: '4px 8px', background: 'rgba(251,191,36,0.2)', border: 'none', borderRadius: 4, color: c.gold, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Mark {selectedInvLookup.size} Sold
                  </button>
                )}
              </div>
              
              <div style={{ padding: 12, borderBottom: `1px solid ${c.border}` }}>
                <input 
                  type="text"
                  placeholder="🔍 Search SKU, name, size..."
                  value={invLookupSearch}
                  onChange={e => { setInvLookupSearch(e.target.value); setInvLookupLimit(50); }}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
                />
              </div>

              {selectedPendingItem && (
                <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.15)', borderBottom: `1px solid ${c.border}`, fontSize: 11, color: c.green, fontWeight: 600 }}>
                  Click item to use its cost
                </div>
              )}

              {purchases.filter(p => !p.sold).length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: c.textMuted }}>No inventory yet</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 16 }}>Add items to track costs</div>
                  <button onClick={() => setPage('inventory')} style={{ padding: '10px 20px', ...btnPrimary, fontSize: 12 }}>+ Add Inventory</button>
                </div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  {/* Select All Row */}
                  {!selectedPendingItem && purchases.filter(p => !p.sold).filter(p => {
                    if (!invLookupSearch) return true;
                    const search = invLookupSearch.toLowerCase();
                    return (p.name && p.name.toLowerCase().includes(search)) ||
                           (p.sku && p.sku.toLowerCase().includes(search)) ||
                           (p.size && p.size.toString().toLowerCase().includes(search));
                  }).length > 0 && (
                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input 
                        type="checkbox"
                        checked={(() => {
                          const visible = purchases.filter(p => !p.sold).filter(p => {
                            if (!invLookupSearch) return true;
                            const search = invLookupSearch.toLowerCase();
                            return (p.name && p.name.toLowerCase().includes(search)) ||
                                   (p.sku && p.sku.toLowerCase().includes(search)) ||
                                   (p.size && p.size.toString().toLowerCase().includes(search));
                          }).slice(0, invLookupLimit);
                          return visible.length > 0 && visible.every(p => selectedInvLookup.has(p.id));
                        })()}
                        onChange={(e) => {
                          const visible = purchases.filter(p => !p.sold).filter(p => {
                            if (!invLookupSearch) return true;
                            const search = invLookupSearch.toLowerCase();
                            return (p.name && p.name.toLowerCase().includes(search)) ||
                                   (p.sku && p.sku.toLowerCase().includes(search)) ||
                                   (p.size && p.size.toString().toLowerCase().includes(search));
                          }).slice(0, invLookupLimit);
                          if (e.target.checked) {
                            setSelectedInvLookup(new Set(visible.map(p => p.id)));
                          } else {
                            setSelectedInvLookup(new Set());
                          }
                        }}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: c.gold }}
                      />
                      <span style={{ fontSize: 10, color: c.textMuted }}>Select All</span>
                    </div>
                  )}
                  {purchases
                    .filter(p => !p.sold)
                    .filter(p => {
                      if (!invLookupSearch) return true;
                      const search = invLookupSearch.toLowerCase();
                      return (p.name && p.name.toLowerCase().includes(search)) ||
                             (p.sku && p.sku.toLowerCase().includes(search)) ||
                             (p.size && p.size.toString().toLowerCase().includes(search));
                    })
                    .slice(0, invLookupLimit)
                    .map(p => (
                      <div 
                        key={p.id}
                        style={{ 
                          padding: '8px 12px', 
                          borderBottom: `1px solid ${c.border}`,
                          cursor: selectedPendingItem ? 'pointer' : 'default',
                          background: selectedInvLookup.has(p.id) ? 'rgba(251,191,36,0.1)' : 'transparent'
                        }}
                        onClick={async () => {
                          if (selectedPendingItem) {
                            await confirmSaleWithCost(selectedPendingItem, p.cost, pendingCosts.find(s => s.id === selectedPendingItem)?.platform || 'StockX');
                            // Update in Supabase
                            await updateInventoryInSupabase({ ...p, sold: true });
                            setPurchases(prev => prev.map(x => x.id === p.id ? { ...x, sold: true } : x));
                            setSelectedPendingItem(null);
                          }
                        }}
                        onMouseEnter={e => { if (selectedPendingItem) e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = selectedInvLookup.has(p.id) ? 'rgba(251,191,36,0.1)' : 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          {!selectedPendingItem && (
                            <input 
                              type="checkbox"
                              checked={selectedInvLookup.has(p.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedInvLookup(prev => {
                                  const newSet = new Set(prev);
                                  if (e.target.checked) newSet.add(p.id);
                                  else newSet.delete(p.id);
                                  return newSet;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: c.gold, marginTop: 2 }}
                            />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: c.green, marginBottom: 4 }}>{p.sku} · Size {p.size}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <span style={{ color: c.gold, fontWeight: 700 }}>{fmt(p.cost)}</span>
                              <span style={{ color: c.textMuted }}>{p.date}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {(() => {
                const filteredItems = purchases.filter(p => !p.sold).filter(p => {
                  if (!invLookupSearch) return true;
                  const search = invLookupSearch.toLowerCase();
                  return (p.name && p.name.toLowerCase().includes(search)) ||
                         (p.sku && p.sku.toLowerCase().includes(search)) ||
                         (p.size && p.size.toString().toLowerCase().includes(search));
                });
                const hasMore = filteredItems.length > invLookupLimit;
                return (
                  <div style={{ borderTop: `1px solid ${c.border}` }}>
                    {hasMore && (
                      <button
                        onClick={() => setInvLookupLimit(prev => prev + 50)}
                        style={{ width: '100%', padding: '10px 12px', background: 'rgba(16,185,129,0.1)', border: 'none', borderBottom: `1px solid ${c.border}`, color: c.green, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Load More ({filteredItems.length - invLookupLimit} remaining)
                      </button>
                    )}
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', fontSize: 10, color: c.textMuted, textAlign: 'center' }}>
                      Showing {Math.min(invLookupLimit, filteredItems.length)} of {filteredItems.length} items
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          </div>
        </div>}
        {page === 'settings' && <div style={{ maxWidth: 550 }}>
          {/* Account Section */}
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              👤 Account
            </h3>
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{user?.email}</div>
                  <div style={{ fontSize: 12, color: c.textMuted }}>Logged in</div>
                </div>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                  }}
                  style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Platform Connections */}
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              🔗 Platform Connections
            </h3>
            
            {/* eBay Connection */}
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}`, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#e53238', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>eBay</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>eBay</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>
                      {ebayConnected ? '✓ Connected' : 'Sync your sold items with images'}
                    </div>
                  </div>
                </div>
                {ebayConnected ? (
                  <button
                   onClick={() => {
                      clearEbayTokens();
                      setEbayToken(null);
                      setEbayConnected(false);
                    }}
                    style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: c.red, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => window.location.href = `/api/ebay-auth?userId=${user.id}`}
                    style={{ padding: '10px 20px', background: '#e53238', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Connect eBay
                  </button>
                )}
              </div>
            </div>

            {/* StockX Connection */}
            <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: '#00c165', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff' }}>StockX</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>StockX</div>
                    <div style={{ fontSize: 12, color: c.textMuted }}>
                      {stockxConnected ? '✓ Connected' : 'Auto-import your StockX sales'}
                    </div>
                  </div>
                </div>
                {stockxConnected ? (
                  <button 
                    onClick={disconnectStockX}
                    style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => window.location.href = `/api/stockx-auth?userId=${user.id}`}
                    style={{ padding: '10px 20px', background: '#00c165', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
         </div>

          {/* eBay Business Policies */}
          {ebayConnected && (
            <div style={{ ...cardStyle, padding: 24, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                📦 eBay Business Policies
              </h3>

              {policiesLoading && (
                <p style={{ margin: 0, fontSize: 13, color: c.textMuted }}>Loading policies...</p>
              )}

              {!policiesLoading && ebayPolicies.fulfillment.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, color: c.textMuted }}>No policies found. Reconnect eBay to reload.</p>
              )}

              {ebayPolicies.fulfillment.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: c.textMuted, marginBottom: 4, display: 'block' }}>Shipping Policy</label>
                    <select
                      value={selectedPolicies.fulfillment}
                      onChange={e => setSelectedPolicies(prev => ({ ...prev, fulfillment: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13 }}
                    >
                      {ebayPolicies.fulfillment.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: c.textMuted, marginBottom: 4, display: 'block' }}>Payment Policy</label>
                    <select
                      value={selectedPolicies.payment}
                      onChange={e => setSelectedPolicies(prev => ({ ...prev, payment: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13 }}
                    >
                      {ebayPolicies.payment.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: c.textMuted, marginBottom: 4, display: 'block' }}>Return Policy</label>
                    <select
                      value={selectedPolicies.return}
                      onChange={e => setSelectedPolicies(prev => ({ ...prev, return: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13 }}
                    >
                      {ebayPolicies.return.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={saveEbayPolicies}
                    style={{ marginTop: 8, padding: '10px 20px', background: policiesSaved ? 'rgba(16,185,129,0.2)' : '#e53238', border: policiesSaved ? '1px solid rgba(16,185,129,0.4)' : 'none', borderRadius: 8, color: policiesSaved ? '#10b981' : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    {policiesSaved ? '✓ Saved!' : 'Save Defaults'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Simple explanation */}
          <div style={{ ...cardStyle, padding: 24, marginBottom: 16, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}>
           <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>💡 Fee Settings</h3>
            <p style={{ margin: '0 0 0', fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
              <strong>API Sync & CSV Import:</strong> Fees are automatically calculated from your StockX payout. No settings needed.
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: c.textMuted, lineHeight: 1.6 }}>
              <strong>Manual Entry:</strong> Use the settings below to calculate fees when entering sales manually.
            </p>
          </div>

          {/* Advanced Settings - Collapsible */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <button 
              onClick={() => setSettings({ ...settings, showAdvanced: !settings.showAdvanced })}
              style={{ width: '100%', padding: '16px 24px', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: c.text }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>⚙️ Advanced Fee Settings (Manual Entry)</span>
              <span style={{ fontSize: 18, color: c.textMuted }}>{settings.showAdvanced ? '▲' : '▼'}</span>
            </button>
            
            {settings.showAdvanced && (
              <div style={{ padding: '0 24px 24px' }}>
                {[
                  { name: 'STOCKX STANDARD', code: 'Standard', color: '#00c165', fields: [{ l: 'Seller Level', k: 'stockxLevel', opts: [[9,'Level 1 (9%)'],[8.5,'Level 2 (8.5%)'],[8,'Level 3 (8%)'],[7.5,'Level 4 (7.5%)'],[7,'Level 5 (7%)']] },{ l: 'Processing', k: 'stockxProcessing', opts: [[3,'3%'],[0,'0% (Seller+)']] }], checkbox: { label: 'Quick Ship Bonus (-2%)', key: 'stockxQuickShip' }, total: settings.stockxLevel + settings.stockxProcessing + (settings.stockxQuickShip ? -2 : 0) },
                  { name: 'STOCKX DIRECT', code: 'Direct', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxDirectFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxDirectProcessing', opts: [[3,'3%'],[0,'0%']] }], total: settings.stockxDirectFee + settings.stockxDirectProcessing },
                  { name: 'STOCKX FLEX', code: 'Flex', color: '#00c165', fields: [{ l: 'Commission', k: 'stockxFlexFee', opts: [[5,'5%'],[4,'4%'],[3,'3%']] },{ l: 'Processing', k: 'stockxFlexProcessing', opts: [[3,'3%'],[0,'0%']] },{ l: 'Fulfillment', k: 'stockxFlexFulfillment', opts: [[5,'$5'],[4,'$4'],[3,'$3'],[0,'$0']] }], total: settings.stockxFlexFee + settings.stockxFlexProcessing, extra: `+ $${settings.stockxFlexFulfillment}` },
                  { name: 'GOAT', code: 'GOAT', color: '#1a1a1a', border: '#333', fields: [{ l: 'Commission', k: 'goatFee', opts: [[9.5,'9.5%'],[9,'9%'],[8,'8%'],[7,'7%']] },{ l: 'Cash Out', k: 'goatProcessing', opts: [[2.9,'2.9%'],[0,'0% (Credit)']] }], total: settings.goatFee + settings.goatProcessing },
                  { name: 'EBAY', code: 'eBay', color: '#e53238', fields: [{ l: 'Final Value Fee', k: 'ebayFee', opts: [[13.25,'13.25%'],[12.9,'12.9%'],[11.5,'11.5%'],[10,'10%'],[8,'8% ($150+)']] }], total: settings.ebayFee }
                ].map(platform => (
                  <div key={platform.name} style={{ padding: 18, marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${c.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ minWidth: 44, height: 32, paddingLeft: 6, paddingRight: 6, background: platform.color, border: platform.border ? `2px solid ${platform.border}` : 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff' }}>{platform.code}</div>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{platform.name}</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {platform.fields.map(field => (
                        <div key={field.k}>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 10, color: c.textMuted, fontWeight: 600 }}>{field.l.toUpperCase()}</label>
                          <select value={settings[field.k]} onChange={e => setSettings({ ...settings, [field.k]: parseFloat(e.target.value) })} style={{ ...inputStyle, background: 'rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: 12, padding: 10 }}>
                            {field.opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    {platform.checkbox && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={settings[platform.checkbox.key]} onChange={e => setSettings({ ...settings, [platform.checkbox.key]: e.target.checked })} style={{ accentColor: c.green, width: 14, height: 14 }} />
                        {platform.checkbox.label}
                      </label>
                    )}
                    {platform.total !== undefined && (
                      <div style={{ marginTop: 12, padding: 10, background: 'rgba(16,185,129,0.1)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: c.textMuted, fontWeight: 600 }}>TOTAL FEE</span>
                        <span style={{ fontWeight: 700, color: c.green, fontSize: 14 }}>{platform.total}%{platform.extra && ` ${platform.extra}`}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data Backup & Restore */}
          <div style={{ ...cardStyle, padding: 24, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              💾 Data Backup & Restore
            </h3>
            <p style={{ fontSize: 13, color: c.textMuted, marginBottom: 20, lineHeight: 1.6 }}>
              <strong>Export</strong> saves all your data to a file on your computer. <strong>Restore</strong> loads data from a backup file.
            </p>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {/* Export Backup */}
              <button 
                onClick={() => {
                  const backup = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    purchases,
                    sales,
                    expenses,
                    pendingCosts,
                    settings
                  };
                  const dataStr = JSON.stringify(backup, null, 2);
                  const blob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const filename = `FlipLedger_Backup_${new Date().toISOString().split('T')[0]}.json`;
                  
                  // Method that works across all browsers including Safari
                  if (navigator.msSaveBlob) {
                    // IE/Edge
                    navigator.msSaveBlob(blob, filename);
                  } else {
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = filename;
                    a.setAttribute('download', filename);
                    a.setAttribute('target', '_blank');
                    document.body.appendChild(a);
                    
                    // Use timeout for Safari
                    setTimeout(() => {
                      a.click();
                      setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }, 250);
                    }, 100);
                  }
                  alert('✅ Backup saved! Store this file somewhere safe (Google Drive, iCloud, etc.)');
                }}
                style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                📥 Save Backup to Computer
              </button>
              
              {/* Import Backup */}
              <label style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                📤 Load Backup from File
                <input 
                  type="file" 
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      try {
                        const backup = JSON.parse(event.target.result);
                        
                        if (!backup.purchases && !backup.sales && !backup.expenses) {
                          alert('Invalid backup file format');
                          return;
                        }
                        
                        const confirmRestore = confirm(
                          `Restore backup from ${backup.exportDate ? new Date(backup.exportDate).toLocaleDateString() : 'unknown date'}?\n\n` +
                          `This will replace:\n` +
                          `• ${backup.purchases?.length || 0} inventory items\n` +
                          `• ${backup.sales?.length || 0} sales\n` +
                          `• ${backup.expenses?.length || 0} expenses\n` +
                          `• ${backup.pendingCosts?.length || 0} pending costs\n\n` +
                          `This cannot be undone!`
                        );
                        
                        if (confirmRestore) {
                          // Clear existing data in Supabase first, then restore
                          try {
                            // Delete all existing data for this user using safe functions
                            if (user) {
                              await safeDeleteAllInventory(user.id);
                              await safeDeleteAllSales(user.id);
                              await safeDeleteAllExpenses(user.id);
                              await safeDeleteAllPending(user.id);
                            }
                            
                            // Restore inventory
                            if (backup.purchases?.length > 0) {
                              const savedInv = await bulkSaveInventoryToSupabase(backup.purchases);
                              if (savedInv.length > 0) {
                                setPurchases(savedInv.map(item => ({
                                  id: item.id,
                                  name: item.name,
                                  sku: item.sku,
                                  size: item.size,
                                  cost: parseFloat(item.cost) || 0,
                                  date: item.date,
                                  sold: item.sold || false
                                })));
                              }
                            } else {
                              setPurchases([]);
                            }
                            
                            // Restore sales
                            if (backup.sales?.length > 0) {
                              const savedSales = await bulkSaveSalesToSupabase(backup.sales);
                              if (savedSales.length > 0) {
                                setSales(savedSales.map(item => ({
                                  id: item.id,
                                  name: item.name,
                                  sku: item.sku,
                                  size: item.size,
                                  cost: parseFloat(item.cost) || 0,
                                  salePrice: parseFloat(item.sale_price) || 0,
                                  platform: item.platform,
                                  fees: parseFloat(item.fees) || 0,
                                  profit: parseFloat(item.profit) || 0,
                                  saleDate: item.sale_date
                                })));
                              }
                            } else {
                              setSales([]);
                            }
                            
                            // Restore expenses (keep local for now - expenses may have different structure)
                            if (backup.expenses) setExpenses(backup.expenses);
                            
                            // Restore pending
                            if (backup.pendingCosts?.length > 0) {
                              const savedPending = await bulkSavePendingToSupabase(backup.pendingCosts);
                              if (savedPending.length > 0) {
                                setPendingCosts(savedPending.map(item => ({
                                  id: item.id,
                                  name: item.name,
                                  sku: item.sku,
                                  size: item.size,
                                  salePrice: parseFloat(item.sale_price) || 0,
                                  platform: item.platform,
                                  fees: parseFloat(item.fees) || 0,
                                  saleDate: item.sale_date
                                })));
                              }
                            } else {
                              setPendingCosts([]);
                            }
                            
                            if (backup.settings) setSettings({ ...settings, ...backup.settings });
                            alert('✅ Backup restored successfully!');
                          } catch (err) {
                            console.error('Restore error:', err);
                            alert('Error restoring backup: ' + err.message);
                          }
                        }
                      } catch (err) {
                        alert('Error reading backup file: ' + err.message);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }} 
                />
              </label>
            </div>
            
            {/* Stats */}
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8 }}>CURRENT DATA</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                <div><span style={{ color: c.textMuted }}>Inventory:</span> <strong>{purchases.length}</strong></div>
                <div><span style={{ color: c.textMuted }}>Sales:</span> <strong>{sales.length}</strong></div>
                <div><span style={{ color: c.textMuted }}>Expenses:</span> <strong>{expenses.length}</strong></div>
                <div><span style={{ color: c.textMuted }}>Pending:</span> <strong>{pendingCosts.length}</strong></div>
              </div>
            </div>
            
            {/* Tip */}
            <div style={{ marginTop: 16, padding: 14, background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
              <p style={{ margin: 0, fontSize: 12, color: c.green, lineHeight: 1.5 }}>
                💡 <strong>Tip:</strong> Export a backup weekly to protect your data. Save the file to Google Drive, iCloud, or your computer.
              </p>
            </div>
          </div>
        </div>}
      </main>

      {/* MODAL */}
      {modal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)', border: `1px solid ${c.border}`, borderRadius: 20, width: 420, maxHeight: '90vh', overflow: 'auto' }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#111' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontStyle: 'italic' }}>
              {modal === 'purchase' ? 'ADD PURCHASE' : modal === 'bulkAdd' ? 'BULK ADD ITEMS' : modal === 'sale' ? 'RECORD SALE' : modal === 'editSale' ? 'EDIT SALE' : modal === 'editInventory' ? 'EDIT INVENTORY' : modal === 'expense' ? 'ADD EXPENSE' : modal === 'editExpense' ? 'EDIT EXPENSE' : modal === 'storage' ? 'ADD STORAGE FEE' : 'LOG MILEAGE'}
            </h3>
            <button onClick={() => setModal(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: 22 }}>
            {/* EDIT INVENTORY MODAL */}
            {modal === 'editInventory' && <>
              <input value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Style Code (SKU)" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.size || ''} onChange={e => setFormData({ ...formData, size: e.target.value })} placeholder="Size" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.cost || ''} onChange={e => setFormData({ ...formData, cost: e.target.value })} placeholder="Cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'purchase' && <>
              {formData.image && (
                <div style={{ marginBottom: 16, padding: 16, background: '#1a1a1a', borderRadius: 12, textAlign: 'center' }}>
                  <img src={formData.image} alt="" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                </div>
              )}
              <input 
                value={formData.sku || ''} 
                onChange={async (e) => {
                  const sku = e.target.value;
                  setFormData({ ...formData, sku });
                  if (sku.length >= 6) {
                    const product = await lookupSku(sku);
                    if (product) {
                      setFormData(prev => ({ 
                        ...prev, 
                        sku,
                        name: product.name || prev.name,
                        image: product.image || prev.image
                      }));
                    }
                  }
                }} 
                placeholder="Style Code (e.g., DH6927-111) *" 
                style={{ ...inputStyle, marginBottom: 12 }} 
              />
              <input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.size || ''} onChange={e => setFormData({ ...formData, size: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.cost || ''} onChange={e => setFormData({ ...formData, cost: e.target.value })} placeholder="Cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'bulkAdd' && <>
              <input value={formData.bulkName || ''} onChange={e => setFormData({ ...formData, bulkName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.bulkSku || ''} onChange={e => setFormData({ ...formData, bulkSku: e.target.value })} placeholder="Style Code (e.g., DH6927-111)" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, display: 'block', marginBottom: 6 }}>PURCHASE DATE</label>
                <input type="date" value={formData.bulkDate || ''} onChange={e => setFormData({ ...formData, bulkDate: e.target.value })} style={inputStyle} />
              </div>
              
              {/* Same cost for all toggle */}
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <input 
                  type="checkbox" 
                  id="sameCostToggle"
                  checked={formData.bulkSameCost || false}
                  onChange={e => setFormData({ ...formData, bulkSameCost: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: c.green, cursor: 'pointer' }}
                />
                <label htmlFor="sameCostToggle" style={{ fontSize: 13, color: c.textMuted, cursor: 'pointer', flex: 1 }}>
                  Same cost for all sizes
                </label>
                {formData.bulkSameCost && (
                  <input 
                    type="number"
                    value={formData.bulkUniformCost || ''} 
                    onChange={e => setFormData({ ...formData, bulkUniformCost: e.target.value })}
                    placeholder="Cost" 
                    style={{ ...inputStyle, width: 100, padding: 8, textAlign: 'center', MozAppearance: 'textfield', WebkitAppearance: 'none' }} 
                  />
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 60, fontSize: 11, fontWeight: 700, color: c.textMuted }}>QTY</span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: c.textMuted }}>SIZE</span>
                  {!formData.bulkSameCost && <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: c.textMuted }}>COST</span>}
                  <span style={{ width: 32 }}></span>
                </div>
                {(formData.bulkRows || [{ qty: '', size: '', cost: '' }]).map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={row.qty || ''} 
                      onChange={e => {
                        const newRows = [...(formData.bulkRows || [{ qty: '', size: '', cost: '' }])];
                        newRows[i].qty = e.target.value.replace(/[^0-9]/g, '');
                        setFormData({ ...formData, bulkRows: newRows });
                      }}
                      placeholder="1"
                      style={{ ...inputStyle, width: 60, padding: 10, textAlign: 'center' }} 
                    />
                    <input 
                      value={row.size} 
                      onChange={e => {
                        const newRows = [...(formData.bulkRows || [{ qty: '', size: '', cost: '' }])];
                        newRows[i].size = e.target.value;
                        setFormData({ ...formData, bulkRows: newRows });
                      }}
                      placeholder="10.5" 
                      style={{ ...inputStyle, flex: 1, padding: 10 }} 
                    />
                    {!formData.bulkSameCost && (
                      <input 
                        type="text"
                        inputMode="decimal"
                        value={row.cost} 
                        onChange={e => {
                          const newRows = [...(formData.bulkRows || [{ qty: '', size: '', cost: '' }])];
                          newRows[i].cost = e.target.value;
                          setFormData({ ...formData, bulkRows: newRows });
                        }}
                        placeholder="76.97" 
                        style={{ ...inputStyle, flex: 1, padding: 10 }} 
                      />
                    )}
                    <button 
                      onClick={() => {
                        const newRows = (formData.bulkRows || []).filter((_, idx) => idx !== i);
                        setFormData({ ...formData, bulkRows: newRows.length ? newRows : [{ qty: '', size: '', cost: '' }] });
                      }}
                      style={{ width: 32, background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, color: c.red, cursor: 'pointer', fontSize: 16 }}
                    >×</button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const newRows = [...(formData.bulkRows || [{ qty: '', size: '', cost: '' }]), { qty: '', size: '', cost: '' }];
                    setFormData({ ...formData, bulkRows: newRows });
                  }}
                  style={{ width: '100%', padding: 10, background: 'rgba(16,185,129,0.1)', border: `1px dashed rgba(16,185,129,0.3)`, borderRadius: 8, color: c.green, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >+ Add Another Size</button>
              </div>
              
              {/* Running total */}
              {(() => {
                const rows = formData.bulkRows || [{ qty: '', size: '', cost: '' }];
                const uniformCost = parseFloat(formData.bulkUniformCost) || 0;
                const useSameCost = formData.bulkSameCost;
                let totalItems = 0;
                let totalCost = 0;
                rows.forEach(r => {
                  if (r.size && (useSameCost ? uniformCost > 0 : parseFloat(r.cost) > 0)) {
                    const qty = parseInt(r.qty) || 1;
                    const cost = useSameCost ? uniformCost : (parseFloat(r.cost) || 0);
                    totalItems += qty;
                    totalCost += qty * cost;
                  }
                });
                return (
                  <div style={{ padding: 14, background: 'rgba(16,185,129,0.1)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ color: c.textMuted, fontSize: 13 }}>Items to add:</span>
                      <span style={{ fontWeight: 800, fontSize: 20, color: c.green }}>{totalItems}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: c.textMuted, fontSize: 13 }}>Total cost:</span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: c.gold }}>{fmt(totalCost)}</span>
                    </div>
                  </div>
                );
              })()}
            </>}
            {modal === 'sale' && <>
              {formData.saleImage && (
                <div style={{ marginBottom: 16, padding: 16, background: '#1a1a1a', borderRadius: 12, textAlign: 'center' }}>
                  <img src={formData.saleImage} alt="" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                </div>
              )}
              <input 
                value={formData.saleSku || ''} 
                onChange={async (e) => {
                  const sku = e.target.value;
                  setFormData({ ...formData, saleSku: sku });
                  if (sku.length >= 6) {
                    const product = await lookupSku(sku);
                    if (product) {
                      setFormData(prev => ({ 
                        ...prev, 
                        saleSku: sku,
                        saleName: product.name || prev.saleName,
                        saleImage: product.image || prev.saleImage
                      }));
                    }
                  }
                }} 
                placeholder="Style Code (e.g., DH6927-111) *" 
                style={{ ...inputStyle, marginBottom: 12 }} 
              />
              <input value={formData.saleName || ''} onChange={e => setFormData({ ...formData, saleName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.saleSize || ''} onChange={e => setFormData({ ...formData, saleSize: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.saleCost || ''} onChange={e => setFormData({ ...formData, saleCost: e.target.value })} placeholder="Your cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input type="number" value={formData.salePrice || ''} onChange={e => setFormData({ ...formData, salePrice: e.target.value })} placeholder="Sale price *" style={{ ...inputStyle, flex: 1 }} />
                <select value={formData.platform || 'StockX Standard'} onChange={e => setFormData({ ...formData, platform: e.target.value })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                  <option>StockX Standard</option>
                  <option>StockX Direct</option>
                  <option>StockX Flex</option>
                  <option>GOAT</option>
                  <option>eBay</option>
                  <option>Local</option>
                </select>
              </div>
              {(!formData.platform || formData.platform === 'StockX Standard') && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: c.textMuted, display: 'block', marginBottom: 4 }}>SELLER LEVEL</label>
                  <select value={formData.sellerLevel || settings.stockxLevel} onChange={e => setFormData({ ...formData, sellerLevel: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value={9}>Level 1 (9%)</option>
                    <option value={8.5}>Level 2 (8.5%)</option>
                    <option value={8}>Level 3 (8%)</option>
                    <option value={7.5}>Level 4 (7.5%)</option>
                    <option value={7}>Level 5 (7%)</option>
                  </select>
                </div>
              )}
              <input type="date" value={formData.saleDate || ''} onChange={e => setFormData({ ...formData, saleDate: e.target.value })} style={inputStyle} />
              {formData.saleCost && formData.salePrice && (
                <div style={{ marginTop: 16, padding: 16, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: c.textMuted }}>Est. Profit</span>
                  <span style={{ fontWeight: 800, fontSize: 24, color: c.green, fontStyle: 'italic' }}>
                    {fmt((+formData.salePrice || 0) - (+formData.saleCost || 0) - calcFees(+formData.salePrice || 0, formData.platform || 'StockX Standard'))}
                  </span>
                </div>
              )}
            </>}
            {modal === 'expense' && <>
              <select value={formData.category || 'Shipping'} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                {expenseCategories.map(cat => <option key={cat}>{cat}</option>)}
              </select>
              <input type="number" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Description" style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'editExpense' && <>
              <select value={formData.category || 'Shipping'} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                {expenseCategories.map(cat => <option key={cat}>{cat}</option>)}
              </select>
              <input type="number" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Description" style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="date" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} style={inputStyle} />
            </>}
            {modal === 'storage' && <>
              <input type="month" value={formData.month || '2025-01'} onChange={e => setFormData({ ...formData, month: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
              <input type="number" value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Notes" style={inputStyle} />
            </>}
            {modal === 'mileage' && <>
              <input type="date" value={formData.date || new Date().toISOString().split('T')[0]} onChange={e => setFormData({ ...formData, date: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
              <select value={formData.purpose || 'Pickup/Dropoff'} onChange={e => setFormData({ ...formData, purpose: e.target.value })} style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer' }}>
                <option>Pickup/Dropoff</option>
                <option>Post Office</option>
                <option>Store Visit</option>
                <option>Storage Unit</option>
                <option>Shipping Center</option>
                <option>Client Meeting</option>
                <option>Other</option>
              </select>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.from || ''} onChange={e => setFormData({ ...formData, from: e.target.value })} placeholder="From" style={{ ...inputStyle, flex: 1 }} />
                <input value={formData.to || ''} onChange={e => setFormData({ ...formData, to: e.target.value })} placeholder="To" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input type="number" value={formData.miles || ''} onChange={e => setFormData({ ...formData, miles: e.target.value })} placeholder="Miles *" style={inputStyle} />
              {formData.miles && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(251,191,36,0.1)', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: c.textMuted }}>Deduction</span>
                  <span style={{ fontWeight: 700, color: c.gold }}>{fmt((+formData.miles || 0) * settings.mileageRate)}</span>
                </div>
              )}
            </>}
            {modal === 'editSale' && <>
              <input value={formData.saleName || ''} onChange={e => setFormData({ ...formData, saleName: e.target.value })} placeholder="Product name *" style={{ ...inputStyle, marginBottom: 12 }} />
              <input value={formData.saleSku || ''} onChange={e => setFormData({ ...formData, saleSku: e.target.value })} placeholder="SKU" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input value={formData.saleSize || ''} onChange={e => setFormData({ ...formData, saleSize: e.target.value })} placeholder="Size *" style={{ ...inputStyle, flex: 1 }} />
                <input type="number" value={formData.saleCost || ''} onChange={e => setFormData({ ...formData, saleCost: e.target.value })} placeholder="Your cost *" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <input type="number" value={formData.salePrice || ''} onChange={e => setFormData({ ...formData, salePrice: e.target.value })} placeholder="Sale price *" style={{ ...inputStyle, flex: 1 }} />
                <select value={formData.platform || 'StockX Standard'} onChange={e => setFormData({ ...formData, platform: e.target.value })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                  <option>StockX Standard</option>
                  <option>StockX Direct</option>
                  <option>StockX Flex</option>
                  <option>GOAT</option>
                  <option>eBay</option>
                  <option>Local</option>
                </select>
              </div>
              {(!formData.platform || formData.platform === 'StockX Standard') && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 10, color: c.textMuted, display: 'block', marginBottom: 4 }}>SELLER LEVEL</label>
                  <select value={formData.sellerLevel || settings.stockxLevel} onChange={e => setFormData({ ...formData, sellerLevel: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value={9}>Level 1 (9%)</option>
                    <option value={8.5}>Level 2 (8.5%)</option>
                    <option value={8}>Level 3 (8%)</option>
                    <option value={7.5}>Level 4 (7.5%)</option>
                    <option value={7}>Level 5 (7%)</option>
                  </select>
                </div>
              )}
              <input type="date" value={formData.saleDate || ''} onChange={e => setFormData({ ...formData, saleDate: e.target.value })} style={inputStyle} />
            </>}
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '16px 22px 22px' }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCEL</button>
            <button onClick={async () => { 
              if (modal === 'purchase') addPurchase(); 
              else if (modal === 'bulkAdd') {
                const useSameCost = formData.bulkSameCost;
                const uniformCost = parseFloat(formData.bulkUniformCost) || 0;
                const rows = (formData.bulkRows || []).filter(r => r.size && (useSameCost ? uniformCost > 0 : r.cost));
                
                if (!formData.bulkName || rows.length === 0) {
                  alert('Please enter product name and at least one size with cost');
                  return;
                }
                
                // Build items array with qty expansion
                const itemsToSave = [];
                rows.forEach(row => {
                  const qty = parseInt(row.qty) || 1;
                  const cost = useSameCost ? uniformCost : parseFloat(row.cost);
                  for (let i = 0; i < qty; i++) {
                    itemsToSave.push({
                      name: formData.bulkName,
                      sku: formData.bulkSku || '',
                      size: row.size,
                      cost: cost,
                      date: formData.bulkDate || new Date().toISOString().split('T')[0],
                      sold: false
                    });
                  }
                });
                
                // Save to Supabase
                bulkSaveInventoryToSupabase(itemsToSave).then(savedItems => {
                  if (savedItems.length > 0) {
                    setPurchases(prev => [...prev, ...savedItems.map(item => ({
                      id: item.id,
                      name: item.name,
                      sku: item.sku,
                      size: item.size,
                      cost: parseFloat(item.cost) || 0,
                      date: item.date,
                      sold: item.sold || false
                    }))]);
                  }
                });
                setModal(null);
                setFormData({});
              }
              else if (modal === 'sale') addSale(); 
              else if (modal === 'editSale') {
                // Update existing sale
                const price = parseFloat(formData.salePrice);
                const cost = parseFloat(formData.saleCost);
                const fees = calcFees(price, formData.platform || 'StockX Standard');
                const updatedSale = {
                  id: formData.editSaleId,
                  name: formData.saleName,
                  sku: formData.saleSku,
                  size: formData.saleSize,
                  cost,
                  salePrice: price,
                  platform: formData.platform,
                  saleDate: formData.saleDate,
                  fees,
                  profit: price - cost - fees
                };
                // Update in Supabase
                updateSaleInSupabase(updatedSale);
                setSales(sales.map(s => s.id === formData.editSaleId ? { ...s, ...updatedSale } : s));
                setModal(null);
                setFormData({});
              }
              else if (modal === 'editInventory') {
                // Update existing inventory item
                const updatedItem = {
                  id: formData.editId,
                  name: formData.name,
                  sku: formData.sku,
                  size: formData.size,
                  cost: parseFloat(formData.cost) || 0,
                  date: formData.date
                };
                // Update in Supabase
                updateInventoryInSupabase(updatedItem);
                setPurchases(purchases.map(p => p.id === formData.editId ? { ...p, ...updatedItem } : p));
                setModal(null);
                setFormData({});
              }
              else if (modal === 'expense') addExpense(); 
              else if (modal === 'editExpense') {
                // Update existing expense in Supabase
                const updatedExpense = {
                  id: formData.editExpenseId,
                  category: formData.category,
                  amount: parseFloat(formData.amount) || 0,
                  description: formData.description || '',
                  date: formData.date
                };
                const result = await safeSaveExpense(user.id, updatedExpense);
                if (result.success && result.data) {
                  setExpenses(expenses.map(e => e.id === formData.editExpenseId ? result.data : e));
                  console.log('[Expenses] Updated:', formData.editExpenseId);
                } else {
                  console.error('[Expenses] Update failed:', result.error);
                  alert('Failed to update expense: ' + (result.error || 'Unknown error'));
                }
                setModal(null);
                setFormData({});
              }
              else if (modal === 'storage') addStorage(); 
              else if (modal === 'mileage') addMileage(); 
            }} style={{ flex: 1, padding: 14, ...btnPrimary, fontSize: 13 }}>
              {modal === 'purchase' ? 'ADD ITEM' : modal === 'bulkAdd' ? (() => {
                const rows = formData.bulkRows || [];
                const useSameCost = formData.bulkSameCost;
                const uniformCost = parseFloat(formData.bulkUniformCost) || 0;
                let count = 0;
                rows.forEach(r => {
                  if (r.size && (useSameCost ? uniformCost > 0 : parseFloat(r.cost) > 0)) {
                    count += parseInt(r.qty) || 1;
                  }
                });
                return `ADD ${count} ITEM${count !== 1 ? 'S' : ''}`;
              })() : modal === 'sale' ? 'RECORD 💰' : modal === 'editSale' ? 'SAVE CHANGES' : modal === 'editInventory' ? 'SAVE CHANGES' : modal === 'editExpense' ? 'SAVE CHANGES' : modal === 'mileage' ? 'LOG TRIP' : 'ADD'}
            </button>
          </div>
        </div>
      </div>}

      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.25); }
        select option { background: #111; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.3); }
        
        /* Premium Animations */
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(16,185,129,0.1); }
          50% { box-shadow: 0 0 40px rgba(16,185,129,0.2); }
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 60px rgba(16,185,129,0.08);
          border-color: rgba(16,185,129,0.2) !important;
        }
        
        .btn-hover {
          transition: all 0.2s ease;
        }
        
        .btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16,185,129,0.4);
        }
        
        .btn-hover:active {
          transform: translateY(0);
        }
        
        .row-hover {
          transition: all 0.2s ease;
        }
        
        .row-hover:hover {
          background: rgba(16,185,129,0.05) !important;
          transform: translateX(4px);
        }
        
        .nav-item {
          transition: all 0.2s ease;
        }
        
        .nav-item:hover {
          transform: translateX(4px);
        }
        
        .stat-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #10b981, #059669);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 60px rgba(16,185,129,0.1);
          border-color: rgba(16,185,129,0.3) !important;
        }
        
        .stat-card:hover::before {
          opacity: 1;
        }
        
        .progress-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
        
        .pending-pulse {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        
        .fade-in {
          animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        /* PRINT STYLES */
        @media print {
          /* Force everything white */
          *, *::before, *::after {
            background: white !important;
            background-color: white !important;
            background-image: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          body, html {
            background: white !important;
          }
          
          /* Hide sidebar, navigation, buttons */
          aside, .no-print, button, nav {
            display: none !important;
          }
          
          /* Hide the background gradient overlay */
          div[style*="radial-gradient"], 
          div[style*="linear-gradient"] {
            background: white !important;
            background-image: none !important;
          }
          
          /* Make main content full width */
          main {
            margin: 0 !important;
            padding: 20px !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
          }
          
          /* White background for all divs */
          div {
            background: white !important;
            background-color: white !important;
            box-shadow: none !important;
          }
          
          /* Cards get a subtle border */
          .card-hover {
            border: 1px solid #ccc !important;
            break-inside: avoid;
            margin-bottom: 20px !important;
          }
          
          /* Black text everywhere */
          * {
            color: black !important;
          }
          
          /* Page breaks */
          h2, h3 {
            page-break-after: avoid;
          }
          
          table {
            page-break-inside: avoid;
          }
          
          /* Make sure text is readable */
          p, span, td, th, div {
            color: black !important;
          }
        }

        /* PULSE ANIMATIONS */
        .pulse-ring {
          animation: pulse-ring 2s ease-out infinite;
        }
        
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        .shimmer-line {
          animation: shimmer 3s ease-in-out infinite;
        }
        
        .breathe {
          animation: breathe 4s ease-in-out infinite;
        }

        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
        
        .pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        
        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .shimmer-line {
          animation: shimmer 2s ease-in-out infinite;
        }
        
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.6; }
        }
        
        @keyframes border-flow {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .border-flow {
          animation: border-flow 3s linear infinite;
        }
        
        @keyframes spin-slow {
          100% { transform: rotate(360deg); }
        }
        
        .spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        
        @keyframes ring-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(201,169,98,0.3)); }
          50% { filter: drop-shadow(0 0 20px rgba(201,169,98,0.5)); }
        }
        
        .ring-pulse {
          animation: ring-pulse 3s ease-in-out infinite;
        }
        
        .stat-card-hover:hover {
          transform: translateY(-8px);
          border-color: rgba(201,169,98,0.3);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        
        .hero-card:hover .breathe {
          animation-duration: 2s;
        }
        
        /* MOBILE RESPONSIVE */
        .mobile-only {
          display: none !important;
        }
        
        @media (max-width: 850px) {
          html, body {
            overflow-x: hidden !important;
          }
          
          #appWrapper {
            flex-direction: column !important;
            overflow-x: hidden !important;
          }
          
          .mobile-only {
            display: flex !important;
          }
          
          #mobileOverlay {
            display: block !important;
          }
          
          #sidebar {
            position: fixed !important;
            left: -280px !important;
            top: 0 !important;
            bottom: 0 !important;
            width: 260px !important;
            min-width: 260px !important;
            max-width: 260px !important;
            height: 100vh !important;
            transition: left 0.3s ease !important;
            z-index: 200 !important;
            overflow: hidden !important;
          }
          
          #sidebar.open {
            left: 0 !important;
          }
          
          #mainContent {
            flex: 1 !important;
            margin-top: 70px !important;
            margin-left: 0 !important;
            padding: 16px !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          
          .desktop-header {
            margin-bottom: 16px !important;
            padding-bottom: 12px !important;
          }
          
          .desktop-header h1 {
            font-size: 22px !important;
          }
          
          .no-mobile {
            display: none !important;
          }
          
          /* Fix grid layouts on mobile */
          .mobile-stack {
            grid-template-columns: 1fr !important;
          }
          
          /* Receipt scanner box */
          #nikeReceiptInput + div {
            flex-direction: column !important;
          }
        }
        
        @media (max-width: 500px) {
          #mainContent {
            padding: 12px !important;
          }
          
          .desktop-header h1 {
            font-size: 18px !important;
          }
        }
      `}</style>
      
      {page === 'copcheck' && <CopCheck />}
      {page === 'listings' && <Listings stockxToken={stockxToken} ebayToken={ebayToken} purchases={purchases} c={c} />}
      {/* NIKE EXAMPLE MODAL */}
      {showNikeExample && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#111', border: `1px solid ${c.border}`, borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#111', zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>📸 Valid Screenshot Examples</h3>
              <button onClick={() => setShowNikeExample(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {/* Desktop Example */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: c.green, fontSize: 13, fontWeight: 700 }}>
                  <span>✅</span> Nike.com (Desktop)
                </div>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', padding: 8 }}>
                  <img 
                    src={NIKE_DESKTOP_EXAMPLE} 
                    alt="Nike.com desktop example" 
                    style={{ width: '100%', height: 'auto', borderRadius: 8 }}
                  />
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: c.green }}>↑ Shows Style Code, Size, and Price ✓</div>
              </div>
              
              {/* Mobile Example */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: c.green, fontSize: 13, fontWeight: 700 }}>
                  <span>✅</span> Nike App (Mobile)
                </div>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', padding: 8 }}>
                  <img 
                    src={NIKE_MOBILE_EXAMPLE} 
                    alt="Nike app mobile example" 
                    style={{ width: '100%', height: 'auto', maxHeight: 400, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: c.green }}>↑ Nike App order with Style Code, Size, Price ✓</div>
              </div>
              
              {/* Bad Example */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: c.red, fontSize: 13, fontWeight: 700 }}>
                  <span>❌</span> Paper Receipts WON'T Work
                </div>
                <div style={{ background: '#f5f5dc', borderRadius: 8, padding: 14, fontFamily: 'Courier New, monospace', fontSize: 11, color: '#333', lineHeight: 1.6 }}>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 8 }}>NIKE FACTORY STORE</div>
                  <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }}></div>
                  AIR JORDAN 4.............$189.99<br/>
                  <span style={{ color: '#ef4444', fontSize: 10 }}>← No Style Code!</span><br/>
                  <span style={{ color: '#ef4444', fontSize: 10 }}>← No Size!</span><br/>
                  <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }}></div>
                  TOTAL: $205.19
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: c.red }}>↑ Missing Style Code & Size = ✗ Invalid</div>
              </div>
              
              {/* Tip */}
              <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: 12, fontSize: 11, color: '#93c5fd', lineHeight: 1.5 }}>
                💡 <strong>Tip:</strong> Open the Nike App → Orders → Screenshot your order details. Or log into Nike.com and screenshot your order history.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrap App in ErrorBoundary for production stability
export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
