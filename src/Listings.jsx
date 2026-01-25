import React, { useState, useMemo, useEffect, useCallback } from 'react';

export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  // State
  const [activeTab, setActiveTab] = useState('reprice');
  const [syncing, setSyncing] = useState(false);
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_sx') || '[]'); } catch { return []; }
  });
  const [ebayListings, setEbayListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_eb') || '[]'); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedForCrosslist, setSelectedForCrosslist] = useState(new Set());
  const [editedPrices, setEditedPrices] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [crosslistLoading, setCrosslistLoading] = useState(false);

  const showToast = (msg, type = 'success') => { 
    setToast({ msg, type }); 
    setTimeout(() => setToast(null), 3000); 
  };

  // ============================================
  // COST MATCHING - Match purchases to listings
  // ============================================
  const getCost = useCallback((sku, size) => {
    if (!purchases || !purchases.length) return null;
    
    const normalizeSku = (s) => String(s || '').toLowerCase().replace(/[-\s]/g, '');
    const normalizeSize = (s) => String(s || '').toLowerCase().replace(/[^0-9.]/g, '');
    
    // Find matching unsold purchase (FIFO - first match)
    const match = purchases.find(p => {
      if (p.sold) return false; // Skip sold items
      const pSku = normalizeSku(p.sku || p.styleId);
      const lSku = normalizeSku(sku);
      if (!pSku || !lSku) return false;
      
      // SKU match (exact or contains)
      const skuMatch = pSku === lSku || pSku.includes(lSku) || lSku.includes(pSku);
      if (!skuMatch) return false;
      
      // Size match if both have sizes
      if (size && p.size) {
        return normalizeSize(p.size) === normalizeSize(size);
      }
      return true;
    });
    
    return match ? parseFloat(match.cost) || null : null;
  }, [purchases]);

  // ============================================
  // SYNC FUNCTIONS
  // ============================================
  const syncStockX = async () => {
    if (!stockxToken) return [];
    try {
      // Fetch WITH market data (no skipMarketData param)
      const res = await fetch('/api/stockx-listings', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.listings || [];
      }
    } catch (e) {
      console.error('[Sync] StockX error:', e);
    }
    return [];
  };

  const syncEbay = async () => {
    if (!ebayToken) return [];
    try {
      const res = await fetch('/api/ebay-listings', {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.listings || [];
      }
    } catch (e) {
      console.error('[Sync] eBay error:', e);
    }
    return [];
  };

  // Fetch market data for a specific product (called when product is selected)
  const fetchMarketData = async (productId, variantIds) => {
    if (!stockxToken || !productId || !variantIds.length) return;
    
    try {
      const res = await fetch(`/api/stockx-listings?productId=${productId}&variantIds=${variantIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        const md = data.marketData || {};
        
        // Update listings with market data
        setStockxListings(prev => prev.map(l => {
          const variantData = md[l.variantId];
          if (variantData) {
            const channel = l.inventoryType || 'STANDARD';
            let lowestAsk, sellFaster, highestBid;
            
            if (channel === 'DIRECT') {
              lowestAsk = variantData.directLowest;
              sellFaster = variantData.directSellFaster;
              highestBid = variantData.directBid || variantData.highestBid;
            } else if (channel === 'FLEX') {
              lowestAsk = variantData.flexLowest;
              sellFaster = variantData.flexSellFaster;
              highestBid = variantData.flexBid || variantData.highestBid;
            } else {
              lowestAsk = variantData.standardLowest;
              sellFaster = variantData.standardSellFaster;
              highestBid = variantData.standardBid || variantData.highestBid;
            }
            
            return { ...l, lowestAsk, sellFaster, highestBid };
          }
          return l;
        }));
        
        // Also update localStorage
        const updated = stockxListings.map(l => {
          const variantData = md[l.variantId];
          if (variantData) {
            const channel = l.inventoryType || 'STANDARD';
            let lowestAsk, sellFaster, highestBid;
            if (channel === 'DIRECT') {
              lowestAsk = variantData.directLowest;
              sellFaster = variantData.directSellFaster;
              highestBid = variantData.directBid || variantData.highestBid;
            } else if (channel === 'FLEX') {
              lowestAsk = variantData.flexLowest;
              sellFaster = variantData.flexSellFaster;
              highestBid = variantData.flexBid || variantData.highestBid;
            } else {
              lowestAsk = variantData.standardLowest;
              sellFaster = variantData.standardSellFaster;
              highestBid = variantData.standardBid || variantData.highestBid;
            }
            return { ...l, lowestAsk, sellFaster, highestBid };
          }
          return l;
        });
        localStorage.setItem('fl_sx', JSON.stringify(updated));
      }
    } catch (e) {
      console.error('[MarketData] Error:', e);
    }
  };

  const syncAll = async () => {
    if (syncing) return;
    setSyncing(true);
    
    try {
      const [sx, eb] = await Promise.all([syncStockX(), syncEbay()]);
      
      console.log('[Sync] StockX:', sx.length, 'eBay:', eb.length);
      
      setStockxListings(sx);
      setEbayListings(eb);
      localStorage.setItem('fl_sx', JSON.stringify(sx));
      localStorage.setItem('fl_eb', JSON.stringify(eb));
      
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay`);
    } catch (e) {
      console.error('[Sync] Error:', e);
      showToast('Sync failed', 'error');
    }
    
    setSyncing(false);
  };

  // ============================================
  // GROUPED PRODUCTS (with cost)
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
          sizes: [],
          source: 'stockx'
        };
      }
      const cost = getCost(sku, l.size);
      const estProfit = cost && l.yourAsk ? Math.round(l.yourAsk * 0.88 - cost) : null; // ~12% fees
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
  // FILTERED PRODUCTS (based on active tab)
  // ============================================
  const filteredProducts = useMemo(() => {
    let products = [...groupedProducts];
    
    // Tab-specific filtering
    if (activeTab === 'reprice') {
      // Show products that need repricing (have lowestAsk data and are not lowest)
      // Or show all if no market data loaded yet
      const hasMarketData = products.some(p => p.sizes.some(s => s.lowestAsk));
      if (hasMarketData) {
        products = products.filter(p => p.notLowest > 0);
      }
    } else if (activeTab === 'crosslist') {
      // Show products NOT on eBay
      const ebaySkus = new Set(ebayListings.map(e => (e.sku || e.mpn || '').toLowerCase()));
      products = products.filter(p => !ebaySkus.has(p.sku.toLowerCase()));
    }
    // 'all' tab shows everything
    
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p =>
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q)
      );
    }
    
    return products;
  }, [groupedProducts, ebayListings, activeTab, searchQuery]);

  // ============================================
  // CURRENT PRODUCT - from filteredProducts!
  // ============================================
  const currentProduct = filteredProducts.find(p => p.sku === selectedProduct);

  // Fix: Clear selection if filtered out
  useEffect(() => {
    if (selectedProduct && !filteredProducts.some(p => p.sku === selectedProduct)) {
      setSelectedProduct(null);
    }
  }, [filteredProducts, selectedProduct]);

  // ============================================
  // TAB COUNTS
  // ============================================
  const repriceCount = useMemo(() => {
    return stockxListings.filter(l => l.lowestAsk && l.yourAsk > l.lowestAsk).length;
  }, [stockxListings]);

  const crosslistCount = useMemo(() => {
    const ebaySkus = new Set(ebayListings.map(e => (e.sku || e.mpn || '').toLowerCase()));
    return groupedProducts.filter(p => !ebaySkus.has(p.sku.toLowerCase())).reduce((sum, p) => sum + p.totalQty, 0);
  }, [groupedProducts, ebayListings]);

  // ============================================
  // PRICE UPDATE
  // ============================================
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
        await syncAll(); // Refresh
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) {
      showToast('Update failed', 'error');
    }
  };

  // ============================================
  // CROSS-LIST TO EBAY
  // ============================================
  const handleCrosslist = async () => {
    if (!selectedForCrosslist.size || !ebayToken) return;
    
    setCrosslistLoading(true);
    
    // Get selected products
    const products = groupedProducts
      .filter(p => selectedForCrosslist.has(p.sku))
      .map(p => ({
        sku: p.sku,
        name: p.name,
        sizes: p.sizes.map(s => ({
          size: s.size,
          price: s.yourAsk,
          quantity: 1
        }))
      }));
    
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      
      if (res.ok) {
        showToast(`Created ${products.length} eBay listings`);
        setSelectedForCrosslist(new Set());
        await syncAll();
      } else {
        const err = await res.json();
        showToast(err.error || 'Crosslist failed', 'error');
      }
    } catch (e) {
      showToast('Crosslist failed', 'error');
    }
    
    setCrosslistLoading(false);
  };

  // ============================================
  // RENDER
  // ============================================
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
            onClick={syncAll} 
            disabled={syncing} 
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { id: 'reprice', label: '⚡ Reprice', count: repriceCount },
          { id: 'all', label: '📦 All Listings', count: stockxListings.length },
          { id: 'crosslist', label: '🚀 Cross-list', count: crosslistCount }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedProduct(null); setEditedPrices({}); }}
            style={{
              padding: '10px 16px',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: `1px solid ${activeTab === tab.id ? c.gold : c.border}`,
              borderRadius: 8,
              color: activeTab === tab.id ? c.gold : c.textMuted,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {tab.label} <span style={{ marginLeft: 6, opacity: 0.7 }}>{tab.count}</span>
          </button>
        ))}
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
                onClick={() => { 
                  setSelectedProduct(p.sku); 
                  setEditedPrices({}); 
                  // Fetch market data for this product
                  if (p.productId) {
                    const variantIds = p.sizes.map(s => s.variantId).filter(Boolean);
                    fetchMarketData(p.productId, variantIds);
                  }
                }}
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
                {activeTab === 'crosslist' && (
                  <input
                    type="checkbox"
                    checked={selectedForCrosslist.has(p.sku)}
                    onChange={e => {
                      e.stopPropagation();
                      const n = new Set(selectedForCrosslist);
                      e.target.checked ? n.add(p.sku) : n.delete(p.sku);
                      setSelectedForCrosslist(n);
                    }}
                    style={{ accentColor: c.green }}
                  />
                )}
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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
                {stockxListings.length === 0 ? 'Click Sync to load listings' : 'No products match criteria'}
              </div>
            )}
          </div>
          
          {/* Crosslist Action */}
          {activeTab === 'crosslist' && selectedForCrosslist.size > 0 && (
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${c.border}` }}>
              <button
                onClick={handleCrosslist}
                disabled={crosslistLoading || !ebayToken}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: c.green,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontWeight: 700,
                  cursor: crosslistLoading ? 'wait' : 'pointer'
                }}
              >
                {crosslistLoading ? '⏳ Creating...' : `🚀 Create ${selectedForCrosslist.size} on eBay`}
              </button>
            </div>
          )}
        </div>

        {/* Product Detail */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {currentProduct ? (
            <>
              {/* Header */}
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
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
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400 }}>
                {currentProduct.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const currentPrice = parseFloat(editedPrices[item.listingId] ?? item.yourAsk) || 0;
                  const badge = item.inventoryType === 'DIRECT' ? { l: 'D', bg: '#f97316' } 
                              : item.inventoryType === 'FLEX' ? { l: 'F', bg: '#8b5cf6' } 
                              : { l: 'S', bg: '#6b7280' };
                  
                  // Recalculate profit based on edited price
                  const displayProfit = item.cost ? Math.round(currentPrice * 0.88 - item.cost) : null;

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
                            : <span>${item.lowestAsk}</span>
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
              {activeTab !== 'crosslist' && (
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
              )}
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
