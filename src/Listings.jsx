/**
 * FLIPLEDGER LISTINGS TAB - EXACT MOCKUP MATCH
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
  
  const [stockxListings, setStockxListings] = useState([]);
  const [ebayListings, setEbayListings] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [editedPrices, setEditedPrices] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const getCost = useCallback((sku, size) => {
    if (!purchases || purchases.length === 0) return null;
    const match = purchases.find(p => 
      (p.sku || '').toLowerCase() === (sku || '').toLowerCase() &&
      (p.size || '').toString() === (size || '').toString() &&
      !p.sold
    );
    return match ? parseFloat(match.cost) || null : null;
  }, [purchases]);

  const fetchStockXListings = useCallback(async () => {
    if (!stockxToken) return [];
    try {
      const res = await fetch('/api/stockx-listings', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return data.listings || [];
    } catch (e) {
      console.error('[StockX] Fetch error:', e.message);
      return [];
    }
  }, [stockxToken]);

  const fetchEbayListings = useCallback(async () => {
    if (!ebayToken) return [];
    try {
      const res = await fetch('/api/ebay-listings', {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return data.listings || [];
    } catch (e) {
      console.error('[eBay] Fetch error:', e.message);
      return [];
    }
  }, [ebayToken]);

  const syncListings = useCallback(async () => {
    setSyncing(true);
    try {
      const [stockx, ebay] = await Promise.all([fetchStockXListings(), fetchEbayListings()]);
      setStockxListings(stockx);
      setEbayListings(ebay);
      showToast(`Synced ${stockx.length} StockX + ${ebay.length} eBay listings`);
    } catch (e) {
      showToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }, [fetchStockXListings, fetchEbayListings, showToast]);

  useEffect(() => {
    if (stockxToken || ebayToken) syncListings();
  }, []);

  const groupedProducts = useMemo(() => {
    const groups = {};
    stockxListings.forEach(listing => {
      const sku = listing.sku || 'UNKNOWN';
      if (!groups[sku]) {
        groups[sku] = { sku, name: listing.name, image: listing.image, inventoryType: listing.inventoryType, sizes: [] };
      }
      groups[sku].sizes.push({ ...listing, cost: getCost(sku, listing.size) });
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
  }, [filteredProducts, selectedProduct]);

  const handleSelectAll = () => {
    if (!currentProduct) return;
    setSelectedSizes(selectedSizes.size === currentProduct.sizes.length ? new Set() : new Set(currentProduct.sizes.map(s => s.listingId)));
  };

  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices).map(([listingId, amount]) => ({ listingId, amount: Math.round(parseFloat(amount)) })).filter(u => u.amount > 0);
    if (updates.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stockx-listings', { method: 'PATCH', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: updates }) });
      if (res.ok) { showToast(`Updated ${updates.length} listings`); setEditedPrices({}); await syncListings(); }
      else showToast('Update failed', 'error');
    } catch (e) { showToast('Update failed', 'error'); }
    finally { setLoading(false); }
  };

  const handleUnlistSelected = async () => {
    if (selectedSizes.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stockx-listings', { method: 'DELETE', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: Array.from(selectedSizes) }) });
      if (res.ok) { showToast(`Unlisted ${selectedSizes.size} items`); setSelectedSizes(new Set()); await syncListings(); }
      else showToast('Unlist failed', 'error');
    } catch (e) { showToast('Unlist failed', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {/* HEADER ROW */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Listings</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input type="text" placeholder="Search SKU or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: 240, padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14 }} />
          <button onClick={syncListings} disabled={syncing} style={{ padding: '12px 24px', background: c.green, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔄 {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {[
          { id: 'reprice', icon: '⚡', label: 'Reprice', count: stockxListings.length },
          { id: 'crosslist', icon: '🚀', label: 'Cross-list', count: crosslistProducts.reduce((sum, p) => sum + p.totalQty, 0) },
          { id: 'all', icon: '📦', label: 'All Listings', count: stockxListings.length + ebayListings.length }
        ].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{ padding: '14px 28px', background: subTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${subTab === tab.id ? 'rgba(255,255,255,0.2)' : c.border}`, borderRadius: 12, color: c.text, fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{tab.icon}</span> {tab.label} <span style={{ color: c.gold, fontWeight: 800 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* MAIN CONTENT - MASTER DETAIL */}
      {subTab === 'reprice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
          {/* LEFT: PRODUCTS LIST */}
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, fontWeight: 700, fontSize: 12, color: c.textMuted, letterSpacing: 1 }}>
              PRODUCTS ({filteredProducts.length})
            </div>
            <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
              {filteredProducts.length > 0 ? filteredProducts.map(product => (
                <div key={product.sku} onClick={() => { setSelectedProduct(product.sku); setSelectedSizes(new Set()); }} style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === product.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === product.sku ? `4px solid ${c.gold}` : '4px solid transparent', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, overflow: 'hidden', flexShrink: 0 }}>
                    {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{product.sku}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Qty: {product.totalQty}</div>
                    {product.notLowest > 0 && <div style={{ fontSize: 11, color: c.red, marginTop: 2 }}>{product.notLowest} not lowest</div>}
                  </div>
                </div>
              )) : (
                <div style={{ padding: 48, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'No StockX listings found'}</div>
              )}
            </div>
          </div>

          {/* RIGHT: PRODUCT DETAIL */}
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, overflow: 'hidden' }}>
            {currentProduct ? (
              <>
                {/* Product Header */}
                <div style={{ padding: '24px 28px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.05)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, overflow: 'hidden' }}>
                    {currentProduct.image ? <img src={currentProduct.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{currentProduct.name}</h2>
                    <div style={{ fontSize: 14, color: c.textMuted, marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {currentProduct.sku}
                      {currentProduct.inventoryType === 'DIRECT' && <span style={{ background: '#f97316', color: '#fff', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🚀 Direct</span>}
                    </div>
                  </div>
                </div>

                {/* Select All */}
                <div style={{ padding: '14px 28px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={currentProduct.sizes.length > 0 && selectedSizes.size === currentProduct.sizes.length} onChange={handleSelectAll} style={{ width: 18, height: 18, accentColor: c.green }} />
                    <span style={{ fontSize: 14, color: c.textMuted }}>Select all</span>
                  </label>
                </div>

                {/* Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '44px 70px 70px 110px 110px 110px 100px', padding: '14px 28px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.03)', alignItems: 'center' }}>
                  <span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>SIZE</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>QTY</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>YOUR ASK</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>LOWEST ASK</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textAlign: 'center' }}>SELL FASTER</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
                </div>

                {/* Table Body */}
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {currentProduct.sizes.map(item => {
                    const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                    const isEdited = editedPrices[item.listingId] !== undefined;
                    const sameSizeCount = currentProduct.sizes.filter(s => s.size === item.size).length;
                    
                    return (
                      <div key={item.listingId} style={{ display: 'grid', gridTemplateColumns: '44px 70px 70px 110px 110px 110px 100px', padding: '16px 28px', borderBottom: `1px solid ${c.border}`, alignItems: 'center' }}>
                        <input type="checkbox" checked={selectedSizes.has(item.listingId)} onChange={e => { const n = new Set(selectedSizes); e.target.checked ? n.add(item.listingId) : n.delete(item.listingId); setSelectedSizes(n); }} style={{ width: 18, height: 18, accentColor: c.green }} />
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{item.size}</span>
                        <span style={{ textAlign: 'center' }}>{sameSizeCount > 1 ? <span style={{ background: c.gold, color: '#000', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>x{sameSizeCount}</span> : '1'}</span>
                        <div style={{ textAlign: 'center' }}>
                          <input type="number" value={editedPrices[item.listingId] ?? item.yourAsk} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} style={{ width: 80, padding: '8px 12px', background: isEdited ? 'rgba(201,169,98,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 8, color: c.text, fontSize: 14, textAlign: 'center', fontWeight: 600 }} />
                        </div>
                        <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span style={{ color: isLowest ? c.green : c.text, fontWeight: 600, fontSize: 14 }}>${item.lowestAsk || '—'}</span>
                          {isLowest && <span style={{ color: c.green, fontSize: 16 }}>✓</span>}
                        </div>
                        <span style={{ textAlign: 'center', color: '#f97316', fontWeight: 600, fontSize: 14 }}>${item.sellFaster || item.highestBid || '—'}</span>
                        <span style={{ textAlign: 'right', color: c.textMuted, fontSize: 14 }}>{item.cost ? `$${item.cost}` : '—'}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div style={{ padding: '20px 28px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 16 }}>
                  <button onClick={handleUpdatePrices} disabled={Object.keys(editedPrices).length === 0 || loading} style={{ padding: '14px 32px', background: Object.keys(editedPrices).length > 0 ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: Object.keys(editedPrices).length > 0 ? 'pointer' : 'not-allowed' }}>
                    Update Prices
                  </button>
                  <button onClick={handleUnlistSelected} disabled={selectedSizes.size === 0 || loading} style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 15, fontWeight: 600, cursor: selectedSizes.size > 0 ? 'pointer' : 'not-allowed' }}>
                    Unlist Selected
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: 80, textAlign: 'center', color: c.textMuted, fontSize: 16 }}>
                {syncing ? 'Loading...' : 'Select a product'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CROSS-LIST TAB */}
      {subTab === 'crosslist' && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🚀</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>Cross-list to eBay</h2>
          <p style={{ color: c.textMuted, fontSize: 16 }}>{crosslistProducts.length} products not yet on eBay</p>
        </div>
      )}

      {/* ALL LISTINGS TAB */}
      {subTab === 'all' && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>📦</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>All Listings</h2>
          <p style={{ color: c.textMuted, fontSize: 16 }}>{stockxListings.length} StockX + {ebayListings.length} eBay</p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', borderRadius: 12, background: c.card, border: `1px solid ${toast.type === 'error' ? c.red : c.green}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{toast.type === 'error' ? '❌' : '✓'}</span>
          <span style={{ color: toast.type === 'error' ? c.red : c.green, fontWeight: 600, fontSize: 14 }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
