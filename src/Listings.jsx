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
    if (!u.length) return;
    setLoading(true);
    try {
      const r = await fetch('/api/stockx-listings', { method: 'PATCH', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: u }) });
      if (r.ok) { showToast(`Updated ${u.length} prices`); setEditedPrices({}); await syncListings(); }
      else showToast('Update failed', 'error');
    } catch { showToast('Update failed', 'error'); }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ROW 1: Search + Sync */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <input type="text" placeholder="Search SKU or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: 220, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14 }} />
        <button onClick={syncListings} disabled={syncing} style={{ padding: '12px 24px', background: c.green, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: syncing ? 0.7 : 1 }}>🔄 {syncing ? 'Syncing...' : 'Sync'}</button>
      </div>

      {/* ROW 2: Tabs */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { id: 'reprice', icon: '⚡', label: 'Reprice', count: totalNotLowest },
          { id: 'crosslist', icon: '🚀', label: 'Cross-list', count: totalCrosslist },
          { id: 'all', icon: '📦', label: 'All Listings', count: stockxListings.length + ebayListings.length }
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '14px 24px', background: subTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${subTab === t.id ? 'rgba(255,255,255,0.2)' : c.border}`, borderRadius: 10, color: c.text, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {t.icon} {t.label} <span style={{ color: c.gold, marginLeft: 8 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ROW 3: Master-Detail */}
      {subTab === 'reprice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
          {/* Left: Products */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, fontSize: 12, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</div>
            <div style={{ maxHeight: 540, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
                <div key={p.sku} onClick={() => { setSelectedProduct(p.sku); setSelectedSizes(new Set()); setEditedPrices({}); }} style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === p.sku ? `4px solid ${c.gold}` : '4px solid transparent', display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {p.image ? <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>👟</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>{p.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Qty: {p.totalQty}</div>
                    {p.notLowest > 0 && <div style={{ fontSize: 11, color: c.red }}>{p.notLowest} not lowest</div>}
                  </div>
                </div>
              ))}
              {!filteredProducts.length && <div style={{ padding: 50, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'No listings'}</div>}
            </div>
          </div>

          {/* Right: Detail */}
          <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {currentProduct ? (
              <>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.05)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {currentProduct.image ? <img src={currentProduct.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30 }}>👟</span>}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{currentProduct.name}</h3>
                    <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
                      {currentProduct.sku}
                      {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🚀 Direct</span>}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px 24px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: c.textMuted }}>
                    <input type="checkbox" checked={currentProduct.sizes.length > 0 && selectedSizes.size === currentProduct.sizes.length} onChange={handleSelectAll} style={{ width: 16, height: 16, accentColor: c.green }} />
                    Select all
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '44px 80px 70px 110px 110px 110px 1fr', padding: '14px 24px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                  <span></span>
                  <span>SIZE</span>
                  <span style={{ textAlign: 'center' }}>QTY</span>
                  <span style={{ textAlign: 'center' }}>YOUR ASK</span>
                  <span style={{ textAlign: 'center' }}>LOWEST ASK</span>
                  <span style={{ textAlign: 'center' }}>SELL FASTER</span>
                  <span style={{ textAlign: 'right' }}>COST</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360 }}>
                  {currentProduct.sizes.map(item => {
                    const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                    const isEdited = editedPrices[item.listingId] !== undefined;
                    const sameSize = currentProduct.sizes.filter(s => s.size === item.size).length;
                    
                    return (
                      <div key={item.listingId} style={{ display: 'grid', gridTemplateColumns: '44px 80px 70px 110px 110px 110px 1fr', padding: '16px 24px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 14 }}>
                        <input type="checkbox" checked={selectedSizes.has(item.listingId)} onChange={e => { const n = new Set(selectedSizes); e.target.checked ? n.add(item.listingId) : n.delete(item.listingId); setSelectedSizes(n); }} style={{ width: 16, height: 16, accentColor: c.green }} />
                        <span style={{ fontWeight: 600 }}>{item.size}</span>
                        <span style={{ textAlign: 'center' }}>1</span>
                        <div style={{ textAlign: 'center' }}>
                          <input type="number" value={editedPrices[item.listingId] ?? item.yourAsk} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} style={{ width: 80, padding: '10px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 8, color: c.text, fontSize: 14, textAlign: 'center' }} />
                        </div>
                        <div style={{ textAlign: 'center', color: isLowest ? c.green : c.text, fontWeight: 600 }}>
                          {item.lowestAsk ? `$${item.lowestAsk}` : '—'}{isLowest && <span style={{ marginLeft: 6 }}>✓</span>}
                        </div>
                        <span style={{ textAlign: 'center', color: '#f97316', fontWeight: 600 }}>{item.sellFaster || item.highestBid ? `$${item.sellFaster || item.highestBid}` : '—'}</span>
                        <span style={{ textAlign: 'right', color: c.textMuted }}>{formatCost(item.cost)}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '18px 24px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 14 }}>
                  <button onClick={handleUpdatePrices} disabled={!Object.keys(editedPrices).length || loading} style={{ padding: '14px 32px', background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed' }}>Update Prices</button>
                  <button onClick={handleUnlist} disabled={!selectedSizes.size || loading} style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14, fontWeight: 600, cursor: selectedSizes.size ? 'pointer' : 'not-allowed' }}>Unlist Selected</button>
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
