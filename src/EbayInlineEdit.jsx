import React, { useState, useEffect } from 'react';
import PricingIntelligence from './PricingIntelligence';

/**
 * EBAY INLINE EDIT - Expandable edit form for On eBay listings
 * 
 * Renders below grouped size chip in CrossList when "On eBay" filter is active.
 * Fetches full offer data from eBay on open, then provides full edit form
 * matching ListingReview fields + PricingIntelligence sidebar.
 * 
 * Props:
 * - size: string (the grouped size, e.g. "12")
 * - items: array of size items in this group (from CrossList filteredSizes)
 * - product: the parent product { sku, name, brand, colorway, image, styleId }
 * - ebayToken: string
 * - stockxAsk: number (user's StockX ask for net comparison)
 * - marketData: object from ebay-browse API (or null if not loaded)
 * - onSave: function({ offerIds, changes }) — called when user saves
 * - onClose: function() — called when user collapses
 * - c: color theme
 */

const COLORS = [
  'Black','White','Red','Blue','Green','Yellow','Orange',
  'Purple','Pink','Brown','Gray','Beige','Tan','Gold',
  'Silver','Navy','Cream','Multicolor'
];

const DEPARTMENTS = ['Men','Women','Unisex','Boys','Girls','Unisex Kids'];

const CONDITIONS = [
  { value: 'NEW', label: 'New with Box' },
  { value: 'NEW_WITHOUT_BOX', label: 'New without Box' },
  { value: 'NEW_WITH_DEFECTS', label: 'New with Defects' },
  { value: 'USED_EXCELLENT', label: 'Pre-owned - Excellent' },
  { value: 'USED_GOOD', label: 'Pre-owned - Good' },
];

