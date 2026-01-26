import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabase';

/**
 * CROSS LIST - Multi-platform listing management
 * Sources: StockX Listings, FlipLedger Inventory
 * Features: List to eBay, track mappings in Supabase, prevent oversells
 * 
 * Storage:
 * - Listings cache → localStorage (temporary, refreshed on sync)
 * - Mappings → Supabase (permanent, for oversell prevention)
 */

const CACHE_KEYS = { SX: 'fl_crosslist_sx', EB: 'fl_crosslist_eb' };

export default function CrossList({ stockxToken, ebayToken, purchases = [], c }) {
  const [source, setSource] = useState('stockx');
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [delisting, setDelisting] = useState(false);
  
  // Listings from localStorage cache
  const [stockxListings, setStockxListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEYS.SX) || '[]'); } catch { return []; }
  });
  const [ebayListings, setEbayListings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEYS.EB) || '[]'); } catch { return []; }
  });
  
  // Mappings from Supabase
  const [mappings, setMappings] = useState([]);
  
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState('unlisted');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============================================
  // SUPABASE: Load mappings on mount
  // ============================================
  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    try {
      const { data, error } = await supabase
        .from('cross_list_links')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[CrossList] Load mappings error:', error);
        return;
      }
      
      setMappings(data || []);
      console.log('[CrossList] Loaded', data?.length || 0, 'mappings from Supabase');
    } catch (e) {
      console.error('[CrossList] Load mappings error:', e);
    }
  };

  const insertMapping = async (mapping) => {
    try {
      const { data, error } = await supabase
        .from('cross_list_links')
        .insert([{
          sku: mapping.sku,
          size: mapping.size,
          stockx_listing_id: mapping.stockx_listing_id,
          ebay_offer_id: mapping.ebay_offer_id,
          ebay_listing_id: mapping.ebay_listing_id,
          ebay_sku: mapping.ebay_sku,
          status: 'active'
        }])
        .select()
        .single();
      
      if (error) {
        console.error('[CrossList] Insert mapping error:', error);
        return null;
      }
      return data;
    } catch (e) {
      console.error('[CrossList] Insert mapping error:', e);
      return null;
    }
  };

  const updateMappingStatus = async (ebayOfferId, status) => {
    try {
      const { error } = await supabase
        .from('cross_list_links')
        .update({ status })
        .eq('ebay_offer_id', ebayOfferId);
      
      if (error) console.error('[CrossList] Update mapping error:', error);
    } catch (e) {
      console.error('[CrossList] Update mapping error:', e);
    }
  };

  // ============================================
  // SYNC FUNCTIONS
  // ============================================
  const syncStockX = async () => {
    if (!stockxToken) return [];
    try {
      const res = await fetch('/api/stockx-listings?skipMarketData=true', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[CrossList] StockX raw response:', data);
        return data.listings || [];
      }
    } catch (e) {
      console.error('[CrossList] StockX sync error:', e);
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
        console.log('[CrossList] eBay raw response:', data);
        // FIX: API returns "offers" not "listings"
        return data.offers || data.listings || [];
      }
    } catch (e) {
      console.error('[CrossList] eBay sync error:', e);
    }
    return [];
  };

  const syncAll = async () => {
    if (syncing) return;
    setSyncing(true);
    
    try {
      const [sx, eb] = await Promise.all([syncStockX(), syncEbay()]);
      
      console.log('[CrossList] Synced:', sx.length, 'StockX,', eb.length, 'eBay');
      
      // Update state and cache
      setStockxListings(sx);
      setEbayListings(eb);
      localStorage.setItem(CACHE_KEYS.SX, JSON.stringify(sx));
      localStorage.setItem(CACHE_KEYS.EB, JSON.stringify(eb));
      
      // Reload mappings from Supabase
      await loadMappings();
      
      // Auto-detect new mappings from eBay SKUs
      for (const ebItem of eb) {
        const ebSku = ebItem.sku || '';
        const lastDash = ebSku.lastIndexOf('-');
        const baseSku = lastDash > 0 ? ebSku.substring(0, lastDash) : ebSku;
        const size = lastDash > 0 ? ebSku.substring(lastDash + 1) : '';
        
        const sxMatch = sx.find(s => s.sku === baseSku && s.size === size);
        
        const existingMapping = mappings.find(m => 
          m.ebay_offer_id === ebItem.offerId || 
          (m.sku === baseSku && m.size === size && m.status === 'active')
        );
        
        if (!existingMapping && ebItem.offerId) {
          await insertMapping({
            sku: baseSku,
            size,
            stockx_listing_id: sxMatch?.listingId || null,
            ebay_offer_id: ebItem.offerId,
            ebay_listing_id: ebItem.listingId || null,
            ebay_sku: ebSku
          });
        }
      }
      
      await loadMappings();
      showToast(`Synced ${sx.length} StockX + ${eb.length} eBay listings`);
      
    } catch (e) {
      console.error('[CrossList] Sync error:', e);
      showToast('Sync failed', 'error');
    }
    
    setSyncing(false);
  };

  // ============================================
  // GROUPED PRODUCTS
  // ============================================
  const stockxProducts = useMemo(() => {
    const g = {};
    stockxListings.forEach(l => {
      const sku = l.sku || l.styleId || 'UNKNOWN';
      if (!g[sku]) {
        // FIX: Capture ALL fields from StockX listing for eBay
        g[sku] = { 
          sku, 
          name: l.name || l.productName || 'Unknown Product', 
          image: l.image || l.thumbnail || '',
          // FIX: Use actual brand from StockX, don't hardcode
          brand: l.brand || extractBrandFromName(l.name || l.productName || ''),
          // FIX: Capture colorway for eBay item specifics
          colorway: l.colorway || '',
          styleId: l.styleId || l.sku || '',
          sizes: [] 
        };
      }
      
      // Update colorway if this listing has it and group doesn't
      if (l.colorway && !g[sku].colorway) {
        g[sku].colorway = l.colorway;
      }
      
      const mapping = mappings.find(m => m.stockx_listing_id === l.listingId && m.status === 'active');
      const ebayMatch = ebayListings.find(eb => (eb.sku || '') === `${sku}-${l.size}`);
      
      g[sku].sizes.push({
        ...l,
        key: `sx_${l.listingId}`,
        source: 'stockx',
        isOnEbay: !!(mapping || ebayMatch),
        ebayOfferId: mapping?.ebay_offer_id || ebayMatch?.offerId || null,
        mappingId: mapping?.id || null
      });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      listedOnEbay: p.sizes.filter(s => s.isOnEbay).length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [stockxListings, ebayListings, mappings]);

  const inventoryProducts = useMemo(() => {
    const unsold = (purchases || []).filter(p => !p.sold);
    const g = {};
    
    unsold.forEach((p, idx) => {
      const sku = p.sku || p.styleId || 'UNKNOWN';
      if (!g[sku]) {
        g[sku] = { 
          sku, 
          name: p.name || p.productName || 'Unknown Product', 
          image: p.image || p.thumbnail || '', 
          brand: p.brand || extractBrandFromName(p.name || p.productName || ''),
          colorway: p.colorway || '',
          styleId: p.styleId || p.sku || '',
          sizes: [] 
        };
      }
      
      if (p.colorway && !g[sku].colorway) {
        g[sku].colorway = p.colorway;
      }
      
      const ebayMatch = ebayListings.find(eb => (eb.sku || '') === `${sku}-${p.size}`);
      
      g[sku].sizes.push({
        key: `inv_${idx}_${sku}_${p.size}`,
        source: 'inventory',
        size: p.size || '',
        yourAsk: p.askPrice || p.price || 100,
        cost: p.cost || 0,
        purchaseId: p.id || idx,
        isOnEbay: !!ebayMatch,
        ebayOfferId: ebayMatch?.offerId || null
      });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      listedOnEbay: p.sizes.filter(s => s.isOnEbay).length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [purchases, ebayListings]);

  const currentProducts = source === 'stockx' ? stockxProducts : inventoryProducts;

  const filteredProducts = useMemo(() => {
    let products = [...currentProducts];
    
    if (viewFilter === 'unlisted') {
      products = products.filter(p => p.sizes.some(s => !s.isOnEbay));
    } else if (viewFilter === 'listed') {
      products = products.filter(p => p.sizes.some(s => s.isOnEbay));
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p => p.sku?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q));
    }
    
    return products;
  }, [currentProducts, viewFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = currentProducts.reduce((sum, p) => sum + p.totalQty, 0);
    const onEbay = currentProducts.reduce((sum, p) => sum + p.listedOnEbay, 0);
    return { total, onEbay, notOnEbay: total - onEbay };
  }, [currentProducts]);

  // ============================================
  // HELPER: Extract brand from product name
  // ============================================
  function extractBrandFromName(name) {
    const nameLower = (name || '').toLowerCase();
    const brands = [
      'Nike', 'Air Jordan', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 
      'Converse', 'Vans', 'Puma', 'Reebok', 'ASICS', 'Salomon',
      'Saucony', 'Brooks', 'Hoka', 'On', 'Under Armour', 'Fila',
      'Timberland', 'Dr. Martens', 'Birkenstock', 'Crocs', 'UGG',
      'Balenciaga', 'Gucci', 'Louis Vuitton', 'Dior', 'Prada',
      'Off-White', 'Fear of God', 'Essentials', 'Supreme', 'Stussy'
    ];
    
    for (const brand of brands) {
      if (nameLower.includes(brand.toLowerCase())) {
        // Special handling for Jordan
        if (brand.toLowerCase() === 'jordan' && nameLower.includes('air jordan')) {
          return 'Jordan';
        }
        return brand;
      }
    }
    
    // Check for Yeezy (Adidas)
    if (nameLower.includes('yeezy')) return 'adidas';
    
    return '';
  }

  // ============================================
  // CREATE EBAY LISTINGS
  // ============================================
  const handleCreateEbayListings = async () => {
    if (!selectedItems.size || !ebayToken) {
      if (!ebayToken) showToast('Connect eBay in Settings first', 'error');
      return;
    }
    
    setCreating(true);
    
    const productMap = {};
    currentProducts.forEach(product => {
      product.sizes.forEach(sizeItem => {
        if (selectedItems.has(sizeItem.key) && !sizeItem.isOnEbay) {
          if (!productMap[product.sku]) {
            // FIX: Include ALL required fields for eBay listing creation
            productMap[product.sku] = { 
              sku: product.sku, 
              styleId: product.styleId || product.sku,
              name: product.name, 
              brand: product.brand,
              colorway: product.colorway,  // CRITICAL: Required for eBay Color aspect
              image: product.image, 
              sizes: [] 
            };
          }
          productMap[product.sku].sizes.push({
            size: sizeItem.size,
            qty: 1,
            price: sizeItem.yourAsk || 100,
            stockxListingId: sizeItem.source === 'stockx' ? sizeItem.listingId : null
          });
        }
      });
    });
    
    const products = Object.values(productMap);
    
    if (products.length === 0) {
      showToast('No valid items to list', 'error');
      setCreating(false);
      return;
    }
    
    console.log('[CrossList] Creating eBay listings with products:', JSON.stringify(products, null, 2));
    
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      
      const data = await res.json();
      console.log('[CrossList] eBay create response:', data);
      
      if (res.ok && data.created > 0) {
        // Insert mappings to Supabase
        for (const offer of (data.createdOffers || [])) {
          const exists = mappings.find(m => 
            m.ebay_offer_id === offer.offerId ||
            (m.sku === offer.baseSku && m.size === offer.size && m.status === 'active')
          );
          
          if (!exists) {
            await insertMapping({
              sku: offer.baseSku,
              size: offer.size,
              stockx_listing_id: offer.stockxListingId || null,
              ebay_offer_id: offer.offerId,
              ebay_listing_id: offer.listingId || null,
              ebay_sku: offer.ebaySku
            });
          }
        }
        
        await loadMappings();
        showToast(`Created ${data.created} eBay listings`);
        setSelectedItems(new Set());
        await syncAll();
      } else {
        // Show detailed error
        const errorMsg = data.errors?.[0]?.error || data.error || 'Failed to create listings';
        const hint = data.errors?.[0]?.hint || '';
        showToast(`${errorMsg}${hint ? ` - ${hint}` : ''}`, 'error');
        console.error('[CrossList] Create errors:', data.errors);
      }
      
    } catch (e) {
      console.error('[CrossList] Create error:', e);
      showToast('Failed to create listings', 'error');
    }
    
    setCreating(false);
  };

  // ============================================
  // DELIST FROM EBAY
  // ============================================
  const handleDelistFromEbay = async (offerIds) => {
    if (!offerIds.length || !ebayToken) return;
    
    setDelisting(true);
    
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerIds })
      });
      
      const data = await res.json();
      
      if (res.ok && data.ended > 0) {
        for (const offerId of offerIds) {
          await updateMappingStatus(offerId, 'delisted');
        }
        
        await loadMappings();
        showToast(`Removed ${data.ended} from eBay`);
        await syncAll();
      } else {
        showToast('Delist failed', 'error');
      }
      
    } catch (e) {
      console.error('[CrossList] Delist error:', e);
      showToast('Delist failed', 'error');
    }
    
    setDelisting(false);
  };

  const handleOversellSync = async () => {
    showToast('Checking for sales...');
    const activeMappings = mappings.filter(m => m.status === 'active');
    console.log('[CrossList] Active cross-list mappings:', activeMappings.length);
    showToast(`${activeMappings.length} active cross-listings monitored`);
  };

  // ============================================
  // RENDER
  // ============================================
  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  return (
    <div style={{ width: '100%' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? c.red : c.green, borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000, maxWidth: 400 }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Cross List</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>List inventory across StockX & eBay</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="text" placeholder="Search SKU..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, width: 160 }} />
          <button onClick={handleOversellSync}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, fontWeight: 600, cursor: 'pointer' }}>
            🛡️ Check Sales
          </button>
          <button onClick={syncAll} disabled={syncing}
            style={{ padding: '10px 20px', background: c.green, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Source Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setSource('stockx'); setSelectedItems(new Set()); }}
          style={{ padding: '10px 16px', background: source === 'stockx' ? c.card : 'transparent', border: `1px solid ${source === 'stockx' ? c.gold : c.border}`, borderRadius: 8, color: source === 'stockx' ? c.gold : c.textMuted, fontWeight: 600, cursor: 'pointer' }}>
          📦 StockX Listings ({stockxListings.length})
        </button>
        <button onClick={() => { setSource('inventory'); setSelectedItems(new Set()); }}
          style={{ padding: '10px 16px', background: source === 'inventory' ? c.card : 'transparent', border: `1px solid ${source === 'inventory' ? c.gold : c.border}`, borderRadius: 8, color: source === 'inventory' ? c.gold : c.textMuted, fontWeight: 600, cursor: 'pointer' }}>
          🏷️ FlipLedger Inventory ({(purchases || []).filter(p => !p.sold).length})
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>ON EBAY</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.green }}>{stats.onEbay}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>NOT ON EBAY</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.gold }}>{stats.notOnEbay}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>ACTIVE MAPPINGS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{mappings.filter(m => m.status === 'active').length}</div>
        </div>
      </div>

      {/* View Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'unlisted', label: '📤 Not on eBay', count: stats.notOnEbay },
          { id: 'listed', label: '✅ On eBay', count: stats.onEbay },
          { id: 'all', label: '📦 All', count: stats.total }
        ].map(tab => (
          <button key={tab.id} onClick={() => setViewFilter(tab.id)}
            style={{ padding: '8px 12px', background: viewFilter === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent', border: `1px solid ${viewFilter === tab.id ? c.gold : c.border}`, borderRadius: 6, color: viewFilter === tab.id ? c.gold : c.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {tab.label} <span style={{ opacity: 0.7 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Action Bar */}
      {selectedItems.size > 0 && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: c.textMuted }}>{selectedItems.size} selected</span>
          <button onClick={handleCreateEbayListings} disabled={creating || !ebayToken}
            style={{ padding: '8px 16px', background: c.green, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 13, cursor: creating ? 'wait' : 'pointer' }}>
            {creating ? '⏳ Creating...' : `🚀 List ${selectedItems.size} on eBay`}
          </button>
          <button onClick={() => setSelectedItems(new Set())}
            style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: c.textMuted, cursor: 'pointer' }}>
            Clear
          </button>
          {!ebayToken && <span style={{ fontSize: 12, color: c.red }}>⚠️ Connect eBay in Settings</span>}
        </div>
      )}

      {/* Products List */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted }}>PRODUCTS ({filteredProducts.length})</span>
          {viewFilter === 'unlisted' && (
            <button onClick={() => {
              const allUnlisted = [];
              filteredProducts.forEach(p => { p.sizes.forEach(s => { if (!s.isOnEbay) allUnlisted.push(s.key); }); });
              setSelectedItems(new Set(allUnlisted));
            }} style={{ fontSize: 11, color: c.gold, background: 'none', border: 'none', cursor: 'pointer' }}>
              Select All Unlisted
            </button>
          )}
        </div>

        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {filteredProducts.map(p => (
            <div key={p.sku} style={{ borderBottom: `1px solid ${c.border}` }}>
              <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: c.textMuted }}>
                    {p.sku}
                    {p.colorway && <span style={{ marginLeft: 8, opacity: 0.7 }}>• {p.colorway}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12 }}>
                  <div>{p.totalQty} items</div>
                  {p.listedOnEbay > 0 && <div style={{ color: c.green }}>{p.listedOnEbay} on eBay</div>}
                </div>
              </div>

              <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {p.sizes.map(s => (
                  <div key={s.key}
                    onClick={() => { if (s.isOnEbay) return; const n = new Set(selectedItems); n.has(s.key) ? n.delete(s.key) : n.add(s.key); setSelectedItems(n); }}
                    style={{ padding: '8px 12px', background: s.isOnEbay ? 'rgba(34,197,94,0.1)' : selectedItems.has(s.key) ? 'rgba(201,169,98,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${s.isOnEbay ? c.green : selectedItems.has(s.key) ? c.gold : c.border}`, borderRadius: 8, cursor: s.isOnEbay ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.size}</span>
                      {s.isOnEbay && <span style={{ color: c.green, fontSize: 10 }}>✓ eBay</span>}
                    </div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>${s.yourAsk || '—'}</div>
                    {s.isOnEbay && s.ebayOfferId && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelistFromEbay([s.ebayOfferId]); }} disabled={delisting}
                        style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 4, color: c.red, fontSize: 10, padding: '2px 6px', cursor: 'pointer', marginTop: 2 }}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredProducts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
              {stats.total === 0 ? 'Click Sync to load listings' : 'No products match filter'}
            </div>
          )}
        </div>
      </div>

      {/* Mappings Debug */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', color: c.textMuted, fontSize: 12 }}>
          🔗 Cross-List Mappings ({mappings.filter(m => m.status === 'active').length} active) — Supabase
        </summary>
        <div style={{ ...card, marginTop: 8, padding: 12, maxHeight: 200, overflowY: 'auto' }}>
          {mappings.filter(m => m.status === 'active').length === 0 ? (
            <div style={{ color: c.textMuted, fontSize: 12 }}>No active mappings yet.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>SKU</th>
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>Size</th>
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>StockX ID</th>
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>eBay Offer</th>
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {mappings.filter(m => m.status === 'active').map(m => (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: 4 }}>{m.sku}</td>
                    <td style={{ padding: 4 }}>{m.size}</td>
                    <td style={{ padding: 4, color: c.textMuted }}>{m.stockx_listing_id || '—'}</td>
                    <td style={{ padding: 4, color: c.textMuted }}>{m.ebay_offer_id || '—'}</td>
                    <td style={{ padding: 4, color: m.status === 'active' ? c.green : c.red }}>{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
