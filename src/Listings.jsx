import React, { useState, useEffect, useCallback, useMemo } from 'react';

export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [subTab, setSubTab] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_sx') || '[]'); } catch { return []; }
  });
  const [ebayListings, setEbayListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_eb') || '[]'); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [editedPrices, setEditedPrices] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Get cost from purchases
  const getCost = useCallback((sku, size) => {
    if (!purchases.length) return null;
    const normSku = (s) => String(s || '').toLowerCase().replace(/[-\s]/g, '');
    const normSize = (s) => String(s || '').toLowerCase().replace(/[^0-9.]/g, '');
    const match = purchases.find(p => {
      const pSku = normSku(p.sku || p.styleId);
      const lSku = normSku(sku);
      if (!pSku || !lSku) return false;
      if (pSku !== lSku && !pSku.includes(lSku) && !lSku.includes(pSku)) return false;
      if (size && p.size) return normSize(p.size) === normSize(size);
      return true;
    });
    return match ? parseFloat(match.cost) || null : null;
  }, [purchases]);

  const syncListings = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      console.log('[Sync] Starting...');
      
      if (stockxToken) {
        const res = await fetch('/api/stockx-listings?skipMarketData=true', { 
          headers: { 'Authorization': `Bearer ${stockxToken}` } 
        });
        if (res.ok) {
          const data = await res.json();
          const listings = data.listings || [];
          console.log('[Sync] Got', listings.length, 'StockX listings');
          setStockxListings(listings);
          localStorage.setItem('fl_sx', JSON.stringify(listings));
          showToast(`Synced ${listings.length} StockX listings`);
        } else {
          console.error('[Sync] Failed:', res.status);
          showToast('Sync failed', 'error');
        }
      }
    } catch (e) { 
      console.error('[Sync] Error:', e);
      showToast('Sync failed', 'error'); 
    }
    setSyncing(false);
  };

  // Group listings by SKU
  const groupedProducts = useMemo(() => {
    console.log('[Group] Processing', stockxListings.length, 'listings');
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNKNOWN';
      if (!g[sku]) {
        g[sku] = { 
          sku, 
          name: l.name, 
          image: l.image, 
          productId: l.productId, 
          sizes: [] 
        };
      }
      g[sku].sizes.push({ ...l, cost: getCost(sku, l.size) });
    });
    
    const products = Object.values(g);
    products.forEach(p => {
      p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
      p.totalQty = p.sizes.length;
      p.notLowest = p.sizes.filter(s => s.lowestAsk && s.yourAsk > s.lowestAsk).length;
    });
    
    console.log('[Group] Created', products.length, 'products');
    return products;
  }, [stockxListings, getCost]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let products = [...groupedProducts];
    
    if (subTab === 'reprice') {
      products = products.filter(p => p.notLowest > 0);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p => 
        p.name?.toLowerCase().includes(q) || 
        p.sku?.toLowerCase().includes(q)
      );
    }
    
    console.log('[Filter] Showing', products.length, 'products for tab:', subTab);
    return products;
  }, [groupedProducts, searchQuery, subTab]);

  // Current selected product
  const currentProduct = useMemo(() => {
    return groupedProducts.find(p => p.sku === selectedProduct);
  }, [groupedProducts, selectedProduct]);

  // Auto-select first product
  useEffect(() => {
    if (filteredProducts.length > 0 && !selectedProduct) {
      setSelectedProduct(filteredProducts[0].sku);
    }
  }, [filteredProducts, selectedProduct]);

  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices)
      .map(([id, amount]) => ({ listingId: id, amount: Math.round(parseFloat(amount)) }))
      .filter(x => x.amount > 0);
    
    if (!updates.length) return;
    setLoading(true);
    
    try {
      const res = await fetch('/api/stockx-listings', { 
        method: 'PATCH', 
        headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ items: updates }) 
      });
      
      if (res.ok) { 
        showToast(`Updated ${updates.length} prices`); 
        setEditedPrices({});
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) { 
      showToast('Update failed', 'error'); 
    }
    setLoading(false);
  };

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  return (
    <div style={{ padding: 0, width: '100%' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000 }}>
          {toast.msg}
        </div>
      )}
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Listings</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Search SKU or name..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 200 }} 
          />
          <button 
            onClick={syncListings} 
            disabled={syncing} 
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button 
          onClick={() => setSubTab('all')} 
          style={{ padding: '10px 16px', background: subTab === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${subTab === 'all' ? c.gold : c.border}`, borderRadius: 8, color: subTab === 'all' ? c.gold : c.textMuted, fontWeight: 600, cursor: 'pointer' }}
        >
          📦 All Listings <span style={{ opacity: 0.7 }}>{stockxListings.length}</span>
        </button>
        <button 
          onClick={() => setSubTab('reprice')} 
          style={{ padding: '10px 16px', background: subTab === 'reprice' ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${subTab === 'reprice' ? c.gold : c.border}`, borderRadius: 8, color: subTab === 'reprice' ? c.gold : c.textMuted, fontWeight: 600, cursor: 'pointer' }}
        >
          ⚡ Reprice <span style={{ opacity: 0.7 }}>{stockxListings.filter(l => l.lowestAsk && l.yourAsk > l.lowestAsk).length}</span>
        </button>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        
        {/* Products List */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
            PRODUCTS ({filteredProducts.length})
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filteredProducts.map(p => (
              <div 
                key={p.sku} 
                onClick={() => { setSelectedProduct(p.sku); setSelectedSizes(new Set()); setEditedPrices({}); }} 
                style={{ 
                  padding: '10px 14px', 
                  borderBottom: `1px solid ${c.border}`, 
                  cursor: 'pointer', 
                  background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', 
                  borderLeft: selectedProduct === p.sku ? `3px solid ${c.gold}` : '3px solid transparent',
                  display: 'flex', 
                  gap: 10, 
                  alignItems: 'center' 
                }}
              >
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👟</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{p.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>x{p.totalQty}</div>
                  {p.notLowest > 0 && <div style={{ fontSize: 10, color: c.red }}>{p.notLowest} ↓</div>}
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
                {syncing ? 'Loading...' : stockxListings.length === 0 ? 'Click Sync to load listings' : 'No products found'}
              </div>
            )}
          </div>
        </div>

        {/* Product Detail */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {currentProduct ? (
            <>
              {/* Header */}
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>👟</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{currentProduct.name}</h3>
                  <div style={{ fontSize: 12, color: c.textMuted }}>
                    {currentProduct.sku}
                    {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && (
                      <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🚀 Direct</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Table Header */}
              <div style={{ display: 'flex', padding: '12px 16px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                <span style={{ width: 32 }}></span>
                <span style={{ width: 70 }}>SIZE</span>
                <span style={{ width: 80 }}>YOUR ASK</span>
                <span style={{ width: 80 }}>LOWEST</span>
                <span style={{ width: 80 }}>BID</span>
                <span style={{ width: 90 }}>SELL FASTER</span>
                <span style={{ width: 70 }}>COST</span>
                <span style={{ width: 70 }}>PROFIT</span>
              </div>

              {/* Table Body */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400 }}>
                {currentProduct.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const currentPrice = parseFloat(editedPrices[item.listingId] ?? item.yourAsk) || 0;
                  const channel = item.inventoryType || 'STANDARD';
                  const badge = channel === 'DIRECT' ? { l: 'D', bg: '#f97316' } : channel === 'FLEX' ? { l: 'F', bg: '#8b5cf6' } : { l: 'S', bg: '#6b7280' };
                  const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                  const payout = currentPrice * 0.85;
                  const profit = item.cost ? Math.round(payout - item.cost) : null;

                  return (
                    <div key={item.listingId} style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ width: 32 }}>
                        <input 
                          type="checkbox" 
                          checked={selectedSizes.has(item.listingId)} 
                          onChange={e => {
                            const n = new Set(selectedSizes);
                            e.target.checked ? n.add(item.listingId) : n.delete(item.listingId);
                            setSelectedSizes(n);
                          }} 
                        />
                      </span>
                      <span style={{ width: 70, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {item.size}
                        <span style={{ background: badge.bg, color: '#fff', fontSize: 9, padding: '2px 4px', borderRadius: 3 }}>{badge.l}</span>
                      </span>
                      <span style={{ width: 80 }}>
                        <input 
                          type="number" 
                          value={editedPrices[item.listingId] ?? item.yourAsk} 
                          onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} 
                          style={{ width: 60, padding: '5px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, textAlign: 'center' }} 
                        />
                      </span>
                      <span style={{ width: 80 }}>
                        {item.lowestAsk ? (
                          isLowest ? (
                            <span style={{ background: 'rgba(34,197,94,0.15)', padding: '4px 8px', borderRadius: 4, color: c.green, fontWeight: 700, fontSize: 11 }}>✓ YOU</span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>${item.lowestAsk}</span>
                          )
                        ) : <span style={{ color: c.textMuted }}>—</span>}
                      </span>
                      <span style={{ width: 80 }}>
                        {item.highestBid ? (
                          <button 
                            onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} 
                            style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 4, padding: '4px 8px', color: c.green, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                          >
                            ${item.highestBid}
                          </button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 90 }}>
                        {item.sellFaster ? (
                          <button 
                            onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} 
                            style={{ background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 4, padding: '4px 8px', color: '#f97316', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                          >
                            ${item.sellFaster}
                          </button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 70, color: c.textMuted }}>{item.cost ? `$${item.cost.toFixed(0)}` : '—'}</span>
                      <span style={{ width: 70, color: profit > 0 ? c.green : profit < 0 ? c.red : c.textMuted, fontWeight: 600 }}>
                        {profit !== null ? `$${profit}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                {selectedSizes.size > 0 && (
                  <span style={{ fontSize: 12, color: c.textMuted }}>{selectedSizes.size} selected</span>
                )}
                <button 
                  onClick={handleUpdatePrices} 
                  disabled={!Object.keys(editedPrices).length || loading} 
                  style={{ 
                    padding: '10px 20px', 
                    background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', 
                    border: 'none', 
                    borderRadius: 8, 
                    color: '#fff', 
                    fontWeight: 700, 
                    cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed',
                    marginLeft: 'auto'
                  }}
                >
                  {loading ? 'Updating...' : 'Update Prices'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted }}>
              {stockxListings.length === 0 ? 'Click Sync to load your StockX listings' : 'Select a product'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
