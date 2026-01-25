import React, { useState } from 'react';
import Repricer from './Repricer';
import CrossList from './CrossList';

/**
 * LISTINGS - Thin Wrapper
 * Two pages only:
 * 1) Repricer - StockX price management
 * 2) Cross List - StockX → eBay multi-platform
 */
export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [activeTab, setActiveTab] = useState('repricer');

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
    </div>
  );
}
