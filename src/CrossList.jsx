import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabase';
import ListingReview from './ListingReview';

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

// ════════════════════════════════════════════════════════════════════════════════
// CANONICAL EBAY SKU BUILDER - MUST MATCH SERVER EXACTLY (api/ebay-listings.js)
// ════════════════════════════════════════════════════════════════════════════════
/**
 * Create an eBay-safe SKU from base SKU + size
 * eBay requires: alphanumeric only, max 50 chars
 * 
 * @param {string} baseSku - Original SKU (e.g., "CZ0775-133")
 * @param {string} size - Size (e.g., "9W", "10.5", "M 10 / W 11.5")
 * @returns {string} Sanitized SKU (e.g., "CZ0775133S9W")
 */
function makeEbaySku(baseSku, size) {
  // Uppercase and remove all non-alphanumeric characters
  const cleanBase = (baseSku || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanSize = (size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Combine with S separator (S is alphanumeric so it's safe)
  let sku = cleanSize ? `${cleanBase}S${cleanSize}` : cleanBase;
  
  // Ensure max 50 chars
  if (sku.length > 50) {
    // Keep first 45 chars + simple hash suffix for uniqueness
    const hash = simpleHash(sku).toString(36).toUpperCase().substring(0, 4);
    sku = sku.substring(0, 45) + hash;
  }
  
  return sku;
}

/**
 * Simple hash function for SKU collision avoidance
 * MUST MATCH SERVER VERSION
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Parse an eBay SKU back to base SKU and size
 * @param {string} ebaySku - Sanitized SKU (e.g., "CZ0775133S9W")
 * @returns {object} { baseSku: string, size: string }
 */
function parseEbaySku(ebaySku) {
  if (!ebaySku) return { baseSku: '', size: '' };
  
  const lastS = ebaySku.lastIndexOf('S');
  if (lastS > 0 && lastS < ebaySku.length - 1) {
    return {
      baseSku: ebaySku.substring(0, lastS),
      size: ebaySku.substring(lastS + 1)
    };
  }
  return { baseSku: ebaySku, size: '' };
}
// ════════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════════
// TOKEN HELPER - Read eBay token from localStorage with multiple key fallbacks
// ════════════════════════════════════════════════════════════════════════════════
function getEbayTokenFromStorage() {
  // Try multiple possible localStorage keys - CORRECT KEY FIRST
  const possibleKeys = [
    'flipledger_ebay_token',  // ACTUAL KEY USED BY APP
    'ebay_access_token',
    'ebayToken', 
    'ebay_token',
    'fl_ebay_token'
  ];
  
  for (const key of possibleKeys) {
    const token = localStorage.getItem(key);
    if (token && token.length > 10) {
      console.log(`[CrossList:Auth] ✓ Found eBay token in localStorage key: "${key}" (length: ${token.length})`);
      return token;
    }
  }
  
  console.log('[CrossList:Auth] ✗ No eBay token found in localStorage. Checked keys:', possibleKeys.join(', '));
  return null;
}

function getStockxTokenFromStorage() {
  // CORRECT KEY FIRST
  const possibleKeys = [
    'flipledger_stockx_token',  // ACTUAL KEY USED BY APP
    'stockx_access_token',
    'stockxToken',
    'stockx_token', 
    'fl_stockx_token'
  ];
  
  for (const key of possibleKeys) {
    const token = localStorage.getItem(key);
    if (token && token.length > 10) {
      console.log(`[CrossList:Auth] ✓ Found StockX token in localStorage key: "${key}" (length: ${token.length})`);
      return token;
    }
  }
  
  console.log('[CrossList:Auth] ✗ No StockX token found in localStorage');
  return null;
}

export default function CrossList({ stockxToken: stockxTokenProp, ebayToken: ebayTokenProp, purchases = [], c }) {
  // Use prop if provided, otherwise try localStorage
  const [ebayToken, setEbayToken] = useState(() => {
    const token = ebayTokenProp || getEbayTokenFromStorage();
    console.log(`[CrossList:Auth] eBay token initialized: ${token ? 'YES' : 'NO'} (from ${ebayTokenProp ? 'prop' : 'localStorage'})`);
    return token;
  });
  
  const [stockxToken, setStockxToken] = useState(() => {
    const token = stockxTokenProp || getStockxTokenFromStorage();
    console.log(`[CrossList:Auth] StockX token initialized: ${token ? 'YES' : 'NO'} (from ${stockxTokenProp ? 'prop' : 'localStorage'})`);
    return token;
  });

  // Re-check tokens when props change or on focus (user might have connected in another tab)
  useEffect(() => {
    if (ebayTokenProp) {
      setEbayToken(ebayTokenProp);
    }
    if (stockxTokenProp) {
      setStockxToken(stockxTokenProp);
    }
  }, [ebayTokenProp, stockxTokenProp]);

  // Re-check localStorage when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      const freshEbayToken = ebayTokenProp || getEbayTokenFromStorage();
      const freshStockxToken = stockxTokenProp || getStockxTokenFromStorage();
      if (freshEbayToken !== ebayToken) {
        console.log('[CrossList:Auth] eBay token updated on focus');
        setEbayToken(freshEbayToken);
      }
      if (freshStockxToken !== stockxToken) {
        console.log('[CrossList:Auth] StockX token updated on focus');
        setStockxToken(freshStockxToken);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [ebayToken, stockxToken, ebayTokenProp, stockxTokenProp]);

  const [source, setSource] = useState('stockx');
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [delisting, setDelisting] = useState(false);
  const [publishImmediately, setPublishImmediately] = useState(true); // Default to publish mode
  
  // Review Screen state
  const [showReview, setShowReview] = useState(false);
  const [itemsToReview, setItemsToReview] = useState([]);
  
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
  const [expandedProduct, setExpandedProduct] = useState(null);
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
        .order('created_at', { ascending: false }).range(0, 999999);
      
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
    console.log('[CrossList:Sync] syncStockX called, token present:', !!stockxToken);
    
    if (!stockxToken) {
      console.log('[CrossList:Sync] ✗ No StockX token - skipping sync');
      return [];
    }
    
    try {
      console.log('[CrossList:Sync] Fetching StockX listings...');
      const res = await fetch('/api/stockx-listings?skipMarketData=true', {
        headers: { 'Authorization': `Bearer ${stockxToken}` }
      });
      
      console.log('[CrossList:Sync] StockX response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[CrossList:Sync] StockX raw response:', data);
        console.log('[CrossList:Sync] ✓ StockX returned', data.listings?.length || 0, 'listings');
        return data.listings || [];
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[CrossList:Sync] ✗ StockX error:', res.status, errorData);
        return [];
      }
    } catch (e) {
      console.error('[CrossList:Sync] ✗ StockX sync exception:', e);
    }
    return [];
  };

  const syncEbay = async () => {
    console.log('[CrossList:Sync] syncEbay called, token present:', !!ebayToken);
    
    if (!ebayToken) {
      console.log('[CrossList:Sync] ✗ No eBay token - skipping sync');
      return [];
    }
    
    try {
      console.log('[CrossList:Sync] Fetching eBay listings...');
      const res = await fetch('/api/ebay-listings', {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${ebayToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[CrossList:Sync] eBay response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[CrossList:Sync] eBay raw response:', data);
        
        // FIX: API returns "offers" not "listings"
        const offers = data.offers || data.listings || [];
        console.log('[CrossList:Sync] ✓ eBay returned', offers.length, 'offers');
        
        // DEBUG: Log sample eBay SKUs for troubleshooting
        if (offers.length > 0) {
          console.log('[CrossList:Sync] eBay SKU samples:', offers.slice(0, 5).map(o => o.sku));
        }
        
        return offers;
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[CrossList:Sync] ✗ eBay error:', res.status, errorData);
        
        if (res.status === 401) {
          console.error('[CrossList:Sync] eBay token expired or invalid - user needs to reconnect');
          showToast('eBay connection expired. Please reconnect in Settings.', 'error');
        }
        return [];
      }
    } catch (e) {
      console.error('[CrossList:Sync] ✗ eBay sync exception:', e);
    }
    return [];
  };

  const syncAll = async () => {
    if (syncing) return;
    
    console.log('[CrossList:Sync] ═══════════════════════════════════════════════');
    console.log('[CrossList:Sync] Starting full sync');
    console.log('[CrossList:Sync] StockX token:', stockxToken ? `present (${stockxToken.length} chars)` : 'MISSING');
    console.log('[CrossList:Sync] eBay token:', ebayToken ? `present (${ebayToken.length} chars)` : 'MISSING');
    console.log('[CrossList:Sync] ═══════════════════════════════════════════════');
    
    if (!stockxToken && !ebayToken) {
      showToast('Connect StockX or eBay in Settings first', 'error');
      return;
    }
    
    setSyncing(true);
    
    try {
      const [sx, eb] = await Promise.all([syncStockX(), syncEbay()]);
      
      console.log('[CrossList:Sync] ═══════════════════════════════════════════════');
      console.log('[CrossList:Sync] Sync complete:', sx.length, 'StockX,', eb.length, 'eBay');
      console.log('[CrossList:Sync] ═══════════════════════════════════════════════');
      
      // Update state and cache
      setStockxListings(sx);
      setEbayListings(eb);
      localStorage.setItem(CACHE_KEYS.SX, JSON.stringify(sx));
      localStorage.setItem(CACHE_KEYS.EB, JSON.stringify(eb));
      
      // Reload mappings from Supabase
      await loadMappings();
      
      // Auto-detect new mappings from eBay SKUs
      // Format: CZ0790400S14 (alphanumeric, S separates SKU from size)
      for (const ebItem of eb) {
        const ebSku = ebItem.sku || '';
        const { baseSku: baseSkuClean, size } = parseEbaySku(ebSku);
        
        // Match to StockX by comparing cleaned base SKUs
        const sxMatch = sx.find(s => {
          const sxBaseClean = (s.sku || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const sxSizeClean = (s.size || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return sxBaseClean === baseSkuClean && sxSizeClean === size;
        });
        
        const baseSku = sxMatch?.sku || baseSkuClean; // Use original StockX SKU if found
        
        const existingMapping = mappings.find(m => 
          m.ebay_offer_id === ebItem.offerId || 
          (m.ebay_sku === ebSku && m.status === 'active')
        );
        
        if (!existingMapping && ebItem.offerId) {
          await insertMapping({
            sku: baseSku,
            size: sxMatch?.size || size,
            stockx_listing_id: sxMatch?.listingId || null,
            ebay_offer_id: ebItem.offerId,
            ebay_listing_id: ebItem.listingId || null,
            ebay_sku: ebSku
          });
        }
      }
      
      // Verify mappings - mark as delisted if not found on eBay
const ebOfferIds = new Set(eb.map(e => String(e.offerId)));
      const activeMappings = mappings.filter(m => m.status === 'active');
      let delistedCount = 0;
      
      for (const mapping of activeMappings) {
        if (mapping.ebay_offer_id && !ebOfferIds.has(mapping.ebay_offer_id)) {
          await updateMappingStatus(mapping.ebay_offer_id, 'delisted');
          delistedCount++;
          console.log('[CrossList] Auto-delisted missing:', mapping.ebay_sku);
        }
      }
      
      await loadMappings();
      const msg = `Synced ${sx.length} StockX + ${eb.length} eBay`;
      showToast(delistedCount > 0 ? `${msg} (${delistedCount} removed)` : msg);
      
    } catch (e) {
      console.error('[CrossList] Sync error:', e);
      showToast('Sync failed', 'error');
    }
    
    setSyncing(false);
  };

  // ============================================
  // BUILD EBAY SKU SET FOR FAST LOOKUP
  // ============================================
  const ebaySkuSet = useMemo(() => {
    const set = new Set();
    const skuToOffer = new Map();
    
    ebayListings.forEach(eb => {
      if (eb.sku) {
        set.add(eb.sku);
        skuToOffer.set(eb.sku, eb);
      }
    });
    
    console.log('[CrossList] Built eBay SKU set with', set.size, 'SKUs');
    return { set, skuToOffer };
  }, [ebayListings]);

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
      
      // FIX: Use canonical makeEbaySku() for matching instead of string concat
      const expectedEbaySku = makeEbaySku(sku, l.size);
      const ebayMatch = ebaySkuSet.skuToOffer.get(expectedEbaySku);
      
      // Also check mappings by stockx_listing_id
      const mapping = mappings.find(m => m.stockx_listing_id === l.listingId && m.status === 'active');
      
      // DEBUG: Log matching attempt for first few items
      if (g[sku].sizes.length === 0) {
        console.log(`[CrossList] Matching ${sku} size ${l.size} → expected eBay SKU: ${expectedEbaySku}, found: ${ebayMatch ? 'YES' : 'NO'}`);
      }
      
      g[sku].sizes.push({
        ...l,
        key: `sx_${l.listingId}`,
        source: 'stockx',
        isOnEbay: !!(mapping || ebayMatch),
        ebayOfferId: mapping?.ebay_offer_id || ebayMatch?.offerId || null,
        mappingId: mapping?.id || null,
        expectedEbaySku // Store for debugging
      });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      listedOnEbay: p.sizes.filter(s => s.isOnEbay).length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [stockxListings, ebaySkuSet, mappings]);

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
      
      // FIX: Use canonical makeEbaySku() for matching instead of string concat
      const expectedEbaySku = makeEbaySku(sku, p.size);
      const ebayMatch = ebaySkuSet.skuToOffer.get(expectedEbaySku);
      
      g[sku].sizes.push({
        key: `inv_${idx}_${sku}_${p.size}`,
        source: 'inventory',
        size: p.size || '',
        yourAsk: p.askPrice || p.price || 100,
        cost: p.cost || 0,
        purchaseId: p.id || idx,
        isOnEbay: !!ebayMatch,
        ebayOfferId: ebayMatch?.offerId || null,
        expectedEbaySku // Store for debugging
      });
    });
    
    return Object.values(g).map(p => ({
      ...p,
      totalQty: p.sizes.length,
      listedOnEbay: p.sizes.filter(s => s.isOnEbay).length,
      sizes: p.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
    }));
  }, [purchases, ebaySkuSet]);

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
  // PREPARE ITEMS FOR REVIEW SCREEN
  // ============================================
  const handlePrepareForReview = () => {
    if (!selectedItems.size || !ebayToken) {
      if (!ebayToken) showToast('Connect eBay in Settings first', 'error');
      return;
    }
    
    // QTY SUPPORT: Group selected items by SKU+size to combine into single listing with qty
    const itemGroups = {};
    currentProducts.forEach(product => {
      product.sizes.forEach(sizeItem => {
        if (selectedItems.has(sizeItem.key) && !sizeItem.isOnEbay) {
          const groupKey = `${product.sku}_${sizeItem.size}`;
          
          if (!itemGroups[groupKey]) {
            itemGroups[groupKey] = {
              sku: product.sku,
              styleId: product.styleId || product.sku,
              name: product.name,
              brand: product.brand,
              colorway: product.colorway,
              image: product.image,
              images: product.images || (product.image ? [product.image] : []),
              size: sizeItem.size,
              price: sizeItem.yourAsk || 100,
              yourAsk: sizeItem.yourAsk,
              qty: 0,
              stockxListingIds: []
            };
          }
          
          // Increment qty and collect all stockx listing IDs
          itemGroups[groupKey].qty += 1;
          if (sizeItem.source === 'stockx' && sizeItem.listingId) {
            itemGroups[groupKey].stockxListingIds.push(sizeItem.listingId);
          }
        }
      });
    });
    
    const items = Object.values(itemGroups);
    
    if (items.length === 0) {
      showToast('No valid items to list', 'error');
      return;
    }
    
    console.log('[CrossList] Opening Review Screen with', items.length, 'items (grouped by SKU+size, total qty:', items.reduce((sum, i) => sum + i.qty, 0), ')');
    setItemsToReview(items);
    setShowReview(true);
  };

  const handleReviewComplete = async (data) => {
    // After publishing from review screen, update mappings and refresh
    if (data?.createdOffers?.length > 0) {
      for (const offer of data.createdOffers) {
        // QTY SUPPORT: Create mapping for each stockxListingId (all point to same eBay offer)
        const stockxIds = offer.stockxListingIds || (offer.stockxListingId ? [offer.stockxListingId] : []);
        
        if (stockxIds.length > 0) {
          // Create one mapping per StockX listing ID
          for (const stockxId of stockxIds) {
            const exists = mappings.find(m => 
              m.stockx_listing_id === stockxId && m.status === 'active'
            );
            
            if (!exists) {
              await insertMapping({
                sku: offer.baseSku,
                size: offer.size,
                stockx_listing_id: stockxId,
                ebay_offer_id: offer.offerId,
                ebay_listing_id: offer.listingId || null,
                ebay_sku: offer.ebaySku
              });
            }
          }
        } else {
          // No StockX IDs (from inventory), create single mapping
          const exists = mappings.find(m => 
            m.ebay_offer_id === offer.offerId ||
            (m.ebay_sku === offer.ebaySku && m.status === 'active')
          );
          
          if (!exists) {
            await insertMapping({
              sku: offer.baseSku,
              size: offer.size,
              stockx_listing_id: null,
              ebay_offer_id: offer.offerId,
              ebay_listing_id: offer.listingId || null,
              ebay_sku: offer.ebaySku
            });
          }
        }
      }
      await loadMappings();
    }
    
    setShowReview(false);
    setItemsToReview([]);
    setSelectedItems(new Set());
    await syncAll();
  };

  const handleReviewBack = () => {
    setShowReview(false);
    setItemsToReview([]);
  };

  // Legacy direct publish (keeping for backwards compatibility)
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
            productMap[product.sku] = { 
              sku: product.sku, 
              styleId: product.styleId || product.sku,
              name: product.name, 
              brand: product.brand,
              colorway: product.colorway,
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
    console.log('[CrossList] Publish mode:', publishImmediately ? 'PUBLISH NOW' : 'DRAFT');
    
    try {
      const res = await fetch('/api/ebay-listings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, publishImmediately })
      });
      
      const data = await res.json();
      console.log('[CrossList] eBay create response:', data);
      
      if (res.ok && data.created > 0) {
        // Insert mappings to Supabase
        for (const offer of (data.createdOffers || [])) {
          const exists = mappings.find(m => 
            m.ebay_offer_id === offer.offerId ||
            (m.ebay_sku === offer.ebaySku && m.status === 'active')
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
        
        // Show appropriate message based on draft vs published
        if (data.drafts > 0 && data.published === 0) {
          showToast(`Created ${data.drafts} draft(s) → Review in eBay Seller Hub`);
        } else if (data.published > 0) {
          const firstListing = data.createdOffers?.find(o => o.ebayUrl);
          if (firstListing?.ebayUrl && data.published === 1) {
            showToast(`✅ Published on eBay! Click to view listing`);
            // Open listing in new tab
            window.open(firstListing.ebayUrl, '_blank');
          } else {
            showToast(`✅ Published ${data.published} listing(s) on eBay`);
          }
        } else {
          showToast(`Created ${data.created} listing(s)`);
        }
        
        setSelectedItems(new Set());
        await syncAll();
      } else {
        // Show detailed error including SKU that failed
        const errorMsg = data.errors?.[0]?.error || data.error || 'Failed to create listings';
        const failedSku = data.errors?.[0]?.sku || '';
        const hint = data.errors?.[0]?.hint || '';
        showToast(`${errorMsg}${failedSku ? ` (SKU: ${failedSku})` : ''}${hint ? ` - ${hint}` : ''}`, 'error');
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
    showToast('Checking for oversells...');
    
    const activeMappings = mappings.filter(m => m.status === 'active');
    if (!activeMappings.length) {
      showToast('No active cross-listings to check');
      return;
    }
    
    // Find StockX listings that are sold but still on eBay
    let oversells = 0;
    const toRemove = [];
    
    for (const mapping of activeMappings) {
      // Check if the StockX listing still exists
      const sxListing = stockxListings.find(s => s.listingId === mapping.stockx_listing_id);
      
      // If not found in active StockX listings, it might be sold
      if (mapping.stockx_listing_id && !sxListing && mapping.ebay_offer_id) {
        toRemove.push(mapping.ebay_offer_id);
        oversells++;
      }
    }
    
    if (toRemove.length > 0) {
      showToast(`Found ${oversells} potential oversells. Removing from eBay...`);
      await handleDelistFromEbay(toRemove);
    } else {
      showToast('No oversells detected ✓');
    }
  };

  // If showing review screen, render that instead
  if (showReview) {
    return (
      <ListingReview
        items={itemsToReview}
        ebayToken={ebayToken}
        onComplete={handleReviewComplete}
        onBack={handleReviewBack}
        c={c}
        publishImmediately={publishImmediately}
      />
    );
  }

  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, padding: '12px 20px', background: toast.type === 'error' ? '#ef4444' : c.green, color: '#fff', borderRadius: 8, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontWeight: 600 }}>
          {toast.msg}
        </div>
      )}

      {/* Connection Status Banner */}
      {(!stockxToken || !ebayToken) && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>⚠️ Missing Connections:</span>
            {!stockxToken && (
              <span style={{ fontSize: 12, color: c.textMuted, background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 4 }}>
                StockX not connected
              </span>
            )}
            {!ebayToken && (
              <span style={{ fontSize: 12, color: c.textMuted, background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 4 }}>
                eBay not connected
              </span>
            )}
            <span style={{ fontSize: 12, color: c.textMuted, marginLeft: 'auto' }}>
              → Go to <strong>Settings</strong> to connect
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cross-List</h2>
          <p style={{ margin: '4px 0 0', color: c.textMuted, fontSize: 13 }}>
            Manage listings across StockX → eBay
            <span style={{ marginLeft: 12 }}>
              {stockxToken ? <span style={{ color: c.green }}>● StockX</span> : <span style={{ color: '#ef4444' }}>○ StockX</span>}
              {' · '}
              {ebayToken ? <span style={{ color: c.green }}>● eBay</span> : <span style={{ color: '#ef4444' }}>○ eBay</span>}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleOversellSync} disabled={syncing || !ebayToken}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 8, color: c.textMuted, fontWeight: 600, cursor: 'pointer', opacity: !ebayToken ? 0.5 : 1 }}>
            🔍 Check Oversells
          </button>
          <button onClick={syncAll} disabled={syncing || (!stockxToken && !ebayToken)}
            style={{ padding: '10px 16px', background: c.gold, border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', opacity: (!stockxToken && !ebayToken) ? 0.5 : 1 }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Source Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setSource('stockx'); setSelectedItems(new Set()); }}
          style={{ padding: '10px 16px', background: source === 'stockx' ? c.card : 'transparent', border: `1px solid ${source === 'stockx' ? c.gold : c.border}`, borderRadius: 8, color: source === 'stockx' ? c.gold : c.textMuted, fontWeight: 600, cursor: 'pointer' }}>
          📦 StockX Listings ({stockxListings.length})
          {!stockxToken && <span style={{ marginLeft: 6, color: '#ef4444', fontSize: 10 }}>⚠️</span>}
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
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: c.textMuted }}>{selectedItems.size} selected</span>
          
          {/* List on eBay - only for items NOT on eBay */}
          {(() => {
            const selectedNotOnEbay = [...selectedItems].filter(key => {
              for (const p of filteredProducts) {
                const s = p.sizes.find(sz => sz.key === key);
                if (s && !s.isOnEbay) return true;
              }
              return false;
            });
            return selectedNotOnEbay.length > 0 && (
              <button onClick={handlePrepareForReview} disabled={!ebayToken}
                style={{ padding: '8px 16px', background: c.green, border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                📋 Review & List {selectedNotOnEbay.length} on eBay
              </button>
            );
          })()}
          
          {/* Remove from eBay - only for items ON eBay */}
          {(() => {
            const selectedOnEbay = [...selectedItems].map(key => {
              for (const p of filteredProducts) {
                const s = p.sizes.find(sz => sz.key === key);
                if (s && s.isOnEbay && s.ebayOfferId) return s.ebayOfferId;
              }
              return null;
            }).filter(Boolean);
            return selectedOnEbay.length > 0 && (
              <button onClick={() => handleDelistFromEbay(selectedOnEbay)} disabled={delisting || !ebayToken}
                style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.15)', border: `1px solid ${c.red}`, borderRadius: 6, color: c.red, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                🗑️ Remove {selectedOnEbay.length} from eBay
              </button>
            );
          })()}
          
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
          {viewFilter === 'listed' && (
            <button onClick={() => {
              const allOnEbay = [];
              filteredProducts.forEach(p => { p.sizes.forEach(s => { if (s.isOnEbay) allOnEbay.push(s.key); }); });
              setSelectedItems(new Set(allOnEbay));
            }} style={{ fontSize: 11, color: c.red, background: 'none', border: 'none', cursor: 'pointer' }}>
              Select All on eBay
            </button>
          )}
        </div>

    <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {filteredProducts.map(p => {
            const isExpanded = expandedProduct === p.sku;
            const selectedInProduct = p.sizes.filter(s => selectedItems.has(s.key)).length;
            const filteredSizes = viewFilter === 'unlisted' ? p.sizes.filter(s => !s.isOnEbay) 
              : viewFilter === 'listed' ? p.sizes.filter(s => s.isOnEbay) 
              : p.sizes;
            const prices = filteredSizes.map(s => parseFloat(s.yourAsk || 0)).filter(v => v > 0);
            const priceRange = prices.length > 0 
              ? (Math.min(...prices) === Math.max(...prices) ? `$${Math.min(...prices)}` : `$${Math.min(...prices)} - $${Math.max(...prices)}`)
              : '';

            return (
              <div key={p.sku} style={{ borderBottom: `1px solid ${c.border}` }}>
                <div
                  onClick={() => setExpandedProduct(isExpanded ? null : p.sku)}
                  style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                >
                  <div style={{ color: c.textMuted, fontSize: 11, width: 14, flexShrink: 0 }}>
                    {isExpanded ? '▼' : '▶'}
                  </div>
                  <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👟'; }} /> : '👟'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: c.textMuted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{p.sku}</span>
                      {priceRange && <span>{priceRange}</span>}
                      {p.colorway && <span style={{ opacity: 0.7 }}>• {p.colorway}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {selectedInProduct > 0 && (
                      <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'rgba(201,169,98,0.15)', color: c.gold }}>
                        {selectedInProduct} sel
                      </span>
                    )}
                    {p.listedOnEbay > 0 && (
                      <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: c.green }}>
                        {p.listedOnEbay} eBay
                      </span>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{filteredSizes.length}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '4px 16px 14px 46px', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: c.textMuted }}>Click sizes to select</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const keys = filteredSizes.map(s => s.key);
                          const allSelected = keys.every(k => selectedItems.has(k));
                          const n = new Set(selectedItems);
                          keys.forEach(k => allSelected ? n.delete(k) : n.add(k));
                          setSelectedItems(n);
                        }}
                        style={{ fontSize: 11, color: c.gold, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {filteredSizes.every(s => selectedItems.has(s.key)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {filteredSizes.map(s => (
                        <div key={s.key}
                          onClick={(e) => { e.stopPropagation(); const n = new Set(selectedItems); n.has(s.key) ? n.delete(s.key) : n.add(s.key); setSelectedItems(n); }}
                          style={{
                            padding: '10px 14px', minWidth: 72, textAlign: 'center', cursor: 'pointer',
                            background: selectedItems.has(s.key) ? 'rgba(201,169,98,0.15)' : s.isOnEbay ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${selectedItems.has(s.key) ? c.gold : s.isOnEbay ? c.green : c.border}`,
                            borderRadius: 8, position: 'relative'
                          }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: selectedItems.has(s.key) ? c.gold : c.text }}>{s.size}</div>
                          <div style={{ fontSize: 11, color: selectedItems.has(s.key) ? c.gold : c.textMuted, marginTop: 2 }}>${s.yourAsk || '—'}</div>
                          {s.isOnEbay && <div style={{ position: 'absolute', top: -5, left: -5, fontSize: 10 }}>✅</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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
                  <th style={{ textAlign: 'left', padding: 4, color: c.textMuted }}>eBay SKU</th>
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
                    <td style={{ padding: 4, fontFamily: 'monospace', fontSize: 10 }}>{m.ebay_sku || '—'}</td>
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
      
      {/* Debug Info */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: c.textMuted, fontSize: 12 }}>
          🐛 Debug: eBay SKU Matching
        </summary>
        <div style={{ ...card, marginTop: 8, padding: 12, fontSize: 11, fontFamily: 'monospace' }}>
          <div>eBay listings in cache: {ebayListings.length}</div>
          <div>eBay SKUs in lookup set: {ebaySkuSet.set.size}</div>
          {ebayListings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: c.textMuted, marginBottom: 4 }}>Sample eBay SKUs:</div>
              {ebayListings.slice(0, 5).map((eb, i) => (
                <div key={i}>{eb.sku} → offerId: {eb.offerId?.substring(0, 8)}...</div>
              ))}
            </div>
          )}
          {stockxListings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: c.textMuted, marginBottom: 4 }}>Sample expected eBay SKUs (from StockX):</div>
              {stockxListings.slice(0, 5).map((sx, i) => (
                <div key={i}>{sx.sku} size {sx.size} → {makeEbaySku(sx.sku, sx.size)}</div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