export default function EbayInlineEdit({
  size, items = [], product = {}, ebayToken,
  stockxAsk, marketData, onSave, onClose,
  ebaySellerLevel, ebayStoreType, c
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Original values (from eBay) for diff
  const [original, setOriginal] = useState({});

  // Editable fields
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('NEW');
  const [color, setColor] = useState('');
  const [brand, setBrand] = useState('');
  const [department, setDepartment] = useState('Men');
  const [styleCode, setStyleCode] = useState('');
  const [silhouette, setSilhouette] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);

  // Promoted listing
  const [promotedOn, setPromotedOn] = useState(false);
  const [adRate, setAdRate] = useState('4');

  // Offer IDs for this size group
  const offerIds = items.map(i => i.ebayOfferId).filter(Boolean);
  const listingCount = offerIds.length;

  const input = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${c.border}`, borderRadius: 8,
    color: c.text, fontSize: 14
  };

  // ============================================
  // FETCH FULL OFFER DATA ON MOUNT
  // ============================================
  useEffect(() => {
    if (offerIds.length > 0 && ebayToken) {
      fetchOfferDetails();
    } else {
      // No offer IDs — use product-level data as fallback
      setTitle(`${product.name || ''} Size ${size}`);
      setPrice(String(items[0]?.yourAsk || ''));
      setBrand(product.brand || '');
      setStyleCode(product.styleId || product.sku || '');
      setLoading(false);
    }
  }, []);

  const fetchOfferDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch first offer's full details (all in group share same data)
      const offerId = offerIds[0];
      const res = await fetch(`/api/ebay-update?offerId=${offerId}`, {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });

      // If the dedicated endpoint isn't ready yet, use offer data from inventory API
      // Fall back to building from what we have
      if (!res.ok) {
        console.log('[EbayInlineEdit] Could not fetch full offer, using available data');
        populateFromAvailable();
        return;
      }

      const data = await res.json();
      populateFromOffer(data);

    } catch (e) {
      console.error('[EbayInlineEdit] Fetch error:', e);
      populateFromAvailable();
    }
  };

  const populateFromOffer = (offerData) => {
    const t = offerData.title || `${product.name || ''} Size ${size}`;
    const p = offerData.price || String(items[0]?.yourAsk || '');
    const d = offerData.description || '';
    const co = offerData.condition || 'NEW';
    const cl = offerData.color || '';
    const br = offerData.brand || product.brand || '';
    const dp = offerData.department || 'Men';
    const sc = offerData.styleCode || product.styleId || product.sku || '';
    const sl = offerData.silhouette || '';
    const ph = offerData.photos || (product.image ? [product.image] : []);
    const promo = offerData.promoted || false;
    const ar = offerData.adRate || '4';

    setTitle(t); setPrice(p); setDescription(d); setCondition(co);
    setColor(cl); setBrand(br); setDepartment(dp); setStyleCode(sc);
    setSilhouette(sl); setPhotos(ph); setPromotedOn(promo); setAdRate(ar);

    setOriginal({ title: t, price: p, description: d, condition: co, color: cl, brand: br, department: dp, styleCode: sc, silhouette: sl, promoted: promo, adRate: ar });
    setLoading(false);
  };

  const populateFromAvailable = () => {
    const t = `${product.name || ''} Size ${size}`;
    const p = String(items[0]?.yourAsk || '');
    const br = product.brand || '';
    const sc = product.styleId || product.sku || '';
    const ph = product.image ? [product.image] : [];

    setTitle(t); setPrice(p); setBrand(br); setStyleCode(sc); setPhotos(ph);
    setOriginal({ title: t, price: p, description: '', condition: 'NEW', color: '', brand: br, department: 'Men', styleCode: sc, silhouette: '', promoted: false, adRate: '4' });
    setLoading(false);
  };

  // ============================================
  // SAVE CHANGES
  // ============================================
  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);

    // Build changes diff
    const changes = {};
    if (title !== original.title) changes.title = title;
    if (price !== original.price) changes.price = price;
    if (description !== original.description) changes.description = description;
    if (condition !== original.condition) changes.condition = condition;
    if (color !== original.color) changes.color = color;
    if (brand !== original.brand) changes.brand = brand;
    if (department !== original.department) changes.department = department;
    if (styleCode !== original.styleCode) changes.styleCode = styleCode;
    if (silhouette !== original.silhouette) changes.silhouette = silhouette;

    // Promoted changes
    const promoChanged = promotedOn !== original.promoted || adRate !== original.adRate;

    if (onSave) {
      await onSave({
        offerIds,
        skus: items.map(i => i.expectedEbaySku).filter(Boolean),
        changes,
        promoted: promoChanged ? { enabled: promotedOn, adRate } : null,
      });
    }

    // Update originals
    setOriginal({ title, price, description, condition, color, brand, department, styleCode, silhouette, promoted: promotedOn, adRate });
    setDirty(false);
    setSaving(false);
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
      {/* Header */}
      <div style={{ fontSize: 12, fontWeight: 700, color: c.green, marginBottom: 12 }}>
        Editing Size {size} — {listingCount} listing{listingCount !== 1 ? 's' : ''} · Changes apply to all
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: marketData ? '1fr 310px' : '1fr', gap: 16 }}>
        {/* ═══ LEFT: EDIT FORM ═══ */}
        <div>
          {/* Photos */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 8 }}>
              PHOTOS ({photos.length}/12)
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {photos.map((photo, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={photo} alt="" style={{
                    width: 80, height: 80, objectFit: 'cover', borderRadius: 8,
                    border: `1px solid ${c.border}`
                  }} onError={e => { e.target.style.display = 'none'; }} />
                  {i === 0 && (
                    <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 8, background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: 4 }}>Main</div>
                  )}
                </div>
              ))}
              {photos.length < 12 && (
                <label style={{
                  width: 80, height: 80, border: `2px dashed ${c.border}`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: c.textMuted, fontSize: 24
                }}>
                  +
                  <input type="file" accept="image/*" multiple
                    onChange={e => {
                      const files = Array.from(e.target.files);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                          setPhotos(prev => [...prev, ev.target.result].slice(0, 12));
                          markDirty();
                        };
                        reader.readAsDataURL(file);
                      });
                    }}
                    style={{ display: 'none' }} />
                </label>
              )}
            </div>
          </div>

          {/* Form Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {/* Title */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>TITLE</label>
              <input type="text" value={title} maxLength={80}
                onChange={e => { setTitle(e.target.value.slice(0, 80)); markDirty(); }}
                style={input} />
              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{title.length}/80</div>
            </div>

            {/* Price */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>PRICE</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: c.textMuted }}>$</span>
                <input type="text" inputMode="decimal" value={price}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                      setPrice(val); markDirty();
                    }
                  }}
                  style={{ ...input, paddingLeft: 28 }} />
              </div>
            </div>

            {/* Size (read-only) */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>SIZE</label>
              <input type="text" value={size} readOnly style={{ ...input, opacity: 0.6 }} />
            </div>

            {/* Condition */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>CONDITION</label>
              <select value={condition} onChange={e => { setCondition(e.target.value); markDirty(); }}
                style={{ ...input, cursor: 'pointer' }}>
                {CONDITIONS.map(co => <option key={co.value} value={co.value}>{co.label}</option>)}
              </select>
            </div>

            {/* Color */}
            <div>
              <label style={{ fontSize: 11, color: color ? c.textMuted : c.gold, display: 'block', marginBottom: 6 }}>
                COLOR {!color && '⚠️ REQUIRED'}
              </label>
              <select value={color} onChange={e => { setColor(e.target.value); markDirty(); }}
                style={{ ...input, borderColor: color ? c.border : c.gold, cursor: 'pointer' }}>
                <option value="">Select Color...</option>
                {COLORS.map(co => <option key={co} value={co}>{co}</option>)}
              </select>
            </div>

            {/* Brand */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>BRAND</label>
              <input type="text" value={brand} onChange={e => { setBrand(e.target.value); markDirty(); }} style={input} />
            </div>

            {/* Department */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>DEPARTMENT</label>
              <select value={department} onChange={e => { setDepartment(e.target.value); markDirty(); }}
                style={{ ...input, cursor: 'pointer' }}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Style Code */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>STYLE CODE</label>
              <input type="text" value={styleCode} onChange={e => { setStyleCode(e.target.value); markDirty(); }} style={input} />
            </div>

            {/* Silhouette */}
            <div>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>SILHOUETTE</label>
              <input type="text" value={silhouette} onChange={e => { setSilhouette(e.target.value); markDirty(); }}
                style={input} placeholder="e.g., Air Jordan 1" />
            </div>

            {/* Description */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>DESCRIPTION</label>
              <textarea value={description} onChange={e => { setDescription(e.target.value); markDirty(); }}
                rows={4} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{description.length}/4000</div>
            </div>
          </div>

          {/* Promoted Listing Toggle */}
          <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${c.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Promoted Listing</div>
                <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>Only pay when it sells</div>
              </div>
              <div onClick={() => { setPromotedOn(!promotedOn); markDirty(); }}
                style={{ width: 42, height: 22, borderRadius: 11, background: promotedOn ? c.green : '#333', cursor: 'pointer', position: 'relative' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: promotedOn ? 22 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>
            {promotedOn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600 }}>Ad Rate</span>
                <div style={{ position: 'relative', width: 60 }}>
                  <input type="text" inputMode="decimal" value={adRate}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d{0,1}$/.test(val)) {
                        setAdRate(val); markDirty();
                      }
                    }}
                    style={{ width: '100%', padding: '7px 22px 7px 8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 13, fontWeight: 700 }} />
                  <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: c.textMuted }}>%</span>
                </div>
                {['2', '4', '5', '8'].map(r => (
                  <button key={r} onClick={() => { setAdRate(r); markDirty(); }}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      border: adRate === r ? `1px solid ${c.green}` : `1px solid ${c.border}`,
                      background: adRate === r ? 'rgba(34,197,94,0.1)' : 'transparent',
                      color: adRate === r ? c.green : c.textMuted
                    }}>{r}%</button>
                ))}
              </div>
            )}
          </div>

          {/* Action row */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: c.textMuted, fontSize: 12, cursor: 'pointer' }}>
              ▲ Collapse
            </button>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {dirty && (
                <button onClick={() => { populateFromOffer(original); setDirty(false); }}
                  style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6, color: c.red, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  ✕ Discard
                </button>
              )}
              <button onClick={handleSave} disabled={!dirty || saving}
                style={{
                  padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
                  background: dirty ? c.gold : 'rgba(255,255,255,0.05)',
                  border: 'none', color: dirty ? '#000' : c.textMuted
                }}>
                {saving ? '⏳ Saving...' : `💾 Save ${listingCount} Listing${listingCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: PRICING INTELLIGENCE ═══ */}
        {marketData && (
          <PricingIntelligence
            price={price}
            setPrice={v => { setPrice(v); markDirty(); }}
            promotedOn={promotedOn}
            adRate={adRate}
            stockxAsk={stockxAsk}
            marketData={marketData}
            size={size}
            ebaySellerLevel={ebaySellerLevel}
            ebayStoreType={ebayStoreType}
            c={c}
          />
        )}
      </div>
    </div>
  );
}
