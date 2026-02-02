import React, { useState, useEffect } from 'react';
import Repricer from './Repricer';
import CrossList from './CrossList';
import { supabase } from './supabase';

/**
 * LISTINGS - Thin Wrapper
 * Three tabs:
 * 1) Repricer - StockX price management
 * 2) Cross List - StockX → eBay multi-platform
 * 3) Delist History - Auto-delist activity log
 */
export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [activeTab, setActiveTab] = useState('repricer');
  
  // Delist History state
  const [delistHistory, setDelistHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load delist history when tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      loadDelistHistory();
    }
  }, [activeTab]);

  const loadDelistHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('delist_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('[DelistHistory] Load error:', error);
      } else {
        setDelistHistory(data || []);
      }
    } catch (e) {
      console.error('[DelistHistory] Load error:', e);
    }
    setLoadingHistory(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${c.border}`, paddingBottom: 16 }}>
        <button
          onClick={() => setActiveTab('repricer')}
          style={{
            padding: '12px 20px',
            background: activeTab === 'repricer' ? c.card : 'transparent',
            border: activeTab === 'repricer' ? `1px solid ${c.gold}` : `1px solid ${c.border}`,
            borderRadius: 8,
            color: activeTab === 'repricer' ? c.gold : c.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          ⚡ Repricer
          <span style={{ fontSize: 11, opacity: 0.7 }}>StockX</span>
        </button>
        
        <button
          onClick={() => setActiveTab('crosslist')}
          style={{
            padding: '12px 20px',
            background: activeTab === 'crosslist' ? c.card : 'transparent',
            border: activeTab === 'crosslist' ? `1px solid ${c.gold}` : `1px solid ${c.border}`,
            borderRadius: 8,
            color: activeTab === 'crosslist' ? c.gold : c.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          🚀 Cross List
          <span style={{ fontSize: 11, opacity: 0.7 }}>StockX → eBay</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '12px 20px',
            background: activeTab === 'history' ? c.card : 'transparent',
            border: activeTab === 'history' ? `1px solid ${c.gold}` : `1px solid ${c.border}`,
            borderRadius: 8,
            color: activeTab === 'history' ? c.gold : c.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          📋 Delist History
          <span style={{ fontSize: 11, opacity: 0.7 }}>Auto-Delist Log</span>
        </button>
      </div>

      {/* Page Content */}
      {activeTab === 'repricer' && (
        <Repricer 
          stockxToken={stockxToken} 
          purchases={purchases} 
          c={c} 
        />
      )}
      
      {activeTab === 'crosslist' && (
        <CrossList 
          stockxToken={stockxToken} 
          ebayToken={ebayToken} 
          purchases={purchases}
          c={c} 
        />
      )}

      {activeTab === 'history' && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Delist History</h2>
            <p style={{ color: c.textMuted, fontSize: 14 }}>
              Automatic delistings when items sell on another platform
            </p>
          </div>

          {/* Refresh Button */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={loadDelistHistory}
              disabled={loadingHistory}
              style={{
                padding: '8px 16px',
                background: c.card,
                border: `1px solid ${c.border}`,
                borderRadius: 6,
                color: c.text,
                fontSize: 13,
                cursor: loadingHistory ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {loadingHistory ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {/* History List */}
          <div style={{ 
            background: c.card, 
            borderRadius: 12, 
            border: `1px solid ${c.border}`,
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', 
              padding: '12px 16px',
              borderBottom: `1px solid ${c.border}`,
              background: 'rgba(255,255,255,0.02)'
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>ITEM</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>SIZE</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>SOLD ON</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>REMOVED FROM</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>DATE</span>
            </div>

            {/* Rows */}
            {loadingHistory ? (
              <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
                Loading...
              </div>
            ) : delistHistory.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
                No auto-delistings yet. When items sell on one platform, they'll be automatically removed from the other and logged here.
              </div>
            ) : (
              delistHistory.map((item, idx) => (
                <div 
                  key={item.id || idx}
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', 
                    padding: '14px 16px',
                    borderBottom: idx < delistHistory.length - 1 ? `1px solid ${c.border}` : 'none',
                    alignItems: 'center'
                  }}
                >
                  {/* Item */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.item_sku || 'Unknown'}</div>
                    {item.item_name && (
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{item.item_name}</div>
                    )}
                  </div>
                  
                  {/* Size */}
                  <div style={{ fontSize: 13 }}>{item.item_size || '—'}</div>
                  
                  {/* Sold On */}
                  <div>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      fontSize: 11, 
                      fontWeight: 600,
                      background: item.sold_on === 'stockx' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                      color: item.sold_on === 'stockx' ? c.green : '#3b82f6'
                    }}>
                      {item.sold_on === 'stockx' ? 'StockX' : item.sold_on === 'ebay' ? 'eBay' : item.sold_on || '—'}
                    </span>
                  </div>
                  
                  {/* Removed From */}
                  <div>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      fontSize: 11, 
                      fontWeight: 600,
                      background: item.delisted_from === 'ebay' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
                      color: item.delisted_from === 'ebay' ? '#3b82f6' : c.green
                    }}>
                      {item.delisted_from === 'ebay' ? 'eBay' : item.delisted_from === 'stockx' ? 'StockX' : item.delisted_from || '—'}
                    </span>
                  </div>
                  
                  {/* Date */}
                  <div style={{ fontSize: 12, color: c.textMuted }}>
                    {formatDate(item.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stats Summary */}
          {delistHistory.length > 0 && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: c.card, 
              borderRadius: 8, 
              border: `1px solid ${c.border}`,
              display: 'flex',
              gap: 24
            }}>
              <div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL DELISTINGS</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{delistHistory.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>SOLD ON STOCKX</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.green }}>
                  {delistHistory.filter(d => d.sold_on === 'stockx').length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>SOLD ON EBAY</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
                  {delistHistory.filter(d => d.sold_on === 'ebay').length}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
