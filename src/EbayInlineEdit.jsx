import React, { useState, useEffect } from 'react';
import PricingIntelligence from './PricingIntelligence';

/**
 * EBAY INLINE EDIT - Simplified edit form for On eBay listings
 * 
 * Two actions only:
 * 1. Change Price (the main thing)
 * 2. Sold Elsewhere (reduce eBay qty — never goes up here)
 * 
 * Adding inventory is done from the "Not on eBay" tab.
 */

export default function EbayInlineEdit({
  size, items = [], product = {}, ebayToken, ebayListings = [],
  stockxAsk, marketData, onSave, onSoldElsewhere, onClose,
  ebaySellerLevel, ebayStoreType, c
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Original values (from eBay) for diff
  const [original, setOriginal] = useState({});

  // Editable fields — simplified to just price
  const [price, setPrice] = useState('');

  // Sold Elsewhere UI
  const [showSoldConfirm, setShowSoldConfirm] = useState(false);
  const [soldCount, setSoldCount] = useState(1);

  // Offer IDs for this size group
  const offerIds = [...new Set(items.map(i => i.ebayOfferId).filter(Boolean))];
  const listingCount = offerIds.length;

  // Get live eBay qty from ebayListings
  const ebayItem = ebayListings.find(e => e.offerId === offerIds[0]);
  const ebayQty = ebayItem?.quantity || items.length;

  // ============================================
  // FETCH FULL OFFER DATA ON MOUNT
  // ============================================
  useEffect(() => {
    if (offerIds.length > 0 && ebayToken) {
      fetchOfferDetails();
    } else {
      populateFromAvailable();
    }
  }, []);

  const fetchOfferDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      const offerId = offerIds[0];
      const res = await fetch(`/api/ebay-update?offerId=${offerId}`, {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });

      if (!res.ok) {
        populateFromAvailable();
        return;
      }

      const data = await res.json();
      const p = data.price || String(items[0]?.yourAsk || '');
      setPrice(p);
      setOriginal({ price: p });
      setLoading(false);

    } catch (e) {
      console.error('[EbayInlineEdit] Fetch error:', e);
      populateFromAvailable();
    }
  };

  const populateFromAvailable = () => {
    const p = String(items[0]?.yourAsk || '');
    setPrice(p);
    setOriginal({ price: p });
    setLoading(false);
  };

  // ============================================
  // SAVE CHANGES (price only)
  // ============================================
  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);

    const changes = {};
    if (price !== original.price) changes.price = price;

    if (onSave) {
      await onSave({
        offerIds,
        skus: items.map(i => i.expectedEbaySku).filter(Boolean),
        changes,
        promoted: null,
      });
    }

    setOriginal({ price });
    setDirty(false);
    setSaving(false);
  };

  // Sold Elsewhere handler
  const handleSoldElsewhere = async () => {
    if (!onSoldElsewhere) return;
    const offerId = offerIds[0];
    const sku = items[0]?.expectedEbaySku || '';
    await onSoldElsewhere({ offerId, sku, size, count: soldCount });
    setShowSoldConfirm(false);
    setSoldCount(1);
  };

  const markDirty = () => { if (!dirty) setDirty(true); };

  // ============================================
  // RENDER
  // ============================================
  if (loading) {
    return (
      <div style={{ padding: '20px 16px 20px 46px', borderTop: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: 12, color: c.textMuted }}>⏳ Loading listing details...</div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, padding: '16px 16px 16px 46px', background: 'rgba(255,255,255,0.02)' }}>

      <div style={{ display: 'grid', gridTemplateColumns: marketData ? '1fr 310px' : '1fr', gap: 16 }}>
        {/* ═══ LEFT: SIMPLIFIED EDIT ═══ */}
        <div>
          {/* Product header — read only */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${c.border}` }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{product.name || 'Unknown Product'}</div>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>
                Size {size} · {product.styleId || product.sku} · {product.brand || ''} · New with Box
              </div>
            </div>
            <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(34,197,94,0.12)', color: c.green, fontWeight: 600 }}>
              Live on eBay
            </div>
          </div>

          {/* eBay Quantity display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>eBay Quantity</div>
              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>Add more from the "Not on eBay" tab</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{ebayQty}</div>
          </div>

          {/* Sold Elsewhere */}
          {!showSoldConfirm ? (
            <button onClick={() => setShowSoldConfirm(true)}
              style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.08)', color: '#fb923c', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>−</span> Sold Elsewhere
            </button>
          ) : (
            <div style={{ padding: 14, borderRadius: 8, marginBottom: 16, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fb923c', marginBottom: 10 }}>How many sold outside eBay?</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button onClick={() => setSoldCount(Math.max(1, soldCount - 1))}
                    style={{ width: 34, height: 36, fontSize: 16, fontWeight: 800, background: c.card || '#1a1a1a', border: `1px solid ${c.border}`, color: c.text, cursor: 'pointer', borderRadius: '6px 0 0 6px' }}>−</button>
                  <div style={{ width: 40, textAlign: 'center', fontSize: 18, fontWeight: 800, color: c.text, background: 'rgba(255,255,255,0.03)', padding: '6px 0', borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>{soldCount}</div>
                  <button onClick={() => setSoldCount(Math.min(ebayQty, soldCount + 1))}
                    style={{ width: 34, height: 36, fontSize: 16, fontWeight: 800, background: c.card || '#1a1a1a', border: `1px solid ${c.border}`, color: c.text, cursor: 'pointer', borderRadius: '0 6px 6px 0' }}>+</button>
                </div>
                <span style={{ fontSize: 11, color: c.textMuted }}>of {ebayQty} available</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.textMuted, marginBottom: 12 }}>
                <span>eBay qty:</span>
                <span style={{ fontWeight: 700, color: c.text }}>{ebayQty}</span>
                <span style={{ color: '#fb923c' }}>→</span>
                <span style={{ fontWeight: 800, fontSize: 15, color: (ebayQty - soldCount) === 0 ? '#ef4444' : '#fb923c' }}>{ebayQty - soldCount}</span>
                {(ebayQty - soldCount) === 0 && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>(listing will be removed)</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSoldElsewhere}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#fb923c', color: '#000', fontSize: 12, fontWeight: 700 }}>
                  Confirm: Remove {soldCount}
                </button>
                <button onClick={() => { setShowSoldConfirm(false); setSoldCount(1); }}
                  style={{ padding: '9px 14px', borderRadius: 6, border: `1px solid ${c.border}`, cursor: 'pointer', background: c.card || '#1a1a1a', color: c.textMuted, fontSize: 12, fontWeight: 600 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${c.border}`, marginBottom: 16 }} />

          {/* Price — the main thing */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6, fontWeight: 600 }}>PRICE</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: c.textMuted, fontWeight: 600 }}>$</span>
              <input type="text" inputMode="decimal" value={price}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setPrice(val); markDirty();
                  }
                }}
                style={{ width: '100%', height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, color: c.text, fontSize: 24, fontWeight: 800, paddingLeft: 36, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: c.textMuted, fontSize: 12, cursor: 'pointer' }}>
              ▲ Collapse
            </button>
            <button onClick={handleSave} disabled={!dirty || saving}
              style={{
                padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
                background: dirty ? (c.gold || '#d4a843') : 'rgba(255,255,255,0.05)',
                border: 'none', color: dirty ? '#000' : c.textMuted
              }}>
              {saving ? '⏳ Saving...' : 'Save Price'}
            </button>
          </div>
        </div>

        {/* ═══ RIGHT: PRICING INTELLIGENCE ═══ */}
        {marketData && (
          <PricingIntelligence
            price={price}
            setPrice={v => { setPrice(v); markDirty(); }}
            promotedOn={false}
            adRate={'0'}
            stockxAsk={stockxAsk}
            marketData={marketData}
            size={size}
            cost={items[0]?.cost || 0}
            ebaySellerLevel={ebaySellerLevel}
            ebayStoreType={ebayStoreType}
            c={c}
          />
        )}
      </div>
    </div>
  );
}
