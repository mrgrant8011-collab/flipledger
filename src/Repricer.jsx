import React, { useState, useMemo, useEffect, useCallback } from 'react';

/**
 * REPRICER - StockX Only
 * - Fetch StockX listings with market data
 * - Display cost/profit from inventory
 * - Update StockX prices
 * - NO eBay logic
 */
export default function Repricer({ stockxToken, purchases = [], c }) {
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_repricer_sx') || '[]'); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editedPrices, setEditedPrices] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ============================================
  // COST MATCHING - from inventory
  // ============================================
  const getCost = useCallback((sku, size) => {
    if (!purchases?.length) return null;
    
    const normSku = (s) => String(s || '').toLowerCase().replace(/[-\s]/g, '');
    const normSize = (s) => String(s || '').toLowerCase().replace(/[^0-9.]/g, '');
    
    // FIFO: first unsold match
    const match = purchases.find(p => {
      if (p.sold) return false;
      const pSku = normSku(p.sku || p.styleId);
      const lSku = normSku(sku);
      if (!pSku || !lSku) return false;
      const skuMatch = pSku === lSku || pSku.includes(lSku) || lSku.includes(pSku);
      if (!skuMatch) return false;
      if (size && p.size) {
        return normSize(p.size) === normSize(size);
      }
      return true;
    });
    
    return match ? parseFloat(match.cost) || null : null;
  }, [purchases]);

  // ============================================
  // SYNC STOCKX WITH MARKET DATA
  // ============================================
  const syncStockX = async () => {
    if (syncing || !stockxToken) return;
    setSyncing(true);
    
    try {
      // Fetch WITH market data (no skipMarketData param)
      const res = await fetch('/api/stockx-listings', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      
      if (!res.ok) {
        showToast(`Sync failed: ${res.status}`, 'error');
        setSyncing(false);
        return;
      }
      
      const data = await res.json();
      const listings = data.listings || [];
      
      console.log('[Repricer] Synced', listings.length, 'listings');
      
      setStockxListings(listings);
      localStorage.setItem('fl_repricer_sx', JSON.stringify(listings));
      showToast(`Synced ${listings.length} StockX listings`);
      
    } catch (e) {
      console.error('[Repricer] Sync error:', e);
      showToast('Sync failed', 'error');
    }
    
    setSyncing(false);
  };

  // ============================================
  // GROUPED PRODUCTS
  // ============================================
  const groupedProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNKNOWN';
      if (!g[sku]) {
        g[sku] = {
          sku,
          name: l.name || 'Unknown Product',
          productId: l.productId,
          image: l.image,
          sizes: []
        };
      }
      const cost = getCost(sku, l.size);
      const payout = l.yourAsk ? l.yourAsk * 0.88 : 0; // ~12% StockX fees
      const estProfit = cost ? Math.round(payout - cost) : null;
      g[sku].sizes.push({ ...l, cost, estProfit });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size)),
      notLowest: p.sizes.filter(s => s.lowestAsk && s.yourAsk > s.lowestAsk).length
    }));
  }, [stockxListings, getCost]);

  // ============================================
  // FILTERED PRODUCTS
  // ============================================
  const filteredProducts = useMemo(() => {
    let products = [...groupedProducts];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p =>
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q)
      );
    }
    
    return products;
  }, [groupedProducts, searchQuery]);

  // Current product from filtered list
  const currentProduct = filteredProducts.find(p => p.sku === selectedProduct);

  // Clear selection if filtered out
  useEffect(() => {
    if (selectedProduct && !filteredProducts.some(p => p.sku === selectedProduct)) {
      setSelectedProduct(null);
    }
  }, [filteredProducts, selectedProduct]);

  // ============================================
  // UPDATE STOCKX PRICES
  // ============================================
  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices)
      .map(([id, amount]) => ({ listingId: id, amount: Math.round(parseFloat(amount)) }))
      .filter(x => x.amount > 0);
    
    if (!updates.length) return;
    setUpdating(true);
    
    try {
      const res = await fetch('/api/stockx-listings', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates })
      });
      
      if (res.ok) {
        showToast(`Updated ${updates.length} prices`);
        setEditedPrices({});
        // Refresh data
        await syncStockX();
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) {
      showToast('Update failed', 'error');
    }
    
    setUpdating(false);
  };

  // ============================================
  // RENDER
  // ============================================
  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  return (
    <div style={{ width: '100%' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000 }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Repricer</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>StockX price management</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search SKU or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 200 }}
          />
          <button
            onClick={syncStockX}
            disabled={syncing}
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL LISTINGS</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{stockxListings.length}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>PRODUCTS</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{groupedProducts.length}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>NEED REPRICE</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: c.red }}>
            {groupedProducts.reduce((sum, p) => sum + p.notLowest, 0)}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        
        {/* Products List */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
            PRODUCTS ({filteredProducts.length})
          </div>
          <div style={{ maxHeight: 550, overflowY: 'auto' }}>
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
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.image ? (
                    <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} />
                  ) : '👟'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{p.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>x{p.totalQty}</div>
                  {p.notLowest > 0 && <div style={{ fontSize: 10, color: c.red }}>{p.notLowest} ↓</div>}
                </div>
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
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {currentProduct.image ? (
                    <img src={currentProduct.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} />
                  ) : '👟'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{currentProduct.name}</h3>
                  <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                    {currentProduct.sku} • {currentProduct.totalQty} listings
                    {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && (
                      <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>Direct</span>
                    )}
                    {currentProduct.sizes[0]?.inventoryType === 'FLEX' && (
                      <span style={{ marginLeft: 8, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>Flex</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Table Header */}
              <div style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                <span style={{ width: 70 }}>SIZE</span>
                <span style={{ width: 80 }}>YOUR ASK</span>
                <span style={{ width: 70 }}>LOWEST</span>
                <span style={{ width: 60 }}>BID</span>
                <span style={{ width: 80 }}>SELL FAST</span>
                <span style={{ width: 60 }}>COST</span>
                <span style={{ width: 70 }}>PROFIT</span>
              </div>

              {/* Table Body */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
                {currentProduct.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const currentPrice = parseFloat(editedPrices[item.listingId] ?? item.yourAsk) || 0;
                  const badge = item.inventoryType === 'DIRECT' ? { l: 'D', bg: '#f97316' }
                              : item.inventoryType === 'FLEX' ? { l: 'F', bg: '#8b5cf6' }
                              : { l: 'S', bg: '#6b7280' };
                  
                  // Recalculate profit with edited price
                  const payout = currentPrice * 0.88;
                  const displayProfit = item.cost ? Math.round(payout - item.cost) : null;

                  return (
                    <div key={item.listingId} style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ width: 70, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {item.size}
                        <span style={{ background: badge.bg, color: '#fff', fontSize: 9, padding: '2px 4px', borderRadius: 3 }}>{badge.l}</span>
                      </span>
                      <span style={{ width: 80 }}>
                        <input
                          type="number"
                          value={editedPrices[item.listingId] ?? item.yourAsk}
                          onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })}
                          style={{
                            width: 60,
                            padding: '5px',
                            background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isEdited ? c.gold : c.border}`,
                            borderRadius: 6,
                            color: c.text,
                            textAlign: 'center'
                          }}
                        />
                      </span>
                      <span style={{ width: 70 }}>
                        {item.lowestAsk ? (
                          item.yourAsk <= item.lowestAsk
                            ? <span style={{ color: c.green, fontWeight: 700, fontSize: 11 }}>✓ YOU</span>
                            : <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.lowestAsk - 1 })} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', fontWeight: 600 }}>${item.lowestAsk}</button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 60 }}>
                        {item.highestBid ? (
                          <button
                            onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })}
                            style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 4, padding: '3px 6px', color: c.green, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                          >
                            ${item.highestBid}
                          </button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 80 }}>
                        {item.sellFaster ? (
                          <button
                            onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })}
                            style={{ background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 4, padding: '3px 6px', color: '#f97316', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                          >
                            ${item.sellFaster}
                          </button>
                        ) : '—'}
                      </span>
                      <span style={{ width: 60, color: c.textMuted, fontSize: 12 }}>
                        {item.cost ? `$${item.cost.toFixed(0)}` : '—'}
                      </span>
                      <span style={{ width: 70, fontWeight: 600, fontSize: 12, color: displayProfit > 0 ? c.green : displayProfit < 0 ? c.red : c.textMuted }}>
                        {displayProfit !== null ? `$${displayProfit}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                {Object.keys(editedPrices).length > 0 && (
                  <span style={{ fontSize: 12, color: c.textMuted }}>{Object.keys(editedPrices).length} changed</span>
                )}
                <button
                  onClick={() => {
                    // Apply sell faster to all
                    const newPrices = { ...editedPrices };
                    currentProduct.sizes.forEach(s => {
                      if (s.sellFaster) newPrices[s.listingId] = s.sellFaster;
                    });
                    setEditedPrices(newPrices);
                  }}
                  style={{ padding: '8px 12px', background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 6, color: '#f97316', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                >
                  Apply All Sell Fast
                </button>
                <button
                  onClick={handleUpdatePrices}
                  disabled={!Object.keys(editedPrices).length || updating}
                  style={{
                    padding: '10px 24px',
                    background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontWeight: 700,
                    cursor: Object.keys(editedPrices).length && !updating ? 'pointer' : 'not-allowed',
                    marginLeft: 'auto'
                  }}
                >
                  {updating ? 'Updating...' : 'Update Prices'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted, padding: 40, textAlign: 'center' }}>
              {stockxListings.length === 0
                ? 'Click Sync to load your StockX listings'
                : 'Select a product from the list'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
