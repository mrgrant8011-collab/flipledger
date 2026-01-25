import React, { useState, useEffect, useCallback, useMemo } from 'react';

export default function Listings({ stockxToken, ebayToken, purchases = [], c = { bg: '#0a0a0a', card: '#111111', border: '#1a1a1a', text: '#ffffff', textMuted: '#888888', gold: '#C9A962', green: '#10b981', red: '#ef4444' } }) {
  const [subTab, setSubTab] = useState('all');
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

  // Get cost from purchases
  const getCost = useCallback((sku, size) => {
    if (!purchases.length) return null;
    const normSku = (s) => String(s || '').toLowerCase().replace(/[-\s]/g, '');
    const normSize = (s) => String(s || '').toLowerCase().replace(/[^0-9.]/g, '');
    const matches = purchases.filter(p => {
      const pSku = normSku(p.sku || p.styleId);
      const lSku = normSku(sku);
      if (!pSku || !lSku) return false;
      if (pSku !== lSku && !pSku.includes(lSku) && !lSku.includes(pSku)) return false;
      if (size && p.size) {
        return normSize(p.size) === normSize(size);
      }
      return true;
    });
    if (matches.length === 0) return null;
    if (matches.length === 1) return parseFloat(matches[0].cost) || null;
    const costs = matches.map(m => parseFloat(m.cost) || 0).filter(c => c > 0);
    if (costs.length === 0) return null;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return min === max ? min : `${min.toFixed(0)}-${max.toFixed(0)}`;
  }, [purchases]);

  const syncListings = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      console.log('[Sync] Starting...');
      const [sxRes, ebRes] = await Promise.all([
        stockxToken ? fetch('/api/stockx-listings?skipMarketData=true', { headers: { 'Authorization': `Bearer ${stockxToken}` } }) : null,
        ebayToken ? fetch('/api/ebay-listings', { headers: { 'Authorization': `Bearer ${ebayToken}` } }) : null
      ]);
      
      if (sxRes && !sxRes.ok) {
        console.error('[Sync] StockX error:', sxRes.status);
        showToast('StockX sync failed', 'error');
        setSyncing(false);
        return;
      }
      
      const sxData = sxRes ? await sxRes.json() : { listings: [] };
      const ebData = ebRes?.ok ? await ebRes.json() : { listings: [] };
      
      const sx = sxData.listings || [];
      const eb = ebData.listings || [];
      
      console.log('[Sync] Got', sx.length, 'StockX,', eb.length, 'eBay');
      
      setStockxListings(sx); 
      setEbayListings(eb);
      localStorage.setItem('fl_sx', JSON.stringify(sx)); 
      localStorage.setItem('fl_eb', JSON.stringify(eb));
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay`);
    } catch (e) { 
      console.error('[Sync] Error:', e);
      showToast('Sync failed', 'error'); 
    }
    finally { setSyncing(false); }
  }, [stockxToken, ebayToken, syncing]);

  // Fetch market data for selected product
  const fetchMarketData = useCallback(async (productId, variantIds) => {
    if (!stockxToken || !productId || !variantIds.length) return;
    setLoadingMarketData(true);
    try {
      const r = await fetch(`/api/stockx-listings?productId=${productId}&variantIds=${variantIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      if (r.ok) {
        const data = await r.json();
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
      const sku = l.sku || 'UNKNOWN';
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

  const totalNotLowest = useMemo(() => stockxListings.filter(l => l.lowestAsk && l.yourAsk > l.lowestAsk).length, [stockxListings]);
  const crosslistProducts = useMemo(() => { 
    const es = new Set(ebayListings.map(e => (e.sku || e.mpn || '').toLowerCase())); 
    return groupedProducts.filter(p => !es.has(p.sku.toLowerCase())); 
  }, [groupedProducts, ebayListings]);
  const totalCrosslist = crosslistProducts.reduce((s, p) => s + p.totalQty, 0);

  const filteredProducts = useMemo(() => { 
    let products = groupedProducts;
    if (subTab === 'reprice') {
      products = products.filter(p => p.notLowest > 0);
    } else if (subTab === 'crosslist') {
      products = crosslistProducts;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    return products;
  }, [groupedProducts, crosslistProducts, searchQuery, subTab]);

  const currentProduct = useMemo(() => groupedProducts.find(p => p.sku === selectedProduct), [groupedProducts, selectedProduct]);

  useEffect(() => { 
    if (filteredProducts.length && !selectedProduct) {
      setSelectedProduct(filteredProducts[0].sku);
    }
  }, [filteredProducts]);

  const handleSelectAll = () => { 
    if (!currentProduct) return; 
    setSelectedSizes(selectedSizes.size === currentProduct.sizes.length ? new Set() : new Set(currentProduct.sizes.map(s => s.listingId))); 
  };
  
  const handleUpdatePrices = async () => {
    const updates = Object.entries(editedPrices).map(([id, a]) => ({ listingId: id, amount: Math.round(parseFloat(a)) })).filter(x => x.amount > 0);
    if (!updates.length) return;
    setLoading(true);
    try {
      const r = await fetch('/api/stockx-listings', { method: 'PATCH', headers: { 'Authorization': `Bearer ${stockxToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: updates }) });
      if (r.ok) { 
        showToast(`Updated ${updates.length} prices`); 
        setEditedPrices({}); 
        await syncListings(); 
      } else {
        showToast('Update failed', 'error');
      }
    } catch (e) { 
      showToast('Update failed', 'error'); 
    }
    finally { setLoading(false); }
  };

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };
  const formatCost = (cost) => {
    if (!cost) return '—';
    if (typeof cost === 'string' && cost.includes('-')) return `$${cost}`;
    return `$${parseFloat(cost).toFixed(2)}`;
  };

  return (
    <div style={{ padding: 0, width: '100%', maxWidth: '100%' }}>
      {toast && <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000 }}>{toast.msg}</div>}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Listings</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="text" placeholder="Search SKU or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 200, fontSize: 13 }} />
          <button onClick={syncListings} disabled={syncing} style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {syncing ? '⏳' : '🔄'} Sync
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { id: 'reprice', label: '⚡ Reprice', count: totalNotLowest },
          { id: 'crosslist', label: '🚀 Cross-list', count: totalCrosslist },
          { id: 'all', label: '📦 All Listings', count: stockxListings.length }
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '10px 16px', background: subTab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${subTab === t.id ? c.gold : c.border}`, borderRadius: 8, color: subTab === t.id ? c.gold : c.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t.label} <span style={{ marginLeft: 6, opacity: 0.7 }}>{t.count}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* Products List */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filteredProducts.map(p => (
              <div key={p.sku} onClick={() => { 
                setSelectedProduct(p.sku); 
                setSelectedSizes(new Set()); 
                setEditedPrices({}); 
                if (p.productId) {
                  fetchMarketData(p.productId, p.sizes.map(s => s.variantId).filter(Boolean));
                }
              }} style={{ padding: '10px 14px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: selectedProduct === p.sku ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: selectedProduct === p.sku ? `3px solid ${c.gold}` : '3px solid transparent', display: 'flex', gap: 10, alignItems: 'center' }}>
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
            {!filteredProducts.length && <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'No listings'}</div>}
          </div>
        </div>

        {/* Product Detail */}
        <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {currentProduct ? (
            <>
              <div style={{ padding: '16px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>👟</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{currentProduct.name}</h3>
                  <div style={{ fontSize: 12, color: c.textMuted }}>
                    {currentProduct.sku}
                    {currentProduct.sizes[0]?.inventoryType === 'DIRECT' && <span style={{ marginLeft: 8, background: '#f97316', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🚀 Direct</span>}
                    {loadingMarketData && <span style={{ marginLeft: 8, color: c.gold }}>Loading prices...</span>}
                  </div>
                </div>
              </div>

              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${c.border}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: c.textMuted }}>
                  <input type="checkbox" checked={currentProduct.sizes.length > 0 && selectedSizes.size === currentProduct.sizes.length} onChange={handleSelectAll} style={{ accentColor: c.green }} />
                  Select all
                </label>
              </div>

              {/* Table Header */}
              <div style={{ display: 'flex', padding: '12px 16px', borderBottom: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, color: c.textMuted }}>
                <span style={{ width: 32 }}></span>
                <span style={{ width: 70 }}>SIZE</span>
                <span style={{ width: 70 }}>YOUR ASK</span>
                <span style={{ width: 70 }}>LOWEST</span>
                <span style={{ width: 60 }}>BID</span>
                <span style={{ width: 80 }}>SELL FASTER</span>
                <span style={{ width: 60 }}>COST</span>
                <span style={{ width: 60 }}>PROFIT</span>
              </div>

              {/* Table Rows */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 400 }}>
                {currentProduct.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const currentPrice = parseFloat(editedPrices[item.listingId] ?? item.yourAsk) || 0;
                  const channel = item.inventoryType || 'STANDARD';
                  const channelBadge = channel === 'DIRECT' ? { label: 'D', bg: '#f97316' } : channel === 'FLEX' ? { label: 'F', bg: '#8b5cf6' } : { label: 'S', bg: '#6b7280' };
                  const isLowest = item.lowestAsk && item.yourAsk <= item.lowestAsk;
                  
                  const costNum = typeof item.cost === 'string' ? parseFloat(item.cost.split('-')[0]) : item.cost;
                  const payout = currentPrice * 0.85;
                  const profit = costNum ? Math.round(payout - costNum) : null;

                  return (
                    <div key={item.listingId} style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ width: 32 }}>
                        <input type="checkbox" checked={selectedSizes.has(item.listingId)} onChange={e => { const n = new Set(selectedSizes); e.target.checked ? n.add(item.listingId) : n.delete(item.listingId); setSelectedSizes(n); }} style={{ accentColor: c.green }} />
                      </span>
                      <span style={{ width: 70, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {item.size}
                        <span style={{ background: channelBadge.bg, color: '#fff', fontSize: 9, padding: '2px 4px', borderRadius: 3 }}>{channelBadge.label}</span>
                      </span>
                      <span style={{ width: 70 }}>
                        <input type="number" value={editedPrices[item.listingId] ?? item.yourAsk} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} style={{ width: 54, padding: '5px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 6, color: c.text, textAlign: 'center' }} />
                      </span>
                      <span style={{ width: 70 }}>
                        {item.lowestAsk ? (
                          isLowest ? <span style={{ background: 'rgba(34,197,94,0.15)', padding: '4px 8px', borderRadius: 4, color: c.green, fontWeight: 700, fontSize: 11 }}>✓ YOU</span>
                          : <span style={{ fontWeight: 600 }}>${item.lowestAsk}</span>
                        ) : <span style={{ color: c.textMuted }}>—</span>}
                      </span>
                      <span style={{ width: 60 }}>
                        {item.highestBid ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} style={{ background: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: 4, padding: '4px 6px', color: c.green, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>${item.highestBid}</button> : '—'}
                      </span>
                      <span style={{ width: 80 }}>
                        {item.sellFaster ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} style={{ background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 4, padding: '4px 8px', color: '#f97316', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>${item.sellFaster}</button> : '—'}
                      </span>
                      <span style={{ width: 60, color: c.textMuted, fontSize: 12 }}>{formatCost(item.cost)}</span>
                      <span style={{ width: 60, color: profit > 0 ? c.green : profit < 0 ? c.red : c.textMuted, fontWeight: 600, fontSize: 12 }}>{profit !== null ? `$${profit}` : '—'}</span>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div style={{ padding: '14px 16px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                {selectedSizes.size > 0 && (
                  <>
                    <span style={{ fontSize: 12, color: c.textMuted }}>{selectedSizes.size} selected</span>
                    <button onClick={() => {
                      const newPrices = { ...editedPrices };
                      currentProduct.sizes.filter(s => selectedSizes.has(s.listingId) && s.sellFaster).forEach(s => { newPrices[s.listingId] = s.sellFaster; });
                      setEditedPrices(newPrices);
                    }} style={{ padding: '8px 12px', background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: 6, color: '#f97316', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Apply Sell Faster</button>
                  </>
                )}
                <button onClick={handleUpdatePrices} disabled={!Object.keys(editedPrices).length || loading} style={{ padding: '10px 20px', background: Object.keys(editedPrices).length ? c.green : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: Object.keys(editedPrices).length ? 'pointer' : 'not-allowed', marginLeft: 'auto' }}>{loading ? 'Updating...' : 'Update Prices'}</button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted }}>Select a product</div>
          )}
        </div>
      </div>
    </div>
  );
}
