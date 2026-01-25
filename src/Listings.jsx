/**
 * FLIPLEDGER LISTINGS TAB - REAL API INTEGRATION
 * ==============================================
 * Connects to /api/stockx-listings and /api/ebay-listings
 * Cost lookup from FlipLedger purchases inventory
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
    yellow: '#f59e0b',
    orange: '#f97316',
    blue: '#3b82f6',
    stockxGreen: '#08a05c',
  }
}) {
  const [subTab, setSubTab] = useState('reprice');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Raw data from APIs
  const [stockxListings, setStockxListings] = useState([]);
  const [ebayListings, setEbayListings] = useState([]);
  
  // Selection states
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [selectedCrosslist, setSelectedCrosslist] = useState(new Set());
  const [selectedAllListing, setSelectedAllListing] = useState(null);
  const [allListingsFilter, setAllListingsFilter] = useState('all');
  
  // Edited prices
  const [editedPrices, setEditedPrices] = useState({});
  
  // Toast
  const [toast, setToast] = useState(null);

  // Logos
  const StockXLogo = ({ size = 20 }) => (
    <div style={{ width: size, height: size, background: c.stockxGreen, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: size * 0.6, color: '#fff' }}>X</div>
  );
  
  const EbayLogo = ({ size = 20 }) => (
    <div style={{ width: size + 8, height: size, background: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.55, padding: '0 2px' }}>
      <span style={{ color: '#e53238' }}>e</span>
      <span style={{ color: '#0064d2' }}>b</span>
      <span style={{ color: '#f5af02' }}>a</span>
      <span style={{ color: '#86b817' }}>y</span>
    </div>
  );

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Cost lookup from FlipLedger inventory
  const getCost = useCallback((sku, size) => {
    if (!purchases || purchases.length === 0) return null;
    const match = purchases.find(p => 
      (p.sku || '').toLowerCase() === (sku || '').toLowerCase() &&
      (p.size || '').toString() === (size || '').toString() &&
      !p.sold
    );
    return match ? parseFloat(match.cost) || null : null;
  }, [purchases]);

  // ============================================
  // FETCH STOCKX LISTINGS
  // ============================================
  const fetchStockXListings = useCallback(async () => {
    if (!stockxToken) return [];
    
    try {
      const res = await fetch('/api/stockx-listings', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch StockX listings');
      }
      
      const data = await res.json();
      return data.listings || [];
    } catch (e) {
      console.error('[StockX] Fetch error:', e.message);
      return [];
    }
  }, [stockxToken]);

  // ============================================
  // FETCH EBAY LISTINGS
  // ============================================
  const fetchEbayListings = useCallback(async () => {
    if (!ebayToken) return [];
    
    try {
      const res = await fetch('/api/ebay-listings', {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch eBay listings');
      }
      
      const data = await res.json();
      return data.listings || [];
    } catch (e) {
      console.error('[eBay] Fetch error:', e.message);
      return [];
    }
  }, [ebayToken]);

  // ============================================
  // SYNC ALL LISTINGS
  // ============================================
  const syncListings = useCallback(async () => {
    setSyncing(true);
    
    try {
      const [sx, eb] = await Promise.all([
        fetchStockXListings(),
        fetchEbayListings()
      ]);
      
      setStockxListings(sx);
      setEbayListings(eb);
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay listings`);
    } catch (e) {
      showToast('Sync failed: ' + e.message, 'error');
    }
    
    setSyncing(false);
  }, [fetchStockXListings, fetchEbayListings, showToast]);

  // Initial fetch
  useEffect(() => {
    syncListings();
  }, []);

  // ============================================
  // PROCESS DATA FOR REPRICE TAB
  // Group StockX listings by SKU
  // ============================================
  const repriceProducts = useMemo(() => {
    const grouped = {};
    
    stockxListings.forEach(listing => {
      const sku = listing.sku || 'UNKNOWN';
      
      if (!grouped[sku]) {
        grouped[sku] = {
          sku,
          name: listing.name,
          image: listing.image,
          channel: listing.inventoryType === 'DIRECT' ? 'direct' : 'standard',
          totalQty: 0,
          sizes: []
        };
      }
      
      const isLowest = listing.lowestAsk && listing.yourAsk <= listing.lowestAsk;
      
      grouped[sku].sizes.push({
        size: listing.size,
        qty: 1,
        listingId: listing.listingId,
        yourAsk: listing.yourAsk,
        lowest: listing.lowestAsk,
        sellFaster: listing.sellFaster,
        earnMore: listing.earnMore,
        daysListed: listing.daysListed,
        isLowest
      });
      grouped[sku].totalQty++;
    });
    
    // Sort sizes within each product
    Object.values(grouped).forEach(product => {
      product.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
    });
    
    return Object.values(grouped);
  }, [stockxListings]);

  // ============================================
  // PROCESS DATA FOR CROSS-LIST TAB
  // StockX items NOT on eBay
  // ============================================
  const crosslistProducts = useMemo(() => {
    // Get set of eBay SKUs (normalize)
    const ebaySKUs = new Set(
      ebayListings.map(l => (l.mpn || l.sku || '').toLowerCase().split('-')[0])
    );
    
    // Filter StockX products not on eBay
    return repriceProducts.filter(p => !ebaySKUs.has(p.sku.toLowerCase()));
  }, [repriceProducts, ebayListings]);

  // ============================================
  // PROCESS DATA FOR ALL LISTINGS TAB
  // Merge StockX + eBay by SKU
  // ============================================
  const allListingsProducts = useMemo(() => {
    const merged = {};
    
    // Add StockX listings
    stockxListings.forEach(listing => {
      const sku = listing.sku || 'UNKNOWN';
      
      if (!merged[sku]) {
        merged[sku] = {
          sku,
          name: listing.name,
          image: listing.image,
          onStockX: true,
          onEbay: false,
          totalQty: 0,
          sizes: {}
        };
      }
      
      if (!merged[sku].sizes[listing.size]) {
        merged[sku].sizes[listing.size] = {
          size: listing.size,
          qty: 0,
          stockxPrice: null,
          ebayPrice: null,
          stockxListingId: null,
          ebayOfferId: null
        };
      }
      
      merged[sku].sizes[listing.size].qty++;
      merged[sku].sizes[listing.size].stockxPrice = listing.yourAsk;
      merged[sku].sizes[listing.size].stockxListingId = listing.listingId;
      merged[sku].totalQty++;
    });
    
    // Add eBay listings
    ebayListings.forEach(listing => {
      const sku = (listing.mpn || listing.sku || '').split('-')[0];
      const size = listing.size;
      
      if (!merged[sku]) {
        merged[sku] = {
          sku,
          name: listing.title,
          image: listing.image,
          onStockX: false,
          onEbay: true,
          totalQty: 0,
          sizes: {}
        };
      }
      
      merged[sku].onEbay = true;
      
      if (!merged[sku].sizes[size]) {
        merged[sku].sizes[size] = {
          size,
          qty: 0,
          stockxPrice: null,
          ebayPrice: null,
          stockxListingId: null,
          ebayOfferId: null
        };
      }
      
      merged[sku].sizes[size].ebayPrice = listing.price;
      merged[sku].sizes[size].ebayOfferId = listing.offerId;
      if (!merged[sku].sizes[size].stockxPrice) {
        merged[sku].sizes[size].qty = listing.quantity;
        merged[sku].totalQty += listing.quantity;
      }
    });
    
    // Convert sizes object to array
    return Object.values(merged).map(p => ({
      ...p,
      sizes: Object.values(p.sizes).sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [stockxListings, ebayListings]);

  // ============================================
  // GET CURRENT SELECTED PRODUCTS
  // ============================================
  const currentProduct = repriceProducts.find(p => p.sku === selectedProduct);
  const currentAllListing = allListingsProducts.find(p => p.sku === selectedAllListing);

  // Auto-select first product
  useEffect(() => {
    if (repriceProducts.length > 0 && !selectedProduct) {
      setSelectedProduct(repriceProducts[0].sku);
    }
  }, [repriceProducts, selectedProduct]);

  useEffect(() => {
    if (allListingsProducts.length > 0 && !selectedAllListing) {
      setSelectedAllListing(allListingsProducts[0].sku);
    }
  }, [allListingsProducts, selectedAllListing]);

  // ============================================
  // SELECTION HANDLERS
  // ============================================
  const toggleSize = (sku, size) => {
    const key = `${sku}-${size}`;
    const newSet = new Set(selectedSizes);
    newSet.has(key) ? newSet.delete(key) : newSet.add(key);
    setSelectedSizes(newSet);
  };

  const selectAllSizes = () => {
    if (!currentProduct) return;
    const newSet = new Set(selectedSizes);
    const allSelected = currentProduct.sizes.every(s => selectedSizes.has(`${currentProduct.sku}-${s.size}`));
    currentProduct.sizes.forEach(s => {
      const key = `${currentProduct.sku}-${s.size}`;
      allSelected ? newSet.delete(key) : newSet.add(key);
    });
    setSelectedSizes(newSet);
  };

  const selectedCount = currentProduct 
    ? currentProduct.sizes.filter(s => selectedSizes.has(`${currentProduct.sku}-${s.size}`)).length 
    : 0;

  const toggleCrosslist = (sku) => {
    const newSet = new Set(selectedCrosslist);
    newSet.has(sku) ? newSet.delete(sku) : newSet.add(sku);
    setSelectedCrosslist(newSet);
  };

  // Profit color
  const getProfitColor = (profit) => {
    if (profit >= 20) return c.green;
    if (profit >= 10) return c.yellow;
    if (profit >= 0) return c.orange;
    return c.red;
  };

  // Price editing
  const handlePriceEdit = (sku, size, value) => {
    setEditedPrices(prev => ({ ...prev, [`${sku}-${size}`]: value }));
  };

  // ============================================
  // BEAT SELECTED (Reprice to $1 below lowest)
  // ============================================
  const handleBeatSelected = async () => {
    if (!currentProduct || selectedCount === 0 || !stockxToken) return;
    
    setLoading(true);
    
    // Build update items
    const items = currentProduct.sizes
      .filter(s => selectedSizes.has(`${currentProduct.sku}-${s.size}`) && s.lowest > 0)
      .map(s => ({
        listingId: s.listingId,
        amount: s.lowest - 1
      }));
    
    if (items.length === 0) {
      showToast('No listings to update', 'error');
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch('/api/stockx-listings', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${stockxToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        showToast(`Beat ${items.length} listings by $1`);
        setSelectedSizes(new Set());
        // Refresh listings
        setTimeout(syncListings, 1000);
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch (e) {
      showToast('Update failed: ' + e.message, 'error');
    }
    
    setLoading(false);
  };

  // ============================================
  // UPDATE PRICES (Save edited prices)
  // ============================================
  const handleUpdatePrices = async () => {
    if (!currentProduct || !stockxToken) return;
    
    // Get edited prices for this product
    const items = currentProduct.sizes
      .filter(s => editedPrices[`${currentProduct.sku}-${s.size}`] !== undefined)
      .map(s => ({
        listingId: s.listingId,
        amount: editedPrices[`${currentProduct.sku}-${s.size}`]
      }));
    
    if (items.length === 0) {
      showToast('No prices changed', 'error');
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await fetch('/api/stockx-listings', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${stockxToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        showToast(`Updated ${items.length} prices`);
        setEditedPrices({});
        setTimeout(syncListings, 1000);
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch (e) {
      showToast('Update failed: ' + e.message, 'error');
    }
    
    setLoading(false);
  };

  // ============================================
  // CROSS-LIST TO EBAY
  // ============================================
  const handleCrosslistToEbay = async () => {
    if (selectedCrosslist.size === 0 || !ebayToken) return;
    
    setLoading(true);
    
    // Build products array for cross-listing
    const products = crosslistProducts
      .filter(p => selectedCrosslist.has(p.sku))
      .map(p => ({
        sku: p.sku,
        name: p.name,
        image: p.image,
        sizes: p.sizes.map(s => ({
          size: s.size,
          qty: s.qty,
          price: s.lowest || s.yourAsk
        }))
      }));
    
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ebayToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ products })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showToast(`Created ${data.created} eBay listings${data.failed ? `, ${data.failed} failed` : ''}`);
        setSelectedCrosslist(new Set());
        setTimeout(syncListings, 1000);
      } else {
        showToast(data.error || 'Cross-list failed', 'error');
      }
    } catch (e) {
      showToast('Cross-list failed: ' + e.message, 'error');
    }
    
    setLoading(false);
  };

  // ============================================
  // FILTERS
  // ============================================
  const filterBySearch = (products) => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  };

  const filterAllListings = (products) => {
    let filtered = filterBySearch(products);
    if (allListingsFilter === 'crosslisted') return filtered.filter(p => p.onStockX && p.onEbay);
    if (allListingsFilter === 'stockxOnly') return filtered.filter(p => p.onStockX && !p.onEbay);
    if (allListingsFilter === 'ebayOnly') return filtered.filter(p => !p.onStockX && p.onEbay);
    return filtered;
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ background: c.bg, minHeight: '100%', fontFamily: "'Inter', -apple-system, sans-serif", color: c.text }}>
      
      {/* HEADER */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input placeholder="Search SKU or name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 240, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, fontSize: 14, outline: 'none' }} />
          <button onClick={syncListings} disabled={syncing} style={{ padding: '12px 20px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, cursor: syncing ? 'wait' : 'pointer', fontSize: 14, opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: c.textMuted }}>
          {stockxListings.length} StockX • {ebayListings.length} eBay
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[
          { key: 'reprice', label: '⚡ Reprice', count: repriceProducts.reduce((sum, p) => sum + p.sizes.filter(s => !s.isLowest).length, 0), color: c.gold },
          { key: 'crosslist', label: '📤 Cross-list', count: crosslistProducts.length, color: c.blue },
          { key: 'all', label: '📋 All Listings', count: stockxListings.length + ebayListings.length, color: c.text },
        ].map(tab => (
          <button key={tab.key} onClick={() => setSubTab(tab.key)} style={{ padding: '12px 24px', background: subTab === tab.key ? c.card : 'transparent', border: `1px solid ${subTab === tab.key ? c.border : 'transparent'}`, borderRadius: 10, color: subTab === tab.key ? tab.color : c.textMuted, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {tab.label} <span style={{ marginLeft: 6, opacity: 0.7 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* REPRICE TAB */}
      {subTab === 'reprice' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, fontSize: 12, color: c.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Products ({filterBySearch(repriceProducts).length})</div>
              <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {filterBySearch(repriceProducts).map((product) => {
                  const isSelected = selectedProduct === product.sku;
                  const notLowestCount = product.sizes.filter(s => !s.isLowest).length;
                  return (
                    <div key={product.sku} onClick={() => { setSelectedProduct(product.sku); setSelectedSizes(new Set()); }} style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, background: isSelected ? 'rgba(201,169,98,0.1)' : 'transparent', borderLeft: isSelected ? `3px solid ${c.gold}` : '3px solid transparent', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, overflow: 'hidden' }}>
                          {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                          <div style={{ fontSize: 11, color: c.textMuted }}>{product.sku}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Qty: {product.totalQty}</div>
                          {notLowestCount > 0 && <div style={{ fontSize: 10, color: c.gold, marginTop: 2 }}>{notLowestCount} not lowest</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filterBySearch(repriceProducts).length === 0 && (
                  <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
                    {syncing ? 'Loading...' : 'No StockX listings found'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {currentProduct ? (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden' }}>
                      {currentProduct.image ? <img src={currentProduct.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{currentProduct.name}</div>
                      <div style={{ fontSize: 13, color: c.textMuted }}>{currentProduct.sku} • <span style={{ color: currentProduct.channel === 'direct' ? c.gold : c.textMuted }}>{currentProduct.channel === 'direct' ? '🚀 Direct' : 'Standard'}</span></div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: c.textMuted }}>Total Items</div>
                    <div style={{ fontWeight: 700, fontSize: 24 }}>{currentProduct.totalQty}</div>
                  </div>
                </div>

                <div style={{ padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: selectedCount > 0 ? 'rgba(201,169,98,0.05)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="checkbox" checked={selectedCount === currentProduct.sizes.length && currentProduct.sizes.length > 0} onChange={selectAllSizes} style={{ width: 18, height: 18, accentColor: c.gold, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, color: selectedCount > 0 ? c.gold : c.textMuted }}>{selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}</span>
                  </div>
                  {selectedCount > 0 && <button onClick={handleBeatSelected} disabled={loading} style={{ padding: '10px 24px', background: c.gold, border: 'none', borderRadius: 8, color: '#000', cursor: loading ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>⚡ Beat Selected ({selectedCount})</button>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '40px 70px 60px 100px 110px 100px 90px 80px 80px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase' }}>
                  <div></div><div>Size</div><div style={{ textAlign: 'center' }}>Qty</div><div style={{ textAlign: 'right' }}>Your Ask</div><div style={{ textAlign: 'right' }}>Lowest Ask</div><div style={{ textAlign: 'right' }}>Sell Faster</div><div style={{ textAlign: 'right' }}>Cost</div><div style={{ textAlign: 'right' }}>Profit</div><div style={{ textAlign: 'center' }}>Days</div>
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {currentProduct.sizes.map((s) => {
                    const key = `${currentProduct.sku}-${s.size}`;
                    const isSelected = selectedSizes.has(key);
                    const editedPrice = editedPrices[key];
                    const displayPrice = editedPrice !== undefined ? editedPrice : s.yourAsk;
                    const cost = getCost(currentProduct.sku, s.size);
                    const costDisplay = cost !== null ? `$${cost}` : '—';
                    const payout = s.lowest > 0 ? (s.lowest - 1) * 0.88 : 0;
                    const profit = cost !== null && s.lowest > 0 ? Math.round(payout - cost) : null;

                    return (
                      <div key={key} style={{ display: 'grid', gridTemplateColumns: '40px 70px 60px 100px 110px 100px 90px 80px 80px', padding: '14px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13, background: isSelected ? 'rgba(201,169,98,0.05)' : 'transparent' }}>
                        <div><input type="checkbox" checked={isSelected} onChange={() => toggleSize(currentProduct.sku, s.size)} style={{ width: 16, height: 16, accentColor: c.gold, cursor: 'pointer' }} /></div>
                        <div style={{ fontWeight: 600 }}>{s.size}</div>
                        <div style={{ textAlign: 'center' }}>{s.qty > 1 ? <span style={{ background: 'rgba(201,169,98,0.2)', color: c.gold, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>x{s.qty}</span> : s.qty}</div>
                        <div style={{ textAlign: 'right' }}><input type="number" value={displayPrice} onChange={(e) => handlePriceEdit(currentProduct.sku, s.size, parseFloat(e.target.value) || 0)} style={{ width: 70, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${editedPrice !== undefined ? c.gold : c.border}`, borderRadius: 6, color: c.text, fontSize: 13, textAlign: 'right', outline: 'none' }} /></div>
                        <div style={{ textAlign: 'right', fontWeight: 600, color: s.isLowest ? c.green : c.gold }}>{s.lowest ? `$${s.lowest}` : '—'} {s.isLowest && <span style={{ color: c.green }}>✓</span>}</div>
                        <div style={{ textAlign: 'right', color: c.blue, fontWeight: 500 }}>{s.sellFaster ? `$${s.sellFaster}` : '—'}</div>
                        <div style={{ textAlign: 'right', color: c.textMuted }}>{costDisplay}</div>
                        <div style={{ textAlign: 'right', fontWeight: 700, color: profit !== null ? getProfitColor(profit) : c.textMuted }}>{profit !== null ? `$${profit}` : '—'}</div>
                        <div style={{ textAlign: 'center', color: c.textMuted }}>{s.daysListed}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 12 }}>
                  <button onClick={handleUpdatePrices} disabled={loading} style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', cursor: loading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1 }}>Update Prices</button>
                  <button style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, cursor: 'pointer', fontSize: 13 }}>Unlist Selected</button>
                </div>
              </div>
            ) : <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'Select a product'}</div>}
          </div>
        </div>
      )}

      {/* CROSS-LIST TAB */}
      {subTab === 'crosslist' && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${c.border}`, background: selectedCrosslist.size > 0 ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
            <span style={{ fontSize: 13, color: selectedCrosslist.size > 0 ? c.blue : c.textMuted, fontWeight: 600 }}>{selectedCrosslist.size > 0 ? `${selectedCrosslist.size} products selected` : 'Select products to cross-list to eBay'}</span>
            {selectedCrosslist.size > 0 && <button onClick={handleCrosslistToEbay} disabled={loading} style={{ padding: '10px 24px', background: c.blue, border: 'none', borderRadius: 8, color: '#fff', cursor: loading ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}><EbayLogo size={16} /> List on eBay ({selectedCrosslist.size})</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 200px 100px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase' }}>
            <div></div><div>Product</div><div>Sizes</div><div style={{ textAlign: 'right' }}>Total</div>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
            {filterBySearch(crosslistProducts).length > 0 ? filterBySearch(crosslistProducts).map((product) => {
              const isSelected = selectedCrosslist.has(product.sku);
              return (
                <div key={product.sku} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 200px 100px', padding: '16px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                  <div><input type="checkbox" checked={isSelected} onChange={() => toggleCrosslist(product.sku)} style={{ width: 18, height: 18, accentColor: c.blue, cursor: 'pointer' }} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, overflow: 'hidden' }}>
                      {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{product.name}</div>
                      <div style={{ fontSize: 12, color: c.textMuted }}>{product.sku}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {product.sizes.map((s, i) => <span key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 6, fontSize: 12, color: c.textMuted }}>{s.size} {s.qty > 1 && <span style={{ color: c.gold }}>x{s.qty}</span>}</span>)}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{product.totalQty}</div>
                </div>
              );
            }) : (
              <div style={{ padding: 60, textAlign: 'center', color: c.textMuted }}>
                {syncing ? 'Loading...' : crosslistProducts.length === 0 ? 'All StockX items are already on eBay! 🎉' : 'No matches found'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ALL LISTINGS TAB */}
      {subTab === 'all' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 6, padding: '12px 14px', borderBottom: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
                {[{ key: 'all', label: 'All' }, { key: 'crosslisted', label: 'Both', icon: 'both' }, { key: 'stockxOnly', label: 'StockX', icon: 'stockx' }, { key: 'ebayOnly', label: 'eBay', icon: 'ebay' }].map(f => (
                  <button key={f.key} onClick={() => setAllListingsFilter(f.key)} style={{ padding: '6px 10px', background: allListingsFilter === f.key ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${allListingsFilter === f.key ? c.textMuted : c.border}`, borderRadius: 6, color: allListingsFilter === f.key ? c.text : c.textMuted, cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {f.icon === 'both' && <><StockXLogo size={12} /><EbayLogo size={12} /></>}
                    {f.icon === 'stockx' && <StockXLogo size={12} />}
                    {f.icon === 'ebay' && <EbayLogo size={12} />}
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${c.border}`, fontSize: 11, color: c.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Products ({filterAllListings(allListingsProducts).length})</div>
              <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                {filterAllListings(allListingsProducts).map((product) => {
                  const isSelected = selectedAllListing === product.sku;
                  return (
                    <div key={product.sku} onClick={() => setSelectedAllListing(product.sku)} style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: isSelected ? `3px solid ${c.text}` : '3px solid transparent', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, overflow: 'hidden' }}>
                          {product.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                          <div style={{ fontSize: 11, color: c.textMuted }}>{product.sku}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {product.onStockX && <StockXLogo size={16} />}
                          {product.onEbay && <EbayLogo size={16} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {currentAllListing ? (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden' }}>
                      {currentAllListing.image ? <img src={currentAllListing.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👟'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{currentAllListing.name}</div>
                      <div style={{ fontSize: 13, color: c.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>{currentAllListing.sku} <span style={{ display: 'flex', gap: 4 }}>{currentAllListing.onStockX && <StockXLogo size={16} />}{currentAllListing.onEbay && <EbayLogo size={16} />}</span></div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: c.textMuted }}>Total Items</div>
                    <div style={{ fontWeight: 700, fontSize: 24 }}>{currentAllListing.totalQty}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 120px 120px 100px', padding: '12px 20px', borderBottom: `1px solid ${c.border}`, background: 'rgba(255,255,255,0.02)', fontSize: 10, fontWeight: 600, color: c.textMuted, textTransform: 'uppercase' }}>
                  <div>Size</div><div style={{ textAlign: 'center' }}>Qty</div><div style={{ textAlign: 'right' }}>StockX</div><div style={{ textAlign: 'right' }}>eBay</div><div style={{ textAlign: 'center' }}>Platforms</div>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {currentAllListing.sizes.map((s, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 60px 120px 120px 100px', padding: '14px 20px', borderBottom: `1px solid ${c.border}`, alignItems: 'center', fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{s.size}</div>
                      <div style={{ textAlign: 'center' }}>{s.qty > 1 ? <span style={{ background: 'rgba(201,169,98,0.2)', color: c.gold, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>x{s.qty}</span> : s.qty}</div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>{s.stockxPrice ? `$${s.stockxPrice}` : <span style={{ color: c.textMuted }}>—</span>}</div>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>{s.ebayPrice ? `$${s.ebayPrice}` : <span style={{ color: c.textMuted }}>—</span>}</div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>{s.stockxPrice && <StockXLogo size={18} />}{s.ebayPrice && <EbayLogo size={18} />}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: c.textMuted }}>{currentAllListing.sizes.length} sizes • {currentAllListing.totalQty} items</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {!currentAllListing.onEbay && <button onClick={() => { setSelectedCrosslist(new Set([currentAllListing.sku])); setSubTab('crosslist'); }} style={{ padding: '10px 20px', background: c.blue, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><EbayLogo size={14} /> Cross-list</button>}
                    <button style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, cursor: 'pointer', fontSize: 13 }}>Edit Prices</button>
                  </div>
                </div>
              </div>
            ) : <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: c.textMuted }}>{syncing ? 'Loading...' : 'Select a product'}</div>}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: `1px solid rgba(16,185,129,0.2)`, borderRadius: 8 }}>
          <span>🔄</span><span style={{ fontSize: 12, color: c.green }}>Auto-Delist Active</span>
        </div>
        <div style={{ fontSize: 12, color: c.textMuted }}>Profit: <span style={{ color: c.green }}>$20+</span> • <span style={{ color: c.yellow }}>$10-20</span> • <span style={{ color: c.orange }}>$0-10</span> • <span style={{ color: c.red }}>Loss</span></div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '16px 24px', borderRadius: 12, background: c.card, border: `1px solid ${toast.type === 'error' ? c.red : c.green}`, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>{toast.type === 'error' ? '❌' : '✓'}</span>
          <span style={{ color: toast.type === 'error' ? c.red : c.green, fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
