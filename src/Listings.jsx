import React, { useState, useEffect, useCallback, useMemo } from 'react';

export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [subTab, setSubTab] = useState('reprice');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMarketData, setLoadingMarketData] = useState(false);
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
    if (syncing) return;
    setSyncing(true);
    try {
      console.log('[Sync] Starting fast sync...');
      const [sxRes, ebRes] = await Promise.all([
        stockxToken ? fetch('/api/stockx-listings?skipMarketData=true', { headers: { 'Authorization': `Bearer ${stockxToken}` } }) : null,
        ebayToken ? fetch('/api/ebay-listings', { headers: { 'Authorization': `Bearer ${ebayToken}` } }) : null
      ]);
      
      console.log('[Sync] StockX response:', sxRes?.status);
      
      if (sxRes && !sxRes.ok) {
        const errText = await sxRes.text();
        console.error('[Sync] StockX error:', errText);
        showToast('StockX sync failed - check console', 'error');
        setSyncing(false);
        return;
      }
      
      const sxData = sxRes ? await sxRes.json() : { listings: [] };
      const ebData = ebRes?.ok ? await ebRes.json() : { listings: [] };
      
      const sx = sxData.listings || [];
      const eb = ebData.listings || [];
      
      console.log('[Sync] Got', sx.length, 'StockX listings');
      
      setStockxListings(sx); 
      setEbayListings(eb);
      localStorage.setItem('fl_sx', JSON.stringify(sx)); 
      localStorage.setItem('fl_eb', JSON.stringify(eb));
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay`);
    } catch (e) { 
      console.error('[Sync] Error:', e);
      showToast('Sync failed: ' + e.message, 'error'); 
    }
    finally { setSyncing(false); }
  }, [stockxToken, ebayToken, syncing]);
  
  // Fetch market data for selected product
  const fetchMarketData = useCallback(async (productId, variantIds) => {
    if (!stockxToken || !productId) return;
    setLoadingMarketData(true);
    try {
      console.log('[MarketData] Fetching for product', productId);
      const r = await fetch(`/api/stockx-listings?productId=${productId}&variantIds=${variantIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      if (r.ok) {
        const data = await r.json();
        console.log('[MarketData] Got data for', Object.keys(data.marketData || {}).length, 'variants');
        
        // Update listings with market data
        setStockxListings(prev => prev.map(l => {
          const md = data.marketData?.[l.variantId];
          if (md) {
            const channel = l.inventoryType || 'STANDARD';
            let lowestAsk, sellFaster, highestBid;
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
        }));
      }
    } catch (e) {
      console.error('[MarketData] Error:', e);
    } finally {
      setLoadingMarketData(false);
    }
  }, [stockxToken]);

  useEffect(() => { 
    if ((stockxToken || ebayToken) && !stockxListings.length && !syncing) {
      syncListings(); 
    }
  }, [stockxToken, ebayToken]);

  // Group listings by SKU
  const groupedProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || 'UNK';
      if (!g[sku]) g[sku] = { sku, name: l.name, image: l.image, productId: l.productId, sizes: [], sizeGroups: {} };
      const cost = getCost(sku, l.size);
      g[sku].sizes.push({ ...l, cost });
      
      // Group by size for qty display
      const sizeKey = `${l.size}-${l.inventoryType || 'STANDARD'}`;
      if (!g[sku].sizeGroups[sizeKey]) {
        g[sku].sizeGroups[sizeKey] = { 
          size: l.size, 
          inventoryType: l.inventoryType || 'STANDARD',
          listings: [],
          lowestAsk: l.lowestAsk,
          highestBid: l.highestBid,
          sellFaster: l.sellFaster
        };
      }
      g[sku].sizeGroups[sizeKey].listings.push({ ...l, cost });
    });
    
    Object.values(g).forEach(p => {
      // Convert sizeGroups to array and calculate qty
      p.consolidatedSizes = Object.values(p.sizeGroups).map(sg => ({
        ...sg,
        qty: sg.listings.length,
        listingIds: sg.listings.map(l => l.listingId),
        yourAsks: sg.listings.map(l => l.yourAsk),
        minAsk: Math.min(...sg.listings.map(l => l.yourAsk)),
        maxAsk: Math.max(...sg.listings.map(l => l.yourAsk)),
        costs: sg.listings.map(l => l.cost).filter(c => c),
        // Use first listing as reference
        listingId: sg.listings[0].listingId,
        yourAsk: sg.listings[0].yourAsk,
        cost: sg.listings[0].cost
      }));
      p.consolidatedSizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
      
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

  const filteredProducts = useMemo(() => { 
    let products = groupedProducts;
    
    // In Reprice tab, only show products that have items needing repricing
    if (subTab === 'reprice') {
      products = products.filter(p => p.notLowest > 0);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    
    return products;
  }, [groupedProducts, searchQuery, subTab]);
  const currentProduct = useMemo(() => groupedProducts.find(p => p.sku === selectedProduct), [groupedProducts, selectedProduct]);

  useEffect(() => { 
    if (filteredProducts.length && !selectedProduct) {
      const firstProduct = filteredProducts[0];
      setSelectedProduct(firstProduct.sku);
      // Fetch market data for first product
      if (firstProduct.productId) {
        const variantIds = firstProduct.sizes.map(s => s.variantId).filter(Boolean);
        fetchMarketData(firstProduct.productId, variantIds);
      }
    }
  }, [filteredProducts, fetchMarketData]);

  const handleSelectAll = () => { 
    if (!currentProduct) return; 
    const allListingIds = currentProduct.consolidatedSizes.flatMap(s => s.listingIds);
    setSelectedSizes(selectedSizes.size === allListingIds.length ? new Set() : new Set(allListingIds)); 
  };
  
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: '100%', alignSelf: 'flex-start' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, width: '100%' }}>
          {/* Left: Products */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</div>
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
                <div key={p.sku} onClick={() => { 
                  setSelectedProduct(p.sku); 
                  setSelectedSizes(new Set()); 
                  setEditedPrices({}); 
                  // Fetch market data for this product
                  if (p.productId) {
                    const variantIds = p.sizes.map(s => s.variantId).filter(Boolean);
                    fetchMarketData(p.productId, variantIds);
                  }
                }} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === p.sku ? `3px solid ${c.gold}` : '3px solid transparent', display: 'flex', gap: 10, alignItems: 'center' }}>
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
          <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
                      {loadingMarketData && <span style={{ marginLeft: 8, color: c.gold, fontSize: 10 }}>Loading prices...</span>}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: c.textMuted }}>
                    <input type="checkbox" checked={currentProduct.consolidatedSizes.length > 0 && currentProduct.consolidatedSizes.flatMap(s => s.listingIds).every(id => selectedSizes.has(id))} onChange={handleSelectAll} style={{ width: 16, height: 16, accentColor: c.green }} />
                    Select all
                  </label>
                </div>

                {/* Market Summary - Bid/Ask Spread */}
                {currentProduct.sizes[0] && (
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(201,169,98,0.05)', display: 'flex', gap: 20, fontSize: 12 }}>
                    <div>
                      <span style={{ color: c.textMuted }}>Highest Bid: </span>
                      <span style={{ color: c.green, fontWeight: 700 }}>
                        {currentProduct.sizes.some(s => s.highestBid) 
                          ? `$${Math.max(...currentProduct.sizes.filter(s => s.highestBid).map(s => s.highestBid))}` 
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: c.textMuted }}>Lowest Ask: </span>
                      <span style={{ color: '#f97316', fontWeight: 700 }}>
                        {currentProduct.sizes.some(s => s.lowestAsk) 
                          ? `$${Math.min(...currentProduct.sizes.filter(s => s.lowestAsk).map(s => s.lowestAsk))}` 
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: c.textMuted }}>Spread: </span>
                      <span style={{ fontWeight: 700 }}>
                        {(() => {
                          const bids = currentProduct.sizes.filter(s => s.highestBid).map(s => s.highestBid);
                          const asks = currentProduct.sizes.filter(s => s.lowestAsk).map(s => s.lowestAsk);
                          if (bids.length && asks.length) {
                            const spread = Math.min(...asks) - Math.max(...bids);
                            return spread > 0 ? `$${spread}` : 'Crossed';
                          }
                          return '—';
                        })()}
                      </span>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <span style={{ color: c.textMuted }}>Your Range: </span>
                      <span style={{ fontWeight: 600 }}>
                        ${Math.min(...currentProduct.sizes.map(s => s.yourAsk))} - ${Math.max(...currentProduct.sizes.map(s => s.yourAsk))}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                  <span style={{ width: 32 }}></span>
                  <span style={{ width: 70 }}>SIZE</span>
                  <span style={{ width: 36 }}>QTY</span>
                  <span style={{ width: 70 }}>YOUR ASK</span>
                  <span style={{ width: 80 }}>LOWEST</span>
                  <span style={{ width: 60 }}>BID</span>
                  <span style={{ width: 75 }}>SELL FASTER</span>
                  <span style={{ width: 70 }}>COST</span>
                  <span style={{ width: 70 }}>PROFIT</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 500 }}>
                  {currentProduct.consolidatedSizes.map(item => {
                    const isEdited = item.listingIds.some(id => editedPrices[id] !== undefined);
                    const currentPrice = parseFloat(editedPrices[item.listingIds[0]] ?? item.yourAsk) || 0;
                    const sellFasterPrice = item.sellFaster || null;
                    
                    // Channel badge color
                    const channel = item.inventoryType || 'STANDARD';
                    const channelBadge = channel === 'DIRECT' ? { label: 'D', bg: '#f97316' } : 
                                        channel === 'FLEX' ? { label: 'F', bg: '#8b5cf6' } : 
                                        { label: 'S', bg: '#6b7280' };
                    
                    // Check if user is the lowest ask in their channel
                    const isLowest = item.lowestAsk && item.minAsk <= item.lowestAsk;
                    
                    // Calculate profit (price after ~15% StockX fees - cost)
                    // StockX payout is roughly 85% of sale price (15% fees)
                    const payout = currentPrice * 0.85;
                    
                    // Get all valid costs as numbers
                    const costNums = (item.costs || []).map(c => {
                      if (!c) return null;
                      if (typeof c === 'string' && c.includes('-')) {
                        return parseFloat(c.split('-')[1]); // Use higher cost for conservative profit
                      }
                      return parseFloat(c);
                    }).filter(c => c && !isNaN(c));
                    
                    let profitDisplay = null;
                    let profitColor = c.textMuted;
                    
                    if (costNums.length > 0) {
                      const minCost = Math.min(...costNums);
                      const maxCost = Math.max(...costNums);
                      const maxProfit = Math.round(payout - minCost);
                      const minProfit = Math.round(payout - maxCost);
                      
                      if (minProfit === maxProfit) {
                        profitDisplay = `$${minProfit}`;
                        profitColor = minProfit > 0 ? c.green : minProfit < 0 ? c.red : c.textMuted;
                      } else {
                        profitDisplay = `$${minProfit}-${maxProfit}`;
                        profitColor = minProfit > 0 ? c.green : maxProfit < 0 ? c.red : c.gold; // gold = mixed
                      }
                    }
                    
                    // Show price range if different prices exist
                    const priceDisplay = item.minAsk === item.maxAsk ? item.minAsk : `${item.minAsk}-${item.maxAsk}`;
                    
                    // Unique key for this size group
                    const rowKey = `${item.size}-${item.inventoryType}`;
                    
                    return (
                      <div key={rowKey} style={{ display: 'flex', gap: 0, padding: '12px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                        <span style={{ width: 32 }}>
                          <input 
                            type="checkbox" 
                            checked={item.listingIds.every(id => selectedSizes.has(id))} 
                            onChange={e => { 
                              const n = new Set(selectedSizes); 
                              item.listingIds.forEach(id => e.target.checked ? n.add(id) : n.delete(id)); 
                              setSelectedSizes(n); 
                            }} 
                            style={{ width: 16, height: 16, accentColor: c.green }} 
                          />
                        </span>
                        <span style={{ width: 70, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.size}
                          <span style={{ background: channelBadge.bg, color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3 }}>{channelBadge.label}</span>
                        </span>
                        <span style={{ width: 36, fontWeight: 600 }}>{item.qty}</span>
                        <span style={{ width: 70 }}>
                          <input 
                            type="number" 
                            value={editedPrices[item.listingIds[0]] ?? item.yourAsk} 
                            onChange={e => {
                              const newPrices = { ...editedPrices };
                              item.listingIds.forEach(id => { newPrices[id] = e.target.value; });
                              setEditedPrices(newPrices);
                            }} 
                            style={{ width: 54, padding: '6px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, fontSize: 13, textAlign: 'center' }} 
                          />
                        </span>
                        <span style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {item.lowestAsk ? (
                            isLowest ? (
                              <span style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '4px 8px', color: c.green, fontWeight: 700, fontSize: 11 }}>✓ YOU</span>
                            ) : (
                              <span style={{ color: c.text, fontWeight: 600 }}>${item.lowestAsk}</span>
                            )
                          ) : (
                            <span style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '4px 8px', color: c.green, fontWeight: 700, fontSize: 11 }}>✓ ONLY</span>
                          )}
                        </span>
                        <span style={{ width: 60 }}>{item.highestBid ? <button onClick={() => {
                          const newPrices = { ...editedPrices };
                          item.listingIds.forEach(id => { newPrices[id] = item.highestBid; });
                          setEditedPrices(newPrices);
                        }} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '4px 6px', color: c.green, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>${item.highestBid}</button> : '—'}</span>
                        <span style={{ width: 75 }}>{sellFasterPrice ? <button onClick={() => {
                          const newPrices = { ...editedPrices };
                          item.listingIds.forEach(id => { newPrices[id] = sellFasterPrice; });
                          setEditedPrices(newPrices);
                        }} style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 4, padding: '4px 8px', color: '#f97316', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>${sellFasterPrice}</button> : '—'}</span>
                        <span style={{ width: 70, color: c.textMuted, fontSize: 11 }}>{(() => {
                          const validCosts = (item.costs || []).map(c => {
                            if (!c) return null;
                            if (typeof c === 'string' && c.includes('-')) return parseFloat(c.split('-')[0]);
                            return parseFloat(c);
                          }).filter(c => c && !isNaN(c));
                          if (validCosts.length === 0) return '—';
                          const min = Math.min(...validCosts);
                          const max = Math.max(...validCosts);
                          return min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(0)}-${max.toFixed(0)}`;
                        })()}</span>
                        <span style={{ width: 70, color: profitColor, fontWeight: 600, fontSize: 11 }}>{profitDisplay || '—'}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {selectedSizes.size > 0 && (
                    <>
                      <span style={{ fontSize: 12, color: c.textMuted }}>{selectedSizes.size} selected:</span>
                      <input 
                        type="number" 
                        placeholder="Bulk price" 
                        id="bulkPriceInput"
                        style={{ width: 80, padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 13, textAlign: 'center' }} 
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('bulkPriceInput');
                          const price = parseFloat(input?.value);
                          if (price > 0) {
                            const newPrices = { ...editedPrices };
                            selectedSizes.forEach(id => { newPrices[id] = price; });
                            setEditedPrices(newPrices);
                            input.value = '';
                          }
                        }} 
                        style={{ padding: '8px 14px', background: c.gold, border: 'none', borderRadius: 6, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >Apply</button>
                      <button 
                        onClick={() => {
                          const newPrices = { ...editedPrices };
                          currentProduct.sizes.filter(s => selectedSizes.has(s.listingId) && s.sellFaster).forEach(s => {
                            newPrices[s.listingId] = s.sellFaster;
                          });
                          setEditedPrices(newPrices);
                        }} 
                        style={{ padding: '8px 14px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 6, color: '#f97316', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >Apply Sell Faster</button>
                      <button 
                        onClick={() => {
                          const newPrices = { ...editedPrices };
                          currentProduct.sizes.filter(s => selectedSizes.has(s.listingId) && s.highestBid).forEach(s => {
                            newPrices[s.listingId] = s.highestBid;
                          });
                          setEditedPrices(newPrices);
                        }} 
                        style={{ padding: '8px 14px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: c.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >Match Bids</button>
                      <div style={{ width: 1, height: 24, background: c.border, margin: '0 4px' }}></div>
                    </>
                  )}
                  <button onClick={handleUpdatePrices} disabled={!Object.keys(editedPrices).length || loading} style={{ padding: '10px 24px', background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed' }}>{loading ? 'Updating...' : 'Update Prices'}</button>
                  <button onClick={handleUnlist} disabled={!selectedSizes.size || loading} style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13, fontWeight: 600, cursor: selectedSizes.size ? 'pointer' : 'not-allowed' }}>Unlist Selected</button>
                </div>
              </>
            ) : <div style={{ padding: 100, textAlign: 'center', color: c.textMuted, fontSize: 15 }}>Select a product</div>}
          </div>
        </div>
      )}

      {subTab === 'crosslist' && <div style={{ ...card, padding: 80, textAlign: 'center', width: '100%' }}><div style={{ fontSize: 56 }}>🚀</div><h3 style={{ marginTop: 16 }}>Cross-list to eBay</h3><p style={{ color: c.textMuted }}>{crosslistProducts.length} products ({totalCrosslist} listings) not on eBay</p></div>}
      {subTab === 'all' && <div style={{ ...card, padding: 80, textAlign: 'center', width: '100%' }}><div style={{ fontSize: 56 }}>📦</div><h3 style={{ marginTop: 16 }}>All Listings</h3><p style={{ color: c.textMuted }}>{stockxListings.length} StockX + {ebayListings.length} eBay</p></div>}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '14px 28px', borderRadius: 10, background: c.card, border: `1px solid ${toast.type === 'error' ? c.red : c.green}`, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', zIndex: 9999 }}><span style={{ color: toast.type === 'error' ? c.red : c.green, fontWeight: 600 }}>{toast.type === 'error' ? '❌' : '✓'} {toast.msg}</span></div>}
    </div>
  );
}
