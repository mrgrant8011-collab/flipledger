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
 const [activeTab, setActiveTab] = useState(() => localStorage.getItem('flipledger_listings_tab') || 'repricer');
  useEffect(() => { localStorage.setItem('flipledger_listings_tab', activeTab); }, [activeTab]);
  
  // Delist History state
  const [delistHistory, setDelistHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
 const [ebayOffers, setEbayOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingOffer, setSavingOffer] = useState(null);
  const [editToast, setEditToast] = useState(null);

  // Load delist history when tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      loadDelistHistory();
    }
  }, [activeTab]);
 useEffect(() => {
    if (activeTab === 'editebay') {
      loadEbayOffers();
    }
  }, [activeTab]);

  const loadEbayOffers = async () => {
    if (!ebayToken) return;
    setLoadingOffers(true);
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const offers = (data.offers || data.listings || []).filter(o => o.status === 'PUBLISHED');
        setEbayOffers(offers);
      }
    } catch (e) {
      console.error('[EditEbay] Load error:', e);
    }
    setLoadingOffers(false);
  };

  const startEditing = (offer) => {
    setEditingOffer(offer.offerId);
    setEditValues({ title: offer.title || '', price: offer.price || '', quantity: offer.quantity || 1 });
  };

  const cancelEditing = () => {
    setEditingOffer(null);
    setEditValues({});
  };

  const saveOffer = async (offer) => {
    setSavingOffer(offer.offerId);
    try {
      const updates = [];
      const update = { sku: offer.sku, offerId: offer.offerId };
      let hasChanges = false;
      if (editValues.title !== (offer.title || '')) { update.title = editValues.title; hasChanges = true; }
      if (editValues.price !== (offer.price || '')) { update.price = editValues.price; hasChanges = true; }
      if (String(editValues.quantity) !== String(offer.quantity || 1)) { update.quantity = editValues.quantity; hasChanges = true; }
      if (!hasChanges) { cancelEditing(); setSavingOffer(null); return; }
      updates.push(update);
      const res = await fetch('/api/ebay-listings', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      if (res.ok) {
        setEditToast({ msg: '✓ Updated', type: 'success' });
        setEbayOffers(prev => prev.map(o => o.offerId === offer.offerId ? {
          ...o, title: editValues.title || o.title, price: editValues.price || o.price, quantity: editValues.quantity || o.quantity
        } : o));
        cancelEditing();
      } else {
        const err = await res.json().catch(() => ({}));
        setEditToast({ msg: err.error || 'Update failed', type: 'error' });
      }
    } catch (e) {
      setEditToast({ msg: e.message, type: 'error' });
    }
    setSavingOffer(null);
    setTimeout(() => setEditToast(null), 3000);
  };

  const loadDelistHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('delist_log')
        .select('*')
        .eq('status', 'success')
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
       <button
          onClick={() => setActiveTab('editebay')}
          style={{
            padding: '12px 20px',
            background: activeTab === 'editebay' ? c.card : 'transparent',
            border: activeTab === 'editebay' ? `1px solid ${c.gold}` : `1px solid ${c.border}`,
            borderRadius: 8,
            color: activeTab === 'editebay' ? c.gold : c.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          ✏️ Edit eBay
          <span style={{ fontSize: 11, opacity: 0.7 }}>Active Listings</span>
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
     {activeTab === 'editebay' && (
        <div>
          {editToast && (
            <div style={{
              position: 'fixed', top: 20, right: 20, padding: '12px 20px',
              background: editToast.type === 'error' ? c.red : c.green,
              borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000
            }}>
              {editToast.msg}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Edit eBay Listings</h2>
              <p style={{ color: c.textMuted, fontSize: 14 }}>
                Edit title, price, and quantity on your active eBay listings
              </p>
            </div>
            <button
              onClick={loadEbayOffers}
              disabled={loadingOffers}
              style={{
                padding: '10px 20px', background: c.card, border: `1px solid ${c.border}`,
                borderRadius: 8, color: c.text, fontSize: 13, fontWeight: 600,
                cursor: loadingOffers ? 'wait' : 'pointer'
              }}
            >
              {loadingOffers ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {!ebayToken ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.textMuted, background: c.card, borderRadius: 12, border: `1px solid ${c.border}` }}>
              Connect eBay in Settings first
            </div>
          ) : loadingOffers ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>Loading eBay listings...</div>
          ) : ebayOffers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.textMuted, background: c.card, borderRadius: 12, border: `1px solid ${c.border}` }}>
              No active eBay listings found. List items from Cross List first.
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 12 }}>{ebayOffers.length} active listing{ebayOffers.length !== 1 ? 's' : ''}</div>
              <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
                {ebayOffers.map((offer, idx) => {
                  const isEditing = editingOffer === offer.offerId;
                  const isSaving = savingOffer === offer.offerId;
                  return (
                    <div key={offer.offerId} style={{ borderBottom: idx < ebayOffers.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                      <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {offer.images?.[0] ? (
                            <img src={offer.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : '📦'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValues.title}
                              onChange={(e) => setEditValues(v => ({ ...v, title: e.target.value.slice(0, 80) }))}
                              maxLength={80}
                              style={{
                                width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
                                border: `1px solid ${c.border}`, borderRadius: 6, color: c.text,
                                fontSize: 13, fontWeight: 600
                              }}
                            />
                          ) : (
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {offer.title || offer.sku}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, display: 'flex', gap: 10 }}>
                            <span>{offer.sku}</span>
                            {offer.ebayUrl && <a href={offer.ebayUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>View on eBay ↗</a>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                          {isEditing ? (
                            <>
                              <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: c.textMuted, fontSize: 12 }}>$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={editValues.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                      setEditValues(v => ({ ...v, price: val }));
                                    }
                                  }}
                                  style={{
                                    width: 80, padding: '6px 10px 6px 22px', background: 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${c.border}`, borderRadius: 6, color: c.text,
                                    fontSize: 13, fontWeight: 700, textAlign: 'right'
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 9, color: c.textMuted }}>QTY</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={editValues.quantity}
                                  onChange={(e) => setEditValues(v => ({ ...v, quantity: e.target.value }))}
                                  style={{
                                    width: 48, padding: '6px 4px', background: 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${c.border}`, borderRadius: 6, color: c.text,
                                    fontSize: 13, fontWeight: 700, textAlign: 'center'
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 16, fontWeight: 700 }}>${offer.price || '—'}</div>
                              {(offer.quantity || 1) > 1 && (
                                <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: c.textMuted }}>
                                  x{offer.quantity}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => saveOffer(offer)}
                                disabled={isSaving}
                                style={{
                                  padding: '6px 14px', background: c.green, border: 'none', borderRadius: 6,
                                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer'
                                }}
                              >
                                {isSaving ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                style={{
                                  padding: '6px 14px', background: 'transparent', border: `1px solid ${c.border}`,
                                  borderRadius: 6, color: c.textMuted, fontSize: 12, cursor: 'pointer'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(offer)}
                              style={{
                                padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`,
                                borderRadius: 6, color: c.textMuted, fontSize: 12, cursor: 'pointer'
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

