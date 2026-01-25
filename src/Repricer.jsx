import React, { useState, useMemo, useCallback } from 'react';

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
  // SYNC StockX LISTINGS
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
  // GROUP BY PRODUCT
  // ============================================
  const groupedProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNKNOWN';
      if (!g[sku]) {
        g[sku] = {
          sku,
          name: l.name || 'Unknown Product',
          image: l.image,
          sizes: []
        };
      }
      const cost = getCost(sku, l.size);
      const estProfit = cost && l.yourAsk ? Math.round(l.yourAsk * 0.88 - cost) : null;
      g[sku].sizes.push({ ...l, cost, estProfit });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      needsReprice: p.sizes.filter(s => s.lowestAsk && s.yourAsk > s.lowestAsk).length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [stockxListings, getCost]);

  // ============================================
  // FILTERED PRODUCTS
  // ============================================
  const filteredProducts = useMemo(() => {
    let products = [...groupedProducts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p => p.sku?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q));
    }
    return products;
  }, [groupedProducts, searchQuery]);

  // Current product for detail panel
  const currentProduct = useMemo(() => {
    if (!selectedProduct) return filteredProducts[0] || null;
    return filteredProducts.find(p => p.sku === selectedProduct) || filteredProducts[0] || null;
  }, [selectedProduct, filteredProducts]);

  // Stats
  const stats = useMemo(() => {
    const total = stockxListings.length;
    const products = groupedProducts.length;
    const needsReprice = groupedProducts.reduce((sum, p) => sum + p.needsReprice, 0);
    return { total, products, needsReprice };
  }, [stockxListings, groupedProducts]);

  // ============================================
  // UPDATE PRICES
  // ============================================
  const handleUpdatePrices = async () => {
    const changes = Object.entries(editedPrices).filter(([id, price]) => {
      const listing = stockxListings.find(l => l.listingId === id);
      return listing && parseFloat(price) !== listing.yourAsk;
    });
    
    if (changes.length === 0) {
      showToast('No price changes', 'error');
      return;
    }
    
    setUpdating(true);
    
    try {
      const items = changes.map(([listingId, amount]) => ({ listingId, amount: parseFloat(amount) }));
      
      const res = await fetch('/api/stockx-listings', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      
      if (res.ok) {
        showToast(`Updated ${changes.length} prices`);
        setEditedPrices({});
        await syncStockX();
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) {
      console.error('[Repricer] Update error:', e);
      showToast('Update failed', 'error');
    }
    
    setUpdating(false);
  };

  // ============================================
  // RENDER
  // ============================================
  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };
  const changesCount = Object.keys(editedPrices).length;

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
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>Stay competitive on StockX</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input type="text" placeholder="Search SKU..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 160 }} />
          {changesCount > 0 && (
            <button onClick={handleUpdatePrices} disabled={updating}
              style={{ padding: '10px 20px', background: c.gold, border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer' }}>
              {updating ? '⏳' : `💾 Save ${changesCount} Changes`}
            </button>
          )}
          <button onClick={syncStockX} disabled={syncing}
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL LISTINGS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>PRODUCTS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.products}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>NEED REPRICE</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.needsReprice > 0 ? c.gold : c.green }}>{stats.needsReprice}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Product List */}
        <div style={{ ...card, overflow: 'hidden', width: 280, flexShrink: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</span>
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filteredProducts.map(p => (
              <div key={p.sku} onClick={() => setSelectedProduct(p.sku)}
                style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: currentProduct?.sku === p.sku ? 'rgba(201,169,98,0.1)' : 'transparent', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>{p.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.totalQty}</div>
                  {p.needsReprice > 0 && <div style={{ fontSize: 10, color: c.gold }}>{p.needsReprice} ⚠️</div>}
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: c.textMuted, fontSize: 13 }}>
                {stats.total === 0 ? 'Click Sync to load' : 'No matches'}
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {currentProduct ? (
            <>
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                  {currentProduct.image ? <img src={currentProduct.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{currentProduct.name}</div>
                  <div style={{ fontSize: 12, color: c.textMuted }}>{currentProduct.sku}</div>
                </div>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>SIZE</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>YOUR ASK</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>LOWEST</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>BID</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>SELL FAST</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>COST</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>PROFIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProduct.sizes.map(item => {
                      const isEdited = editedPrices[item.listingId] !== undefined;
                      const currentPrice = isEdited ? editedPrices[item.listingId] : item.yourAsk;
                      const needsReprice = item.lowestAsk && item.yourAsk > item.lowestAsk;
                      
                      return (
                        <tr key={item.listingId} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.size}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <input type="number" value={currentPrice || ''} 
                              onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })}
                              style={{ width: 70, padding: '4px 8px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 4, color: c.text, textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: needsReprice ? c.gold : c.green }}>
                            {item.lowestAsk 
                              ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.lowestAsk - 1 })} style={{ background: 'none', border: 'none', color: needsReprice ? c.gold : c.green, cursor: 'pointer', fontWeight: 600 }}>${item.lowestAsk}</button>
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {item.highestBid 
                              ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer' }}>${item.highestBid}</button>
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {item.sellFaster 
                              ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer' }}>${item.sellFaster}</button>
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: c.textMuted }}>{item.cost ? `$${item.cost}` : '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: item.estProfit > 0 ? c.green : item.estProfit < 0 ? c.red : c.textMuted }}>
                            {item.estProfit !== null ? `$${item.estProfit}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {currentProduct.sizes.some(s => s.sellFaster) && (
                <div style={{ padding: 12, borderTop: `1px solid ${c.border}`, display: 'flex', gap: 8 }}>
                  <button onClick={() => {
                    const newPrices = { ...editedPrices };
                    currentProduct.sizes.forEach(s => { if (s.sellFaster) newPrices[s.listingId] = s.sellFaster; });
                    setEditedPrices(newPrices);
                  }} style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.1)', border: `1px solid ${c.green}`, borderRadius: 6, color: c.green, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ⚡ Apply All Sell Fast
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
              {stats.total === 0 ? 'Click Sync to load StockX listings' : 'Select a product'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
