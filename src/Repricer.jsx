import React, { useState, useMemo, useCallback, useEffect } from 'react';

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
  const [loadingMarketData, setLoadingMarketData] = useState(false);
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_repricer_sx') || '[]'); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editedPrices, setEditedPrices] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());

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
      // Fetch listings only (skip market data for fast sync)
      const res = await fetch('/api/stockx-listings?skipMarketData=true', {
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
  // FETCH MARKET DATA FOR PRODUCT (lazy load)
  // ============================================
  const fetchProductMarketData = async (product) => {
    if (!product || !stockxToken || loadingMarketData) return;
    
    // Get variant IDs for this product
    const variantIds = product.sizes.map(s => s.variantId).filter(Boolean);
    if (variantIds.length === 0) return;
    
    // Check if already has market data
    const hasMarketData = product.sizes.some(s => s.lowestAsk || s.sellFaster);
    if (hasMarketData) return;
    
    setLoadingMarketData(true);
    
    try {
      const productId = product.sizes[0]?.productId;
      if (!productId) return;
      
      const res = await fetch(`/api/stockx-listings?productId=${productId}&variantIds=${variantIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        const marketData = data.marketData || {};
        
        // Update listings with market data
        setStockxListings(prev => {
          const updated = prev.map(l => {
            if (marketData[l.variantId]) {
              const md = marketData[l.variantId];
              const channel = l.inventoryType || 'STANDARD';
              
              let lowestAsk = null, sellFaster = null, highestBid = null;
              if (channel === 'DIRECT') {
                lowestAsk = md.directLowest;
                sellFaster = md.directSellFaster;
                highestBid = md.directBid || md.highestBid;
              } else if (channel === 'FLEX') {
                lowestAsk = md.flexLowest;
                sellFaster = md.flexSellFaster;
                highestBid = md.flexBid || md.highestBid;
              } else {
                lowestAsk = md.standardLowest;
                sellFaster = md.standardSellFaster;
                highestBid = md.standardBid || md.highestBid;
              }
              
              return { ...l, lowestAsk, sellFaster, highestBid };
            }
            return l;
          });
          localStorage.setItem('fl_repricer_sx', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      console.error('[Repricer] Market data error:', e);
    }
    
    setLoadingMarketData(false);
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

  // Clear selected sizes when product changes
  useMemo(() => {
    setSelectedSizes(new Set());
  }, [currentProduct?.sku]);

  // Auto-fetch market data when product is selected
  useEffect(() => {
    if (currentProduct) {
      fetchProductMarketData(currentProduct);
    }
  }, [currentProduct?.sku]);

  // Stats
  const stats = useMemo(() => {
    const total = stockxListings.length;
    const products = groupedProducts.length;
    const needsReprice = groupedProducts.reduce((sum, p) => sum + p.needsReprice, 0);
    return { total, products, needsReprice };
  }, [stockxListings, groupedProducts]);

  // ============================================
  // SELECTION HANDLERS
  // ============================================
  const toggleSizeSelection = (listingId) => {
    setSelectedSizes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listingId)) {
        newSet.delete(listingId);
      } else {
        newSet.add(listingId);
      }
      return newSet;
    });
  };

  const toggleAllSizes = () => {
    if (!currentProduct) return;
    const allIds = currentProduct.sizes.map(s => s.listingId);
    const allSelected = allIds.every(id => selectedSizes.has(id));
    
    if (allSelected) {
      setSelectedSizes(new Set());
    } else {
      setSelectedSizes(new Set(allIds));
    }
  };

  // ============================================
  // APPLY PRICING STRATEGIES
  // ============================================
  const applyStrategy = (strategy, onlySelected = false) => {
    if (!currentProduct) return;
    
    const newPrices = { ...editedPrices };
    const sizesToUpdate = onlySelected 
      ? currentProduct.sizes.filter(s => selectedSizes.has(s.listingId))
      : currentProduct.sizes;
    
    sizesToUpdate.forEach(s => {
      let newPrice = null;
      
      switch (strategy) {
        case 'beat':
          if (s.lowestAsk) newPrice = s.lowestAsk - 1;
          break;
        case 'match':
          if (s.lowestAsk) newPrice = s.lowestAsk;
          break;
        case 'sellfast':
          if (s.sellFaster) newPrice = s.sellFaster;
          break;
        case 'matchbid':
          if (s.highestBid) newPrice = s.highestBid;
          break;
      }
      
      if (newPrice !== null) {
        newPrices[s.listingId] = newPrice;
      }
    });
    
    setEditedPrices(newPrices);
  };

  // ============================================
  // UPDATE PRICES
  // ============================================
  const handleUpdatePrices = async () => {
    const changes = Object.entries(editedPrices).filter(([id, price]) => {
      const listing = stockxListings.find(l => l.listingId === id);
      const newPrice = parseFloat(price);
      return listing && !isNaN(newPrice) && newPrice > 0 && newPrice !== listing.yourAsk;
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
  const changesCount = Object.entries(editedPrices).filter(([id, price]) => {
    const listing = stockxListings.find(l => l.listingId === id);
    const newPrice = parseFloat(price);
    return listing && !isNaN(newPrice) && newPrice > 0 && newPrice !== listing.yourAsk;
  }).length;

  // Clickable price button style
  const priceButtonStyle = (color = c.green) => ({
    background: 'none',
    border: 'none',
    color: color,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 4,
    transition: 'all 0.15s'
  });


  return (
    <div style={{ width: '100%' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000 }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Repricer</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>Stay competitive on StockX</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search SKU..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 160 }} />
          <button onClick={syncStockX} disabled={syncing}
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ ...card, padding: '12px 16px', flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4, fontWeight: 700 }}>TOTAL LISTINGS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4, fontWeight: 700 }}>PRODUCTS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.products}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: c.textMuted, marginBottom: 4, fontWeight: 700 }}>NEED REPRICE</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.needsReprice > 0 ? c.gold : c.green }}>{stats.needsReprice}</div>
        </div>
      </div>

      {/* Product count */}
      <div style={{ padding: '8px 0', marginBottom: 8, fontSize: 12, color: c.textMuted }}>
        PRODUCTS ({filteredProducts.length}) — tap to expand sizes & market data
      </div>

      {/* Expandable Product Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredProducts.length === 0 && (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: c.textMuted }}>
            {stats.total === 0 ? 'Click Sync to load StockX listings' : 'No matches'}
          </div>
        )}

        {filteredProducts.map(product => {
          const isExpanded = currentProduct?.sku === product.sku;
          const allCompetitive = product.needsReprice === 0 && product.sizes.some(s => s.lowestAsk);
          
          return (
            <div key={product.sku} style={{ 
              ...card, 
              overflow: 'hidden',
              borderColor: isExpanded ? 'rgba(201,169,98,0.4)' : c.border
            }}>
              {/* Product Header - Click to expand */}
              <div 
                onClick={() => {
                  if (isExpanded) {
                    setSelectedProduct(null);
                  } else {
                    setSelectedProduct(product.sku);
                  }
                }}
                style={{ 
                  padding: '12px 14px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 10,
                  background: isExpanded ? 'rgba(201,169,98,0.05)' : 'transparent'
                }}
              >
                {/* Arrow */}
                <span style={{ 
                  fontSize: 11, color: c.textMuted, 
                  transition: 'transform 0.2s', 
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  flexShrink: 0 
                }}>▶</span>
                
                {/* Image */}
                <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                  {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
                </div>
                
                {/* Product info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                  <div style={{ fontSize: 11, color: c.green, marginTop: 1 }}>{product.sku}</div>
                </div>
                
                {/* Right side meta */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: c.textMuted }}>
                    <span style={{ fontWeight: 700, color: '#fff' }}>{product.totalQty}</span> listing{product.totalQty !== 1 ? 's' : ''}
                  </div>
                  {product.needsReprice > 0 ? (
                    <div style={{ fontSize: 10, color: c.gold, fontWeight: 600, marginTop: 2 }}>{product.needsReprice} need reprice</div>
                  ) : allCompetitive ? (
                    <div style={{ fontSize: 10, color: c.green, fontWeight: 600, marginTop: 2 }}>✓ All competitive</div>
                  ) : null}
                </div>
              </div>

              {/* Size chips when collapsed */}
              {!isExpanded && (
                <div style={{ padding: '0 14px 10px 60px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {product.sizes.slice(0, 14).map(s => {
                    const needsReprice = s.lowestAsk && s.yourAsk > s.lowestAsk;
                    return (
                      <span key={s.listingId} style={{ 
                        padding: '2px 8px', 
                        borderRadius: 20, 
                        fontSize: 10,
                        background: needsReprice ? 'rgba(201,169,98,0.12)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${needsReprice ? 'rgba(201,169,98,0.3)' : c.border}`,
                        color: needsReprice ? c.gold : c.textMuted
                      }}>{s.size}</span>
                    );
                  })}
                  {product.sizes.length > 14 && <span style={{ padding: '2px 8px', fontSize: 10, color: c.textMuted }}>+{product.sizes.length - 14} more</span>}
                </div>
              )}

              {/* Expanded - Size details with market data */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${c.border}` }}>
                  
                  {/* Strategy bar + selection */}
                  <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${c.border}` }}>
                    <button onClick={toggleAllSizes}
                      style={{ padding: '5px 10px', background: 'rgba(201,169,98,0.15)', border: '1px solid rgba(201,169,98,0.3)', borderRadius: 6, color: c.gold, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      {product.sizes.length > 0 && product.sizes.every(s => selectedSizes.has(s.listingId)) ? '☑ Deselect All' : '☑ Select All'}
                    </button>
                    <button onClick={() => applyStrategy('beat')}
                      style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      ⚡ Beat Lowest (-$1)
                    </button>
                    <button onClick={() => applyStrategy('match')}
                      style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      Match Lowest
                    </button>
                    {product.sizes.some(s => s.sellFaster) && (
                      <button onClick={() => applyStrategy('sellfast')}
                        style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                        Sell Fast
                      </button>
                    )}
                    {product.sizes.some(s => s.highestBid) && (
                      <button onClick={() => applyStrategy('matchbid')}
                        style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                        Match Bid
                      </button>
                    )}
                    {selectedSizes.size > 0 && (
                      <span style={{ fontSize: 10, color: c.gold, fontWeight: 600, marginLeft: 'auto' }}>
                        {selectedSizes.size} selected
                        <button onClick={() => setSelectedSizes(new Set())} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer', fontSize: 10, marginLeft: 6 }}>✕</button>
                      </span>
                    )}
                  </div>

                  {loadingMarketData && (
                    <div style={{ padding: '8px 14px', fontSize: 12, color: c.gold, background: 'rgba(201,169,98,0.05)' }}>
                      ⏳ Loading market data...
                    </div>
                  )}

                  {/* Size rows */}
                  {product.sizes.map(item => {
                    const isEdited = editedPrices[item.listingId] !== undefined;
                    const currentPrice = isEdited ? editedPrices[item.listingId] : item.yourAsk;
                    const needsReprice = item.lowestAsk && item.yourAsk > item.lowestAsk;
                    const isAlreadyLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                    const isSelected = selectedSizes.has(item.listingId);
                    const priceNum = parseFloat(currentPrice);
                    const feeMultiplier = (item.inventoryType === 'DIRECT' || item.inventoryType === 'FLEX') ? 0.92 : 0.90;
                    const displayProfit = item.cost && !isNaN(priceNum) && priceNum > 0 ? Math.round(priceNum * feeMultiplier - item.cost) : null;
                    
                    return (
                      <div key={item.listingId} style={{ 
                        padding: '10px 14px', 
                        borderTop: `1px solid ${c.border}`,
                        background: isSelected ? 'rgba(201,169,98,0.05)' : needsReprice ? 'rgba(201,169,98,0.02)' : 'transparent'
                      }}>
                        {/* Top row: checkbox, size, your ask, lowest ask */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSizeSelection(item.listingId)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.gold, flexShrink: 0 }}
                          />
                          <div style={{ 
                            width: 36, height: 36, 
                            background: isAlreadyLowest ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.06)', 
                            border: `1px solid ${isAlreadyLowest ? 'rgba(16,185,129,0.3)' : c.border}`,
                            borderRadius: 8, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, flexShrink: 0,
                            color: isAlreadyLowest ? c.green : '#fff'
                          }}>{item.size}</div>
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 700, letterSpacing: 0.3 }}>YOUR ASK</div>
                            <input type="number" value={currentPrice || ''} 
                              onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })}
                              style={{ 
                                width: 80, padding: '4px 8px', 
                                background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', 
                                border: `1px solid ${isEdited ? c.gold : c.border}`, 
                                borderRadius: 4, color: c.text, fontSize: 15, fontWeight: 800
                              }} />
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 700, letterSpacing: 0.3 }}>LOWEST</div>
                            {item.lowestAsk ? (
                              <button 
                                onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.lowestAsk - 1 })} 
                                style={{ ...priceButtonStyle(needsReprice ? c.gold : c.green), fontSize: 15, fontWeight: 800, padding: '2px 4px' }}
                              >
                                ${item.lowestAsk}
                              </button>
                            ) : <span style={{ fontSize: 13, color: c.textMuted }}>—</span>}
                          </div>
                        </div>
                        
                        {/* Market data row */}
                        <div style={{ display: 'flex', gap: 6, marginLeft: 60, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ textAlign: 'center', minWidth: 50 }}>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>BID</div>
                            {item.highestBid ? (
                              <button 
                                onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} 
                                style={{ ...priceButtonStyle(c.text), fontSize: 12, padding: '2px 4px' }}
                              >
                                ${item.highestBid}
                              </button>
                            ) : <div style={{ fontSize: 12, color: c.textMuted }}>—</div>}
                          </div>
                          
                          <div style={{ textAlign: 'center', minWidth: 50 }}>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>SELL FAST</div>
                            {item.sellFaster ? (
                              <button 
                                onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} 
                                style={{ ...priceButtonStyle(c.green), fontSize: 12, padding: '2px 4px' }}
                              >
                                ${item.sellFaster}
                              </button>
                            ) : <div style={{ fontSize: 12, color: c.textMuted }}>—</div>}
                          </div>

                          {item.cost && (
                            <div style={{ textAlign: 'center', minWidth: 50 }}>
                              <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>COST</div>
                              <div style={{ fontSize: 12, color: c.textMuted }}>${item.cost}</div>
                            </div>
                          )}
                          
                          <div style={{ textAlign: 'center', minWidth: 50 }}>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>PROFIT</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: displayProfit > 0 ? c.green : displayProfit < 0 ? c.red : c.textMuted }}>
                              {displayProfit !== null ? `~$${displayProfit}` : '—'}
                            </div>
                          </div>
                          
                          {/* Status indicator */}
                          <div style={{ marginLeft: 'auto' }}>
                            {isEdited && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(201,169,98,0.15)', color: c.gold }}>
                                {currentPrice > item.yourAsk ? '+' : ''}{Math.round(currentPrice - item.yourAsk)}
                              </span>
                            )}
                            {!isEdited && isAlreadyLowest && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.1)', color: c.green }}>
                                ✓ Lowest
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Save Bar */}
      {changesCount > 0 && (
        <div style={{ 
          position: 'sticky', bottom: 0, 
          padding: '12px 16px', 
          background: 'rgba(6,6,6,0.95)', backdropFilter: 'blur(10px)',
          borderTop: `1px solid ${c.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 16, borderRadius: '12px 12px 0 0',
          zIndex: 10
        }}>
          <span style={{ fontSize: 13, color: c.textMuted }}>
            <span style={{ color: c.gold, fontWeight: 700 }}>{changesCount}</span> price{changesCount !== 1 ? 's' : ''} changed
          </span>
          <button onClick={handleUpdatePrices} disabled={updating}
            style={{ padding: '12px 24px', background: c.green, border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: updating ? 'wait' : 'pointer' }}>
            {updating ? '⏳ Saving...' : `💾 Save ${changesCount} Changes`}
          </button>
        </div>
      )}
    </div>
  );
}
