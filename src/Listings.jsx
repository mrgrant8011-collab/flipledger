import React, { useState, useEffect, useCallback, useMemo } from 'react';

export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [subTab, setSubTab] = useState('reprice');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockxListings, setStockxListings] = useState(() => { try { return JSON.parse(localStorage.getItem('fl_sx') || '[]'); } catch { return []; } });
  const [ebayListings, setEbayListings] = useState(() => { try { return JSON.parse(localStorage.getItem('fl_eb') || '[]'); } catch { return []; } });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [editedPrices, setEditedPrices] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Normalize SKU for matching (remove hyphens, spaces)
  const normalizeSku = (sku) => {
    if (!sku) return '';
    return String(sku).toLowerCase().replace(/[-\s]/g, '');
  };

  // Normalize size for matching (remove W, spaces, etc)
  const normalizeSize = (size) => {
    if (!size) return '';
    return String(size).toUpperCase().replace(/\s+/g, '').replace(/W$/, '').replace(/^W/, '');
  };

  // Get cost from inventory - flexible matching
  const getCost = useCallback((sku, size) => {
    if (!purchases?.length || !sku) return null;
    
    const skuNorm = normalizeSku(sku);
    const sizeNorm = normalizeSize(size);
    const sizeRaw = String(size || '').toUpperCase();
    
    // Find matching inventory items (not sold)
    const matches = purchases.filter(p => {
      if (p.sold) return false;
      
      // Normalize inventory SKU
      const pSkuNorm = normalizeSku(p.sku);
      const pSizeNorm = normalizeSize(p.size);
      const pSizeRaw = String(p.size || '').toUpperCase();
      
      // Match SKU (normalized - ignores hyphens)
      const skuMatch = pSkuNorm === skuNorm || pSkuNorm.includes(skuNorm) || skuNorm.includes(pSkuNorm);
      
      // Match size (try multiple formats)
      const sizeMatch = pSizeNorm === sizeNorm || pSizeRaw === sizeRaw || p.size == size;
      
      return skuMatch && sizeMatch;
    });
    
    if (matches.length === 0) return null;
    if (matches.length === 1) return parseFloat(matches[0].cost) || null;
    
    // Multiple matches - return range
    const costs = matches.map(m => parseFloat(m.cost) || 0).filter(c => c > 0);
    if (costs.length === 0) return null;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return min === max ? min : `${min}-${max}`;
  }, [purchases]);

  const syncListings = useCallback(async () => {
    setSyncing(true);
    try {
      const [sxRes, ebRes] = await Promise.all([
        stockxToken ? fetch('/api/stockx-listings', { headers: { 'Authorization': `Bearer ${stockxToken}` } }) : null,
        ebayToken ? fetch('/api/ebay-listings', { headers: { 'Authorization': `Bearer ${ebayToken}` } }) : null
      ]);
      const sx = sxRes?.ok ? (await sxRes.json()).listings || [] : [];
      const eb = ebRes?.ok ? (await ebRes.json()).listings || [] : [];
      setStockxListings(sx); setEbayListings(eb);
      localStorage.setItem('fl_sx', JSON.stringify(sx)); localStorage.setItem('fl_eb', JSON.stringify(eb));
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay`);
    } catch { showToast('Sync failed', 'error'); }
    finally { setSyncing(false); }
  }, [stockxToken, ebayToken]);

  useEffect(() => { if ((stockxToken || ebayToken) && !stockxListings.length) syncListings(); }, []);

  // Group listings by SKU
  const groupedProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNK';
      if (!g[sku]) g[sku] = { sku, name: l.name, image: l.image, productId: l.productId, sizes: [] };
      const cost = getCost(sku, l.size);
      g[sku].sizes.push({ ...l, cost });
    });
    Object.values(g).forEach(p => {
      p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
      p.totalQty = p.sizes.length;
      p.notLowest = p.sizes.filter(s => s.lowestAsk && s.yourAsk > s.lowestAsk).length;
    });
    return Object.values(g);
  }, [stockxListings, getCost]);

  // Calculate counts for tabs
  const totalNotLowest = useMemo(() => stockxListings.filter(l => l.lowestAsk && l.yourAsk > l.lowestAsk).length, [stockxListings]);
  const crosslistProducts = useMemo(() => { const es = new Set(ebayListings.map(e => (e.sku || e.mpn || '').toLowerCase())); return groupedProducts.filter(p => !es.has(p.sku.toLowerCase())); }, [groupedProducts, ebayListings]);
  const totalCrosslist = crosslistProducts.reduce((s, p) => s + p.totalQty, 0);

  const filteredProducts = useMemo(() => { if (!searchQuery.trim()) return groupedProducts; const q = searchQuery.toLowerCase(); return groupedProducts.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)); }, [groupedProducts, searchQuery]);
  const currentProduct = useMemo(() => groupedProducts.find(p => p.sku === selectedProduct), [groupedProducts, selectedProduct]);

  useEffect(() => { if (filteredProducts.length && !selectedProduct) setSelectedProduct(filteredProducts[0].sku); }, [filteredProducts]);

  const handleSelectAll = () => { if (!currentProduct) return; setSelectedSizes(selectedSizes.size === currentProduct.sizes.length ? new Set() : new Set(currentProduct.sizes.map(s => s.listingId))); };
  
  const handleUpdatePrices = async () => {
    const u = Object.entries(editedPrices).map(([id, a]) => ({ listingId: id, amount: Math.round(parseFloat(a)) })).filter(x => x.amount > 0);
    if (!u.length) { showToast('No prices to update', 'error'); return; }
    console.log('[Listings] Updating prices:', u);
    setLoading(true);
    try {
      const r = await fetch('/api/stockx-listings', { method: 'PATCH', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: u }) });
      const data = await r.json();
      console.log('[Listings] Update response:', r.status, data);
      if (r.ok && data.success) { 
        showToast(`Updated ${u.length} prices`); 
        setEditedPrices({}); 
        await syncListings(); 
      } else {
        const errMsg = data.details || data.error || data.message || 'Update failed';
        console.error('[Listings] Update error:', errMsg);
        showToast(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg), 'error');
      }
    } catch (e) { 
      console.error('[Listings] Update exception:', e);
      showToast('Update failed: ' + e.message, 'error'); 
    }
    finally { setLoading(false); }
  };
  
  const handleUnlist = async () => {
    if (!selectedSizes.size) return;
    setLoading(true);
    try {
      const r = await fetch('/api/stockx-listings', { method: 'DELETE', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: Array.from(selectedSizes) }) });
      if (r.ok) { showToast(`Unlisted ${selectedSizes.size} items`); setSelectedSizes(new Set()); await syncListings(); }
      else showToast('Unlist failed', 'error');
    } catch { showToast('Unlist failed', 'error'); }
    finally { setLoading(false); }
  };

  const card = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 12 };

  // Format cost display
  const formatCost = (cost) => {
    if (!cost) return '—';
    if (typeof cost === 'string' && cost.includes('-')) return `$${cost}`;
    return `$${cost}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ROW 1: Search + Sync */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <input type="text" placeholder="Search SKU or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: 200, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13 }} />
        <button onClick={syncListings} disabled={syncing} style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: syncing ? 0.7 : 1 }}>🔄 {syncing ? 'Syncing...' : 'Sync'}</button>
      </div>

      {/* ROW 2: Tabs */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { id: 'reprice', icon: '⚡', label: 'Reprice', count: totalNotLowest },
          { id: 'crosslist', icon: '🚀', label: 'Cross-list', count: totalCrosslist },
          { id: 'all', icon: '📦', label: 'All Listings', count: stockxListings.length + ebayListings.length }
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '10px 18px', background: subTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${subTab === t.id ? 'rgba(255,255,255,0.2)' : c.border}`, borderRadius: 8, color: c.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t.icon} {t.label} <span style={{ color: c.gold, marginLeft: 6 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ROW 3: Master-Detail */}
      {subTab === 'reprice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Left: Products */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</div>
            <div style={{ maxHeight: 540, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
                <div key={p.sku} onClick={() => { setSelectedProduct(p.sku); setSelectedSizes(new Set()); setEditedPrices({}); }} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === p.sku ? `3px solid ${c.gold}` : '3px solid transparent', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {p.image ? <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.onerror = null; e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="8" y="30" font-size="20">👟</text></svg>'; }} /> : <span style={{ fontSize: 20 }}>👟</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: c.textMuted }}>{p.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>x{p.totalQty}</div>
                    {p.notLowest > 0 && <div style={{ fontSize: 10, color: c.red }}>{p.notLowest} ↓</div>}
                  </div>
                </div>
              ))}
              {!filteredProducts.length && <div style={{ padding: 40, textAlign: 'center', color: c.textMuted, fontSize: 13 }}>{syncing ? 'Loading...' : 'No listings'}</div>}
            </div>
          </div>

          {/* Right: Detail */}
          <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {currentProduct ? (
              <>
                <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {currentProduct.image ? <img src={currentProduct.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.onerror = null; e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><text x="15" y="42" font-size="30">👟</text></svg>'; }} /> : <span style={{ fontSize: 26 }}>👟</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentProduct.name}</h3>
                    <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                      {currentProduct.sku}
                      {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🚀 Direct</span>}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: c.textMuted }}>
                    <input type="checkbox" checked={currentProduct.sizes.length > 0 && selectedSizes.size === currentProduct.sizes.length} onChange={handleSelectAll} style={{ width: 16, height: 16, accentColor: c.green }} />
                    Select all
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                  <span style={{ width: 32 }}></span>
                  <span style={{ width: 70 }}>SIZE</span>
                  <span style={{ width: 36 }}>QTY</span>
                  <span style={{ width: 70 }}>YOUR ASK</span>
                  <span style={{ width: 70 }}>LOWEST</span>
                  <span style={{ width: 80 }}>SELL FASTER</span>
                  <span style={{ width: 60 }}>COST</span>
                  <span style={{ width: 70 }}>PROFIT</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360 }}>
                  {currentProduct.sizes.map(item => {
                    const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                    const isEdited = editedPrices[item.listingId] !== undefined;
                    const currentPrice = parseFloat(editedPrices[item.listingId] ?? item.yourAsk) || 0;
                    const sellFasterPrice = item.sellFaster || item.highestBid || null;
                    
                    // Channel badge color
                    const channel = item.inventoryType || 'STANDARD';
                    const channelBadge = channel === 'DIRECT' ? { label: 'D', bg: '#f97316' } : 
                                        channel === 'FLEX' ? { label: 'F', bg: '#8b5cf6' } : 
                                        { label: 'S', bg: '#6b7280' };
                    
                    // Calculate profit (price after ~15% StockX fees - cost)
                    let costNum = null;
                    if (item.cost) {
                      if (typeof item.cost === 'string' && item.cost.includes('-')) {
                        costNum = parseFloat(item.cost.split('-')[1]);
                      } else {
                        costNum = parseFloat(item.cost);
                      }
                    }
                    // StockX payout is roughly 85% of sale price (15% fees)
                    const payout = currentPrice * 0.85;
                    const profit = costNum ? (payout - costNum).toFixed(0) : null;
                    const profitColor = profit > 0 ? c.green : profit < 0 ? c.red : c.textMuted;
                    
                    return (
                      <div key={item.listingId} style={{ display: 'flex', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                        <span style={{ width: 32 }}><input type="checkbox" checked={selectedSizes.has(item.listingId)} onChange={e => { const n = new Set(selectedSizes); e.target.checked ? n.add(item.listingId) : n.delete(item.listingId); setSelectedSizes(n); }} style={{ width: 16, height: 16, accentColor: c.green }} /></span>
                        <span style={{ width: 70, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.size}
                          <span style={{ background: channelBadge.bg, color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3 }}>{channelBadge.label}</span>
                        </span>
                        <span style={{ width: 36 }}>1</span>
                        <span style={{ width: 70 }}><input type="number" value={editedPrices[item.listingId] ?? item.yourAsk} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} style={{ width: 54, padding: '6px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, fontSize: 13, textAlign: 'center' }} /></span>
                        <span style={{ width: 70, color: isLowest ? c.green : c.text, fontWeight: 600 }}>{item.lowestAsk ? `$${item.lowestAsk}` : '—'}{isLowest && ' ✓'}</span>
                        <span style={{ width: 80 }}>{sellFasterPrice ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: sellFasterPrice })} style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 4, padding: '4px 8px', color: '#f97316', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>${sellFasterPrice}</button> : '—'}</span>
                        <span style={{ width: 60, color: c.textMuted }}>{formatCost(item.cost)}</span>
                        <span style={{ width: 70, color: profitColor, fontWeight: 600 }}>{profit ? `$${profit}` : '—'}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10 }}>
                  <button onClick={handleUpdatePrices} disabled={!Object.keys(editedPrices).length || loading} style={{ padding: '10px 24px', background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed' }}>{loading ? 'Updating...' : 'Update Prices'}</button>
                  <button onClick={handleUnlist} disabled={!selectedSizes.size || loading} style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13, fontWeight: 600, cursor: selectedSizes.size ? 'pointer' : 'not-allowed' }}>Unlist Selected</button>
                </div>
              </>
            ) : <div style={{ padding: 100, textAlign: 'center', color: c.textMuted, fontSize: 15 }}>Select a product</div>}
          </div>
        </div>
      )}

      {subTab === 'crosslist' && <div style={{ ...card, padding: 80, textAlign: 'center' }}><div style={{ fontSize: 56 }}>🚀</div><h3 style={{ marginTop: 16 }}>Cross-list to eBay</h3><p style={{ color: c.textMuted }}>{crosslistProducts.length} products ({totalCrosslist} listings) not on eBay</p></div>}
      {subTab === 'all' && <div style={{ ...card, padding: 80, textAlign: 'center' }}><div style={{ fontSize: 56 }}>📦</div><h3 style={{ marginTop: 16 }}>All Listings</h3><p style={{ color: c.textMuted }}>{stockxListings.length} StockX + {ebayListings.length} eBay</p></div>}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', borderRadius: 10, background: c.card, border: `1px solid ${toast.type === 'error' ? c.red : c.green}`, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', zIndex: 9999 }}><span style={{ color: toast.type === 'error' ? c.red : c.green, fontWeight: 600 }}>{toast.type === 'error' ? '❌' : '✓'} {toast.msg}</span></div>}
    </div>
  );
}
