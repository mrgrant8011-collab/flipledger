import React, { useState, useMemo } from 'react';

export default function Listings({ stockxToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  // Initialize from localStorage
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_sx') || '[]'); } catch { return []; }
  });
  const [syncing, setSyncing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editedPrices, setEditedPrices] = useState({});
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const showToast = (msg, type = 'success') => { 
    setToast({ msg, type }); 
    setTimeout(() => setToast(null), 3000); 
  };

  // SYNC - Simple, just StockX
  const syncListings = async () => {
    if (syncing || !stockxToken) return;
    setSyncing(true);
    
    try {
      const res = await fetch('/api/stockx-listings?skipMarketData=true', { 
        headers: { 'Authorization': `Bearer ${stockxToken}` } 
      });
      
      if (!res.ok) {
        showToast('Sync failed: ' + res.status, 'error');
        setSyncing(false);
        return;
      }
      
      const data = await res.json();
      const listings = data.listings || [];
      
      console.log('[Sync] Success:', listings.length, 'listings');
      
      // Save to state and localStorage
      setStockxListings(listings);
      localStorage.setItem('fl_sx', JSON.stringify(listings));
      showToast(`Synced ${listings.length} listings`);
      
    } catch (e) {
      console.error('[Sync] Error:', e);
      showToast('Sync failed', 'error');
    }
    
    setSyncing(false);
  };

  // Group by SKU
  const groupedProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNKNOWN';
      if (!g[sku]) g[sku] = { sku, name: l.name, productId: l.productId, sizes: [] };
      g[sku].sizes.push(l);
    });
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [stockxListings]);

  // Filter
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return groupedProducts;
    const q = searchQuery.toLowerCase();
    return groupedProducts.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [groupedProducts, searchQuery]);

  // Current product
  const currentProduct = groupedProducts.find(p => p.sku === selectedProduct);

  // Update prices
  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices)
      .map(([id, amount]) => ({ listingId: id, amount: Math.round(parseFloat(amount)) }))
      .filter(x => x.amount > 0);
    
    if (!updates.length) return;
    
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
  };

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  return (
    <div style={{ padding: 0, width: '100%' }}>
      {toast && <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000 }}>{toast.msg}</div>}
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Listings</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 180 }} />
          <button onClick={syncListings} disabled={syncing} style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 14 }}>
        📦 <strong>{stockxListings.length}</strong> total listings across <strong>{groupedProducts.length}</strong> products
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        
        {/* Products List */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
            PRODUCTS ({filteredProducts.length})
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filteredProducts.map(p => (
              <div 
                key={p.sku} 
                onClick={() => { setSelectedProduct(p.sku); setEditedPrices({}); }} 
                style={{ 
                  padding: '12px 14px', 
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
                <div style={{ fontSize: 13, fontWeight: 700 }}>x{p.totalQty}</div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
                {stockxListings.length === 0 ? 'Click Sync to load listings' : 'No products match search'}
              </div>
            )}
          </div>
        </div>

        {/* Product Detail */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {currentProduct ? (
            <>
              {/* Header */}
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}` }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{currentProduct.name}</h3>
                <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                  {currentProduct.sku} • {currentProduct.totalQty} listings
                  {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>Direct</span>}
                  {currentProduct.sizes[0]?.inventoryType === 'FLEX' && <span style={{ marginLeft: 8, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>Flex</span>}
                </div>
              </div>

              {/* Table */}
              <div style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                <span style={{ width: 80 }}>SIZE</span>
                <span style={{ width: 100 }}>YOUR ASK</span>
                <span style={{ width: 80 }}>LOWEST</span>
                <span style={{ width: 80 }}>BID</span>
                <span style={{ width: 100 }}>SELL FASTER</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400 }}>
                {currentProduct.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const badge = item.inventoryType === 'DIRECT' ? { l: 'D', bg: '#f97316' } : item.inventoryType === 'FLEX' ? { l: 'F', bg: '#8b5cf6' } : { l: 'S', bg: '#6b7280' };

                  return (
                    <div key={item.listingId} style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ width: 80, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.size}
                        <span style={{ background: badge.bg, color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 3 }}>{badge.l}</span>
                      </span>
                      <span style={{ width: 100 }}>
                        <input 
                          type="number" 
                          value={editedPrices[item.listingId] ?? item.yourAsk} 
                          onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} 
                          style={{ width: 70, padding: '6px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, textAlign: 'center' }} 
                        />
                      </span>
                      <span style={{ width: 80 }}>
                        {item.lowestAsk ? (
                          item.yourAsk <= item.lowestAsk 
                            ? <span style={{ color: c.green, fontWeight: 700 }}>✓ YOU</span>
                            : <span>${item.lowestAsk}</span>
                        ) : '—'}
                      </span>
                      <span style={{ width: 80 }}>
                        {item.highestBid ? (
                          <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 4, padding: '4px 8px', color: c.green, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>${item.highestBid}</button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 100 }}>
                        {item.sellFaster ? (
                          <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} style={{ background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 4, padding: '4px 8px', color: '#f97316', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>${item.sellFaster}</button>
                        ) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Update Button */}
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}` }}>
                <button 
                  onClick={handleUpdatePrices} 
                  disabled={!Object.keys(editedPrices).length} 
                  style={{ 
                    padding: '10px 24px', 
                    background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', 
                    border: 'none', 
                    borderRadius: 8, 
                    color: '#fff', 
                    fontWeight: 700, 
                    cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed'
                  }}
                >
                  Update Prices
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted, padding: 40, textAlign: 'center' }}>
              {stockxListings.length === 0 ? 'Click Sync to load your StockX listings' : 'Select a product from the list'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
