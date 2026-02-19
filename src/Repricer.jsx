import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from './supabase';

// StockX fee rates by seller level (transaction fee + 3% payment processing)
const STOCKX_FEE_RATES = {
  1: 0.12,    // 9% + 3%
  2: 0.115,   // 8.5% + 3%
  3: 0.11,    // 8% + 3%
  4: 0.105,   // 7.5% + 3%
  5: 0.10,    // 7% + 3%
};
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
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState('beat');
  const [bulkEditAmount, setBulkEditAmount] = useState('');
  const [sellerLevel, setSellerLevel] = useState(() => {
    try { return parseInt(localStorage.getItem('fl_stockx_seller_level')) || 1; } catch { return 1; }
  });
  const [showLevelPicker, setShowLevelPicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('user_settings')
          .select('stockx_seller_level')
          .eq('user_id', user.id)
          .single();
        if (data?.stockx_seller_level) {
          setSellerLevel(data.stockx_seller_level);
          localStorage.setItem('fl_stockx_seller_level', data.stockx_seller_level);
        }
      } catch {}
    })();
  }, []);

  const saveSellerLevel = async (level) => {
    setSellerLevel(level);
    setShowLevelPicker(false);
    localStorage.setItem('fl_stockx_seller_level', level);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_settings').upsert({
        user_id: user.id,
        stockx_seller_level: level,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    } catch {}
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          if (s.lowestAsk && s.yourAsk > s.lowestAsk) newPrice = s.lowestAsk - 1;
          break;
        case 'match':
          if (s.lowestAsk && s.yourAsk > s.lowestAsk) newPrice = s.lowestAsk;
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
  // BULK EDIT - Apply to selected or all in current product
  // ============================================
  const applyBulkEdit = () => {
    if (!currentProduct) return;
    const amount = parseFloat(bulkEditAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newPrices = { ...editedPrices };
    const sizesToUpdate = selectedSizes.size > 0
      ? currentProduct.sizes.filter(s => selectedSizes.has(s.listingId))
      : currentProduct.sizes;

    sizesToUpdate.forEach(s => {
      let newPrice = null;
      switch (bulkEditMode) {
        case 'changeto':
          newPrice = amount;
          break;
        case 'decrease':
          if (s.yourAsk) newPrice = s.yourAsk - amount;
          break;
        case 'increase':
          if (s.yourAsk) newPrice = s.yourAsk + amount;
          break;
        case 'beat':
          if (s.lowestAsk && s.yourAsk > s.lowestAsk) newPrice = s.lowestAsk - amount;
          break;
      }
      if (newPrice !== null && newPrice > 0) {
        newPrices[s.listingId] = Math.round(newPrice);
      }
    });

    setEditedPrices(newPrices);
    setBulkEditOpen(false);
    setBulkEditAmount('');
    showToast(`Updated ${sizesToUpdate.length} prices`);
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

      {/* Bulk Edit Modal */}
      {bulkEditOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBulkEditOpen(false)}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, width: '90%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Bulk Edit</h3>
              <button onClick={() => setBulkEditOpen(false)} style={{ background: 'none', border: 'none', color: c.textMuted, fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 16 }}>
              {selectedSizes.size > 0 ? `Applying to ${selectedSizes.size} selected sizes` : `Applying to all ${currentProduct?.sizes?.length || 0} sizes in ${currentProduct?.name || 'product'}`}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { key: 'changeto', label: 'Change Price To' },
                { key: 'decrease', label: 'Decrease By' },
                { key: 'increase', label: 'Increase By' },
                { key: 'beat', label: 'Beat Lowest By' }
              ].map(m => (
                <button key={m.key} onClick={() => setBulkEditMode(m.key)}
                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: bulkEditMode === m.key ? `2px solid ${c.gold}` : `1px solid ${c.border}`, background: bulkEditMode === m.key ? 'rgba(201,169,98,0.15)' : 'rgba(255,255,255,0.05)', color: bulkEditMode === m.key ? c.gold : c.text }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: c.textMuted }}>$</span>
              <input type="number" value={bulkEditAmount} onChange={e => setBulkEditAmount(e.target.value)} placeholder="0"
                style={{ flex: 1, padding: '12px 16px', fontSize: 20, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setBulkEditOpen(false)}
                style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={applyBulkEdit}
                style={{ padding: '10px 24px', background: c.gold, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: bulkEditAmount ? 1 : 0.5 }}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Repricer</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>Stay competitive on StockX</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Seller Level Picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowLevelPicker(!showLevelPicker)}
              style={{ padding: '10px 14px', background: 'rgba(201,169,98,0.08)', border: '1px solid rgba(201,169,98,0.3)', borderRadius: 8, color: c.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              👤 Level {sellerLevel} <span style={{ color: c.textMuted, fontWeight: 400 }}>({(STOCKX_FEE_RATES[sellerLevel] * 100).toFixed(1)}%)</span> ▾
            </button>
            {showLevelPicker && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLevelPicker(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#1a1a1a', border: `1px solid ${c.border}`, borderRadius: 10, padding: 6, zIndex: 99, width: 260, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
                  <div style={{ padding: '8px 12px 6px', fontSize: 11, fontWeight: 700, color: c.textMuted, borderBottom: `1px solid ${c.border}` }}>StockX Seller Level</div>
                  {Object.entries(STOCKX_FEE_RATES).map(([lvl, rate]) => (
                    <button key={lvl} onClick={() => saveSellerLevel(Number(lvl))}
                      style={{ width: '100%', padding: '10px 12px', background: sellerLevel === Number(lvl) ? 'rgba(201,169,98,0.12)' : 'transparent', border: 'none', borderRadius: 6, color: c.text, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: sellerLevel === Number(lvl) ? c.gold : '#333', color: sellerLevel === Number(lvl) ? '#000' : c.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{lvl}</div>
                        <span style={{ fontWeight: 600 }}>Level {lvl}</span>
                      </div>
                      <span style={{ color: c.textMuted, fontSize: 11 }}>{(rate * 100).toFixed(1)}% total</span>
                    </button>
                  ))}
                  <div style={{ padding: '8px 12px', borderTop: `1px solid ${c.border}`, fontSize: 10, color: c.textMuted, lineHeight: 1.4 }}>
                    💡 Find your level at stockx.com/sell → Seller Dashboard
                  </div>
                </div>
              </>
            )}
          </div>
          <input type="text" placeholder="Search SKU..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 160 }} />
          <button onClick={syncStockX} disabled={syncing}
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL LISTINGS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>PRODUCTS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.products}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>NEED REPRICE</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.needsReprice > 0 ? c.gold : c.green }}>{stats.needsReprice}</div>
        </div>
      </div>

      {/* Save bar */}
      {changesCount > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 10, marginBottom: 12, padding: '12px 16px', background: 'rgba(6,6,6,0.95)', backdropFilter: 'blur(10px)', border: `1px solid ${c.gold}`, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: c.textMuted }}><span style={{ color: c.gold, fontWeight: 700 }}>{changesCount}</span> price change{changesCount !== 1 ? 's' : ''} pending</span>
          <button onClick={handleUpdatePrices} disabled={updating}
            style={{ padding: '10px 20px', background: c.gold, border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {updating ? '⏳ Saving...' : `💾 Save ${changesCount} Changes`}
          </button>
        </div>
      )}

      {/* Products label */}
      <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>PRODUCTS ({filteredProducts.length}) — click to expand</div>

      {/* No listings */}
      {filteredProducts.length === 0 && (
        <div style={{ ...card, padding: 50, textAlign: 'center', color: c.textMuted }}>
          {stats.total === 0 ? 'Click Sync to load StockX listings' : 'No matches'}
        </div>
      )}

      {/* Product Cards */}
      {filteredProducts.map(product => {
        const isExpanded = expandedProducts.has(product.sku);
        const isActive = currentProduct?.sku === product.sku;
        const sizeChips = [...new Set(product.sizes.map(s => s.size).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));

        return (
          <div key={product.sku} style={{ ...card, marginBottom: 10, overflow: 'hidden', borderColor: isExpanded ? 'rgba(201,169,98,0.3)' : c.border }}>
            {/* Product Header */}
            <div
              onClick={() => {
                setExpandedProducts(prev => {
                  const next = new Set(prev);
                  if (next.has(product.sku)) next.delete(product.sku); else next.add(product.sku);
                  return next;
                });
                setSelectedProduct(product.sku);
              }}
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{ fontSize: 11, color: c.textMuted, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
              <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                <div style={{ fontSize: 11, color: c.green, marginTop: 2 }}>{product.sku}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: c.textMuted }}><span style={{ fontWeight: 700, color: '#fff' }}>{product.totalQty}</span> listings</div>
                {product.needsReprice > 0
                  ? <div style={{ fontSize: 10, color: c.gold, fontWeight: 600 }}>{product.needsReprice} need reprice</div>
                  : product.sizes.some(s => s.lowestAsk) && <div style={{ fontSize: 10, color: c.green, fontWeight: 600 }}>✓ Competitive</div>
                }
              </div>
            </div>

            {/* Size chips when collapsed */}
            {!isExpanded && sizeChips.length > 0 && (
              <div style={{ padding: '0 16px 10px 62px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sizeChips.slice(0, 14).map(s => {
                  const sizeData = product.sizes.find(sz => sz.size === s);
                  const nr = sizeData && sizeData.lowestAsk && sizeData.yourAsk > sizeData.lowestAsk;
                  return <span key={s} style={{ padding: '2px 8px', background: nr ? 'rgba(201,169,98,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${nr ? 'rgba(201,169,98,0.3)' : c.border}`, borderRadius: 20, fontSize: 10, color: nr ? c.gold : c.textMuted }}>{s}</span>;
                })}
                {sizeChips.length > 14 && <span style={{ padding: '2px 8px', fontSize: 10, color: c.textMuted }}>+{sizeChips.length - 14} more</span>}
              </div>
            )}

            {/* Expanded */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${c.border}` }}>
                {loadingMarketData && isActive && (
                  <div style={{ padding: '8px 14px', background: 'rgba(201,169,98,0.05)', fontSize: 12, color: c.gold, textAlign: 'center' }}>⏳ Loading market data...</div>
                )}

                {/* Strategy buttons — same onClick handlers as original */}
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${c.border}` }}>
                  <button onClick={() => applyStrategy('beat')} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Beat Lowest (-$1)</button>
                  <button onClick={() => applyStrategy('match')} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Match Lowest</button>
                  {product.sizes.some(s => s.sellFaster) && (
                    <button onClick={() => applyStrategy('sellfast')} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Sell Fast</button>
                  )}
                  {product.sizes.some(s => s.highestBid) && (
                    <button onClick={() => applyStrategy('matchbid')} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: c.green, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Match Bid</button>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: c.textMuted }}>{selectedSizes.size > 0 && isActive ? `${selectedSizes.size} selected` : ''}</span>
                  <button onClick={() => { setSelectedProduct(product.sku); setBulkEditOpen(true); }} style={{ padding: '6px 12px', background: 'rgba(201,169,98,0.1)', border: '1px solid rgba(201,169,98,0.3)', borderRadius: 6, color: c.gold, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✏️ Bulk Edit</button>
                </div>

                {/* Table header */}
                {isMobile ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 40px 1fr 1fr 1fr', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${c.border}`, gap: 4 }}>
                    <span></span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted }}>SIZE</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>ASK</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>LOWEST</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PROFIT</span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '36px 50px 1fr 1fr 1fr 1fr 1fr 1fr', padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${c.border}`, gap: 8 }}>
                    <span></span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted }}>SIZE</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>YOUR ASK</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>LOWEST</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>BID</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>SELL FAST</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>COST</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: c.textMuted, textAlign: 'right' }}>PROFIT</span>
                  </div>
                )}

                {/* Size rows — same onChange/onClick as original table */}
                {product.sizes.map(item => {
                  const isEdited = editedPrices[item.listingId] !== undefined;
                  const currentPrice = isEdited ? editedPrices[item.listingId] : item.yourAsk;
                  const needsReprice = item.lowestAsk && item.yourAsk > item.lowestAsk;
                  const isSelected = selectedSizes.has(item.listingId);
                  const priceNum = parseFloat(currentPrice);
                  const feeMultiplier = 1 - (STOCKX_FEE_RATES[sellerLevel] || 0.12);
                  const displayProfit = item.cost && !isNaN(priceNum) && priceNum > 0 ? Math.round(priceNum * feeMultiplier - item.cost) : null;
                  const isRowExpanded = expandedRows.has(item.listingId);

                  return isMobile ? (
                    <div key={item.listingId} style={{ borderTop: `1px solid ${c.border}`, background: isSelected ? 'rgba(201,169,98,0.05)' : needsReprice ? 'rgba(201,169,98,0.03)' : 'transparent' }}>
                      {/* Mobile: 4 columns */}
                      <div
                        onClick={() => setExpandedRows(prev => { const next = new Set(prev); if (next.has(item.listingId)) next.delete(item.listingId); else next.add(item.listingId); return next; })}
                        style={{ display: 'grid', gridTemplateColumns: '28px 40px 1fr 1fr 1fr', padding: '10px 10px', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      >
                        <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSizeSelection(item.listingId); }} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.gold }} />
                        <div style={{ fontSize: 13, fontWeight: 700, color: needsReprice ? c.gold : item.lowestAsk && item.yourAsk <= item.lowestAsk ? c.green : '#fff' }}>{item.size}</div>
                        <div style={{ textAlign: 'right' }}>
                          <input type="number" value={currentPrice || ''} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })} onClick={e => e.stopPropagation()}
                            style={{ width: 60, padding: '4px 6px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 4, color: c.text, textAlign: 'right', fontSize: 13, fontWeight: 700 }} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {item.lowestAsk
                            ? <button onClick={(e) => { e.stopPropagation(); setEditedPrices({ ...editedPrices, [item.listingId]: item.lowestAsk - 1 }); }} style={{ ...priceButtonStyle(needsReprice ? c.gold : c.green), fontSize: 13 }}>${item.lowestAsk}</button>
                            : <span style={{ color: c.textMuted, fontSize: 12 }}>—</span>}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: displayProfit > 0 ? c.green : displayProfit < 0 ? c.red : c.textMuted }}>{displayProfit !== null ? `~$${displayProfit}` : '—'}</div>
                      </div>
                      {/* Mobile expanded: BID, SELL FAST, COST */}
                      {isRowExpanded && (
                        <div style={{ display: 'flex', gap: 16, padding: '6px 10px 10px 78px', background: 'rgba(255,255,255,0.02)' }}>
                          <div>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600 }}>BID</div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                              {item.highestBid
                                ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} style={{ ...priceButtonStyle(c.text), fontSize: 12, padding: '2px 4px' }}>${item.highestBid}</button>
                                : <span style={{ color: c.textMuted }}>—</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600 }}>SELL FAST</div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                              {item.sellFaster
                                ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} style={{ ...priceButtonStyle(c.green), fontSize: 12, padding: '2px 4px' }}>${item.sellFaster}</button>
                                : <span style={{ color: c.textMuted }}>—</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 8, color: c.textMuted, fontWeight: 600 }}>COST</div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: c.textMuted }}>{item.cost ? `$${item.cost}` : '—'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={item.listingId} style={{ display: 'grid', gridTemplateColumns: '36px 50px 1fr 1fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderTop: `1px solid ${c.border}`, alignItems: 'center', gap: 8, background: isSelected ? 'rgba(201,169,98,0.05)' : needsReprice ? 'rgba(201,169,98,0.03)' : 'transparent' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSizeSelection(item.listingId)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: c.gold }} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: needsReprice ? c.gold : item.lowestAsk && item.yourAsk <= item.lowestAsk ? c.green : '#fff' }}>{item.size}</div>
                      <div style={{ textAlign: 'right' }}>
                        <input type="number" value={currentPrice || ''} onChange={e => setEditedPrices({ ...editedPrices, [item.listingId]: e.target.value })}
                          style={{ width: 75, padding: '5px 8px', background: isEdited ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEdited ? c.gold : c.border}`, borderRadius: 4, color: c.text, textAlign: 'right', fontSize: 13, fontWeight: 700 }} />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {item.lowestAsk
                          ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.lowestAsk - 1 })} style={{ ...priceButtonStyle(needsReprice ? c.gold : c.green) }}>${item.lowestAsk}</button>
                          : <span style={{ color: c.textMuted }}>—</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {item.highestBid
                          ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.highestBid })} style={{ ...priceButtonStyle(c.text) }}>${item.highestBid}</button>
                          : <span style={{ color: c.textMuted }}>—</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {item.sellFaster
                          ? <button onClick={() => setEditedPrices({ ...editedPrices, [item.listingId]: item.sellFaster })} style={{ ...priceButtonStyle(c.green) }}>${item.sellFaster}</button>
                          : <span style={{ color: c.textMuted }}>—</span>}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: c.textMuted }}>{item.cost ? `$${item.cost}` : '—'}</div>
                      <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: displayProfit > 0 ? c.green : displayProfit < 0 ? c.red : c.textMuted }}>{displayProfit !== null ? `~$${displayProfit}` : '—'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
