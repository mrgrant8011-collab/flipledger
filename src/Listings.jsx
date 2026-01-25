/**
 * FLIPLEDGER LISTINGS TAB
 * Matches mockup exactly - simple layout, cached data
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

export default function Listings({ 
  stockxToken, 
  ebayToken, 
  purchases = [],
  c = {
    bg: '#0a0a0a',
    card: '#111111',
    border: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#888888',
    gold: '#C9A962',
    green: '#10b981',
    red: '#ef4444',
  }
}) {
  const [subTab, setSubTab] = useState('reprice');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load cached data on mount
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_stockx_listings') || '[]'); } catch { return []; }
  });
  const [ebayListings, setEbayListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_ebay_listings') || '[]'); } catch { return []; }
  });
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [editedPrices, setEditedPrices] = useState({});
  const [toast, setToast] = useState(null);

  const cardStyle = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 12 };

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const getCost = useCallback((sku, size) => {
    const match = purchases.find(p => 
      (p.sku || '').toLowerCase() === (sku || '').toLowerCase() &&
      (p.size || '').toString() === (size || '').toString() && !p.sold
    );
    return match?.cost ? parseFloat(match.cost) : null;
  }, [purchases]);

  const fetchStockX = useCallback(async () => {
    if (!stockxToken) return [];
    try {
      const res = await fetch('/api/stockx-listings', { headers: { 'Authorization': `Bearer ${stockxToken}` } });
      return res.ok ? (await res.json()).listings || [] : [];
    } catch { return []; }
  }, [stockxToken]);

  const fetchEbay = useCallback(async () => {
    if (!ebayToken) return [];
    try {
      const res = await fetch('/api/ebay-listings', { headers: { 'Authorization': `Bearer ${ebayToken}` } });
      return res.ok ? (await res.json()).listings || [] : [];
    } catch { return []; }
  }, [ebayToken]);

  const syncListings = useCallback(async () => {
    setSyncing(true);
    try {
      const [sx, eb] = await Promise.all([fetchStockX(), fetchEbay()]);
      setStockxListings(sx);
      setEbayListings(eb);
      localStorage.setItem('fl_stockx_listings', JSON.stringify(sx));
      localStorage.setItem('fl_ebay_listings', JSON.stringify(eb));
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay`);
    } catch { showToast('Sync failed', 'error'); }
    finally { setSyncing(false); }
  }, [fetchStockX, fetchEbay, showToast]);

  // Auto-sync on first load if no cached data
  useEffect(() => {
    if ((stockxToken || ebayToken) && stockxListings.length === 0) syncListings();
  }, []);

  const groupedProducts = useMemo(() => {
    const groups = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNKNOWN';
      if (!groups[sku]) groups[sku] = { sku, name: l.name, image: l.image, inventoryType: l.inventoryType, sizes: [] };
      groups[sku].sizes.push({ ...l, cost: getCost(sku, l.size) });
    });
    Object.values(groups).forEach(g => {
      g.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
      g.totalQty = g.sizes.length;
      g.notLowest = g.sizes.filter(s => s.lowestAsk && s.yourAsk > s.lowestAsk).length;
    });
    return Object.values(groups);
  }, [stockxListings, getCost]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return groupedProducts;
    const q = searchQuery.toLowerCase();
    return groupedProducts.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [groupedProducts, searchQuery]);

  const crosslistProducts = useMemo(() => {
    const ebaySKUs = new Set(ebayListings.map(e => (e.sku || e.mpn || '').toLowerCase()));
    return groupedProducts.filter(p => !ebaySKUs.has(p.sku.toLowerCase()));
  }, [groupedProducts, ebayListings]);

  const currentProduct = useMemo(() => groupedProducts.find(p => p.sku === selectedProduct), [groupedProducts, selectedProduct]);

  useEffect(() => { 
    if (filteredProducts.length > 0 && !selectedProduct) setSelectedProduct(filteredProducts[0].sku); 
  }, [filteredProducts]);

  const handleSelectAll = () => {
    if (!currentProduct) return;
    setSelectedSizes(selectedSizes.size === currentProduct.sizes.length ? new Set() : new Set(currentProduct.sizes.map(s => s.listingId)));
  };

  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices).map(([id, amt]) => ({ listingId: id, amount: Math.round(parseFloat(amt)) })).filter(u => u.amount > 0);
    if (!updates.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stockx-listings', { method: 'PATCH', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: updates }) });
      if (res.ok) { showToast(`Updated ${updates.length} listings`); setEditedPrices({}); await syncListings(); }
      else showToast('Update failed', 'error');
    } catch { showToast('Update failed', 'error'); }
    finally { setLoading(false); }
  };

  const handleUnlist = async () => {
    if (!selectedSizes.size) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stockx-listings', { method: 'DELETE', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: Array.from(selectedSizes) }) });
      if (res.ok) { showToast(`Unlisted ${selectedSizes.size} items`); setSelectedSizes(new Set()); await syncListings(); }
      else showToast('Unlist failed', 'error');
    } catch { showToast('Unlist failed', 'error'); }
    finally { setLoading(false); }
  };

  const totalCrosslist = crosslistProducts.reduce((s, p) => s + p.totalQty, 0);

  return (
    <>
      {/* TABS + SEARCH + SYNC - Single Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        {[
          { id: 'reprice', icon: '⚡', label: 'Reprice', count: stockxListings.length },
          { id: 'crosslist', icon: '🚀', label: 'Cross-list', count: totalCrosslist },
          { id: 'all', icon: '📦', label: 'All Listings', count: stockxListings.length + ebayListings.length }
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '12px 20px', background: subTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${subTab === t.id ? 'rgba(255,255,255,0.2)' : c.border}`, borderRadius: 10, color: c.text, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {t.icon} {t.label} <span style={{ color: c.gold, marginLeft: 6 }}>{t.count}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input type="text" placeholder="Search SKU or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: 200, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14 }} />
        <button onClick={syncListings} disabled={syncing} style={{ padding: '12px 24px', background: c.green, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          🔄 {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {/* REPRICE TAB */}
      {subTab === 'reprice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          {/* Products List */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, fontSize: 12, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
                <div key={p.sku} onClick={() => { setSelectedProduct(p.sku); setSelectedSizes(new Set()); }} style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === p.sku ? `4px solid ${c.gold}` : '4px solid transparent', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {p.image ? <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>👟</span>}
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
              {filteredProducts.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'No listings'}</div>}
            </div>
          </div>

          {/* Product Detail */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {currentProduct ? (
              <>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {currentProduct.image ? <img src={currentProduct.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>👟</span>}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{currentProduct.name}</h3>
                    <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
                      {currentProduct.sku}
                      {currentProduct.inventoryType === 'DIRECT' && <span style={{ marginLeft: 10, background: '#f97316', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>🚀 Direct</span>}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px 24px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: c.textMuted }}>
                    <input type="checkbox" checked={currentProduct.sizes.length > 0 && selectedSizes.size === currentProduct.sizes.length} onChange={handleSelectAll} style={{ width: 16, height: 16, accentColor: c.green }} />
                    Select all
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '40px 70px 60px 100px 100px 100px auto', padding: '12px 24px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 10, fontWeight: 700, color: c.textMuted }}>
                  <span></span>
                  <span>SIZE</span>
                  <span style={{ textAlign: 'center' }}>QTY</span>
                  <span style={{ textAlign: 'center' }}>YOUR ASK</span>
                  <span style={{ textAlign: 'center' }}>LOWEST ASK</span>
                  <span style={{ textAlign: 'center' }}>SELL FASTER</span>
                  <span style={{ textAlign: 'right' }}>COST</span>
                </div>

                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {currentProduct.sizes.map(item => {
                    const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                    const isEdited = editedPrices[item.listingId] !== undefined;
                    const sameSize = currentProduct.sizes.filter(s => s.size === item.size).length;
                    return (
                      <div key={item.listingId} style={{ display: 'grid', gridTemplateColumns: '40px 70px 60px 100px 100px 100px auto', padding: '14px 24px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked={selectedSizes.has(item.listingId)} onChange={e => { const n = new Set(selectedSizes); e.target.checked ? n.add(item.listingId) : n.delete(item.listingId); setSelectedSizes(n); }} style={{ width: 16, height: 16, accentColor: c.green }} />
                        <span style={{ fontWeight: 600 }}>{item.size}</span>
                        <span style={{ textAlign: 'center' }}>{sameSize > 1 ? <span style={{ background: c.gold, color: '#000', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>x{sameSize}</span> : '1'}</span>
                        <div style={{ textAlign: 'center' }}>
                          <input type="number" value={editedPrices[item.listingId] ?? item.yourAsk} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} style={{ width: 70, padding: '8px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, fontSize: 13, textAlign: 'center' }} />
                        </div>
                        <div style={{ textAlign: 'center', color: isLowest ? c.green : c.text, fontWeight: 600 }}>
                          ${item.lowestAsk || '—'}{isLowest && <span style={{ marginLeft: 4 }}>✓</span>}
                        </div>
                        <span style={{ textAlign: 'center', color: '#f97316', fontWeight: 600 }}>${item.sellFaster || item.highestBid || '—'}</span>
                        <span style={{ textAlign: 'right', color: c.textMuted }}>{item.cost ? `$${item.cost}` : '—'}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '16px 24px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 12 }}>
                  <button onClick={handleUpdatePrices} disabled={!Object.keys(editedPrices).length || loading} style={{ padding: '12px 28px', background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed' }}>
                    Update Prices
                  </button>
                  <button onClick={handleUnlist} disabled={!selectedSizes.size || loading} style={{ padding: '12px 28px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14, fontWeight: 600, cursor: selectedSizes.size ? 'pointer' : 'not-allowed' }}>
                    Unlist Selected
                  </button>
                </div>
              </>
            ) : <div style={{ padding: 80, textAlign: 'center', color: c.textMuted, fontSize: 15 }}>Select a product</div>}
          </div>
        </div>
      )}

      {subTab === 'crosslist' && (
        <div style={{ ...cardStyle, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <h3 style={{ margin: '0 0 8px' }}>Cross-list to eBay</h3>
          <p style={{ color: c.textMuted }}>{crosslistProducts.length} products not on eBay</p>
        </div>
      )}

      {subTab === 'all' && (
        <div style={{ ...cardStyle, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h3 style={{ margin: '0 0 8px' }}>All Listings</h3>
          <p style={{ color: c.textMuted }}>{stockxListings.length} StockX + {ebayListings.length} eBay</p>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50)', padding: '12px 24px', borderRadius: 10, background: c.card, border: `1px solid ${toast.type === 'error' ? c.red : c.green}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999 }}>
          <span style={{ color: toast.type === 'error' ? c.red : c.green, fontWeight: 600 }}>{toast.type === 'error' ? '❌' : '✓'} {toast.msg}</span>
        </div>
      )}
    </>
  );
}
