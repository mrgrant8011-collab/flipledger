import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import PricingIntelligence from './PricingIntelligence';
/**
 * LISTING REVIEW - Review & Edit Before Publishing to eBay
 * 
 * Flow:
 * 1. Receives selected items from CrossList
 * 2. Searches eBay Catalog for EPID (auto-fills title, category, item specifics, photos)
 * 3. Falls back to StockX for photos if needed
 * 4. User can edit everything before publishing
 * 5. Publish clean listings to eBay
 */

const COLORS = [
  'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange',
  'Purple', 'Pink', 'Brown', 'Gray', 'Beige', 'Tan', 'Gold',
  'Silver', 'Navy', 'Cream', 'Multicolor'
];

const DEPARTMENTS = ['Men', 'Women', 'Unisex', 'Boys', 'Girls', 'Unisex Kids'];

const CONDITIONS = [
  { value: 'NEW', label: 'New with Box' },
  { value: 'NEW_WITHOUT_BOX', label: 'New without Box' },
  { value: 'NEW_WITH_DEFECTS', label: 'New with Defects' },
  { value: 'USED_EXCELLENT', label: 'Pre-owned - Excellent' },
  { value: 'USED_GOOD', label: 'Pre-owned - Good' }
];

export default function ListingReview({ items = [], ebayToken, onBack, onComplete, c }) {
  // Items with enriched data from EPID lookup
  const [enrichedItems, setEnrichedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [marketDataCache, setMarketDataCache] = useState({});
  const [ebaySellerLevel] = useState(() => {
    try { return localStorage.getItem('fl_ebay_seller_level') || 'above_standard'; } catch { return 'above_standard'; }
  });
  const [ebayStoreType] = useState(() => {
    try { return localStorage.getItem('fl_ebay_store_type') || 'none'; } catch { return 'none'; }
  });

  // Default description template
  const [descriptionTemplate] = useState(
    `100% Authentic, Brand New with Original Box ✅

• Ships within 1-2 business days
• Double-boxed for protection
• All items verified authentic

Questions? Message me before purchasing!`
  );

 const fetchMarketData = async (sku) => {
    if (marketDataCache[sku] || !ebayToken) return;
    try {
      const params = new URLSearchParams({ sku, limit: '200' });
      const res = await fetch(`/api/ebay-browse?${params}`, {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMarketDataCache(prev => ({ ...prev, [sku]: data }));
      }
    } catch (e) {
      console.error('[ListingReview] Market data fetch error:', e);
    }
  };
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============================================
  // EPID LOOKUP - Enrich items with eBay data
  // ============================================
  useEffect(() => {
    if (items.length > 0) {
      enrichItems();
    }
  }, [items]);

  const enrichItems = async () => {
    setLoading(true);
    
    const enriched = await Promise.all(items.map(async (item) => {
      // Try to find EPID from eBay Catalog
      const catalogData = await searchEbayCatalog(item);
      
      // Build description
      const description = buildDescription(item, catalogData);
      
      // Build title with correct size
      const baseTitle = (catalogData?.title || item.name || 'Unknown Product')
        .replace(/\s*Size\s+[\d\.]+[A-Z]?\s*/gi, ' ')  // Remove any existing size
        .replace(/\s*Men'?s?\s*Size\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const titleWithSize = `${baseTitle} Size ${item.size}`;
      
      return {
        ...item,
        id: `${item.sku}-${item.size}-${Date.now()}`,
        // EPID data (from eBay Catalog)
        epid: catalogData?.epid || null,
        epidFound: !!catalogData?.epid,
        // Title - with correct size appended
        title: titleWithSize,
        titleSource: catalogData?.title ? 'ebay' : 'stockx',
        // Category
        categoryId: catalogData?.categoryId || '15709',
        categoryName: catalogData?.categoryName || 'Athletic Shoes',
        // Photos - EPID first, then StockX
        photos: catalogData?.images?.length > 0 
          ? catalogData.images.slice(0, 5)
          : item.images?.length > 0 
            ? item.images.slice(0, 5)
            : item.image 
              ? [item.image]
              : [],
        photosSource: catalogData?.images?.length > 0 ? 'ebay' : 'stockx',
        // Item Specifics
        brand: catalogData?.brand || item.brand || inferBrand(item.name),
        color: catalogData?.color || item.color || null,
        department: catalogData?.department || inferDepartment(item.size),
        shoeSize: item.size,
        styleCode: item.sku || item.styleId || '',
        silhouette: catalogData?.silhouette || inferSilhouette(item.name),
        type: catalogData?.type || 'Athletic',
        catalogAspects: catalogData?.catalogAspects || {},
        // User inputs
        price: item.price || item.yourAsk || 100,
        condition: 'NEW',
        description: description,
        // QTY SUPPORT: Preserve qty and stockxListingIds from CrossList
        qty: item.qty || 1,
        stockxListingIds: item.stockxListingIds || [],
        // Tracking (legacy single ID for backwards compatibility)
        stockxListingId: item.stockxListingIds?.[0] || item.listingId || item.stockxListingId || null,
       // Promoted listing
        promotedOn: false,
        adRate: '4',
        // Status
        status: catalogData?.epid ? 'ready' : (item.color || catalogData?.color) ? 'ready' : 'needs_color'
      };
    }));

    setEnrichedItems(enriched);
    setLoading(false);

    // Show summary
    const epidCount = enriched.filter(i => i.epidFound).length;
    const needsColorCount = enriched.filter(i => i.status === 'needs_color').length;
    
    if (epidCount > 0) {
      showToast(`Found ${epidCount}/${enriched.length} in eBay Catalog`);
    }
    // Fetch market data for each unique SKU
    const uniqueSkus = [...new Set(enriched.map(i => i.styleCode).filter(Boolean))];
    uniqueSkus.forEach(sku => fetchMarketData(sku));
    if (needsColorCount > 0) {
      // Auto-expand first item needing color
      const firstNeedsColor = enriched.find(i => i.status === 'needs_color');
      if (firstNeedsColor) setExpandedId(firstNeedsColor.id);
    }
  };

  const searchEbayCatalog = async (item) => {
    try {
      const searchQuery = item.sku || item.styleId || item.name;
      const res = await fetch(`/api/ebay-listings?lookup=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          console.log(`[ListingReview] EPID found for ${searchQuery}:`, data.epid);
          return data;
        }
      }
    } catch (e) {
      console.error('[ListingReview] EPID lookup error:', e);
    }
    return null;
  };

  const buildDescription = (item, catalogData) => {
    const name = catalogData?.title || item.name || 'Item';
    const sku = item.sku || item.styleId || '';
    const colorway = item.colorway || catalogData?.colorway || '';
    
    let desc = `${name}\n`;
    if (sku) desc += `Style Code: ${sku}\n`;
    if (colorway) desc += `Colorway: ${colorway}\n`;
    desc += `\n${descriptionTemplate}`;
    
    return desc;
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  const inferBrand = (name) => {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('jordan') || n.includes('air jordan')) return 'Jordan';
    if (n.includes('yeezy')) return 'adidas';
    if (n.includes('nike') || n.includes('dunk') || n.includes('air force') || n.includes('air max')) return 'Nike';
    if (n.includes('adidas')) return 'adidas';
    if (n.includes('new balance')) return 'New Balance';
    if (n.includes('converse')) return 'Converse';
    if (n.includes('vans')) return 'Vans';
    if (n.includes('puma')) return 'Puma';
    if (n.includes('reebok')) return 'Reebok';
    if (n.includes('asics')) return 'ASICS';
    return '';
  };

  const inferDepartment = (size) => {
    if (!size) return 'Men';
    const s = size.toString().toUpperCase();
    if (s.includes('W')) return 'Women';
    if (s.includes('Y') || s.includes('GS') || s.includes('PS') || s.includes('TD')) return 'Unisex Kids';
    if (s.includes('C')) return 'Unisex Kids';
    const numSize = parseFloat(s);
    if (numSize && numSize < 4) return 'Unisex Kids';
    return 'Men';
  };

  const inferSilhouette = (name) => {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.includes('jordan 1') || n.includes('aj1')) return 'Air Jordan 1';
    if (n.includes('jordan 3') || n.includes('aj3')) return 'Air Jordan 3';
    if (n.includes('jordan 4') || n.includes('aj4')) return 'Air Jordan 4';
    if (n.includes('jordan 5') || n.includes('aj5')) return 'Air Jordan 5';
    if (n.includes('jordan 11') || n.includes('aj11')) return 'Air Jordan 11';
    if (n.includes('dunk low')) return 'Nike Dunk Low';
    if (n.includes('dunk high')) return 'Nike Dunk High';
    if (n.includes('air force 1') || n.includes('af1')) return 'Nike Air Force 1';
    if (n.includes('air max 1')) return 'Nike Air Max 1';
    if (n.includes('air max 90')) return 'Nike Air Max 90';
    if (n.includes('yeezy 350')) return 'Yeezy Boost 350';
    if (n.includes('yeezy 500')) return 'Yeezy 500';
    if (n.includes('yeezy 700')) return 'Yeezy 700';
    if (n.includes('550')) return 'New Balance 550';
    if (n.includes('990')) return 'New Balance 990';
    return '';
  };

  // ============================================
  // UPDATE ITEM
  // ============================================
  const updateItem = (id, field, value) => {
    setEnrichedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const updated = { ...item, [field]: value };
      
      // Recalculate status when color changes
      if (field === 'color') {
        updated.status = value ? 'ready' : 'needs_color';
      }
      // Handle promoted toggle
      if (field === 'promotedOn' || field === 'adRate') {
        // already set above via [field]: value
      }
      
      return updated;
    }));
  };

  const removeItem = (id) => {
    setEnrichedItems(prev => prev.filter(item => item.id !== id));
  };

  // ============================================
  // PHOTO UPLOAD
  // ============================================
 const handlePhotoUpload = async (id, files) => {
    const uploadedUrls = [];

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
      const filePath = `listing-photos/${fileName}`;

      const { data, error } = await supabase.storage
        .from('listing-photos')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (error) {
        console.error('Photo upload failed:', error.message);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('listing-photos')
        .getPublicUrl(filePath);

      if (urlData?.publicUrl) {
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    if (uploadedUrls.length === 0) {
      alert('Photo upload failed. Check that the "listing-photos" bucket exists in Supabase Storage.');
      return;
    }

    setEnrichedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        photos: [...item.photos, ...uploadedUrls].slice(0, 12),
        photosSource: 'user'
      };
    }));
  };

  const removePhoto = (itemId, photoIndex) => {
    setEnrichedItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        photos: item.photos.filter((_, idx) => idx !== photoIndex)
      };
    }));
  };

  // ============================================
  // PUBLISH
  // ============================================
  const getReadyItems = () => enrichedItems.filter(i => i.status === 'ready' && i.photos.length > 0);
  const getNeedsAttentionItems = () => enrichedItems.filter(i => i.status !== 'ready' || i.photos.length === 0);

  const publishItems = async (itemsToPublish) => {
    if (!itemsToPublish.length) return;
    
    setPublishing(true);
    
    try {
      // Format items for API
      const products = itemsToPublish.map(item => ({
        // Use EPID if available
        epid: item.epid,
        // Fallback data if no EPID
        sku: item.styleCode,
        styleId: item.styleCode,
        name: item.title,
        brand: item.brand,
        color: item.color,
        colorway: item.colorway,
        department: item.department,
        silhouette: item.silhouette,
        type: item.type,
        catalogAspects: item.catalogAspects,
        condition: item.condition,
        description: item.description,
        categoryId: item.categoryId,
        image: item.photos[0],
        images: item.photos,
        sizes: [{
          size: item.shoeSize,
          price: item.price,
          qty: item.qty || 1,  // QTY SUPPORT: Use actual qty
          stockxListingId: item.stockxListingIds?.[0] || item.stockxListingId
        }],
        // Promoted listing data
        promoted: item.promotedOn ? { enabled: true, adRate: item.adRate } : null,
        // QTY SUPPORT: Track all stockxListingIds for mapping creation
        _stockxListingIds: item.stockxListingIds || []
      }));

      const res = await fetch('/api/ebay-listings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ebayToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ products, publishImmediately: true })
      });

      const data = await res.json();

      if (res.ok && data.created > 0) {
        // QTY SUPPORT: Merge stockxListingIds back into createdOffers for CrossList
        if (data.createdOffers) {
          data.createdOffers = data.createdOffers.map(offer => {
            // Find matching item to get all stockxListingIds
            const matchingItem = itemsToPublish.find(item => 
              item.styleCode === offer.baseSku && item.shoeSize === offer.size
            );
            return {
              ...offer,
              stockxListingIds: matchingItem?.stockxListingIds || []
            };
          });
        }
        
        showToast(`✅ Published ${data.created} listing(s) to eBay!`);
        
        // Remove published items from list
        const publishedSkus = new Set(data.createdOffers?.map(o => `${o.baseSku}-${o.size}`));
        setEnrichedItems(prev => prev.filter(item => 
          !publishedSkus.has(`${item.styleCode}-${item.shoeSize}`)
        ));

        // If all done, go back
        if (enrichedItems.length === itemsToPublish.length) {
          setTimeout(() => onComplete?.(data), 1500);
        }
      } else {
        const errorMsg = data.errors?.[0]?.error || data.error || 'Failed to publish';
        showToast(errorMsg, 'error');
      }
    } catch (e) {
      console.error('[ListingReview] Publish error:', e);
      showToast('Failed to publish listings', 'error');
    }
    
    setPublishing(false);
  };

  // ============================================
  // RENDER
  // ============================================
  const card = { background: c.card, borderRadius: 12, border: `1px solid ${c.border}` };
  const input = {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
    fontSize: 14
  };

  const readyCount = getReadyItems().length;
  const needsAttentionCount = getNeedsAttentionItems().length;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>{'🔍'}</div>
        <div style={{ color: c.textMuted }}>Searching eBay Catalog for product data...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: '12px 20px',
          background: toast.type === 'error' ? c.red : c.green,
          borderRadius: 8, color: '#fff', fontWeight: 600, zIndex: 1000
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={onBack} style={{ 
          background: 'none', border: 'none', color: c.textMuted, 
          cursor: 'pointer', fontSize: 13, marginBottom: 8, padding: 0 
        }}>
          ← Back to Cross List
        </button>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>📋 Review Before Publishing</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: c.textMuted }}>
          Review and edit your listings before they go live on eBay
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>TOTAL ITEMS</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{enrichedItems.length}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>READY TO PUBLISH</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.green }}>{readyCount}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>NEEDS ATTENTION</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.gold }}>{needsAttentionCount}</div>
        </div>
        <div style={{ ...card, padding: '12px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 4 }}>EPID FOUND</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.blue || '#3b82f6' }}>
            {enrichedItems.filter(i => i.epidFound).length}
          </div>
        </div>
      </div>

      {/* Items List */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 20 }}>
        {enrichedItems.map((item, idx) => {
          const isExpanded = expandedId === item.id;
          const needsAttention = item.status !== 'ready' || item.photos.length === 0;
          
          return (
            <div key={item.id} style={{ borderBottom: idx < enrichedItems.length - 1 ? `1px solid ${c.border}` : 'none' }}>
              {/* Item Row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                style={{
                  padding: 16, display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent'
                }}
              >
                {/* Photo */}
                <div style={{
                  width: 56, height: 56, background: '#222', borderRadius: 8,
                  overflow: 'hidden', flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  {item.photos[0] ? (
                    <img src={item.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 20, opacity: 0.5 }}>{'📷'}</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>SKU: {item.styleCode}</span>
                    <span>Size: {item.shoeSize}</span>
                    <span>${item.price}</span>
                    {item.color ? (
                      <span style={{ color: c.green }}>Color: {item.color}</span>
                    ) : (
                      <span style={{ color: c.gold }}>{'⚠️'} Color needed</span>
                    )}
                    {item.photos.length === 0 && (
                      <span style={{ color: c.gold }}>{'⚠️'} Photos needed</span>
                    )}
                  </div>
                </div>

                {/* Source Badge */}
                <div style={{
                  padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: item.epidFound ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.1)',
                  color: item.epidFound ? '#3b82f6' : c.textMuted
                }}>
                  {item.epidFound ? '✨ EPID' : 'Manual'}
                </div>

                {/* Status */}
                <div style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: needsAttention ? `${c.gold}20` : `${c.green}20`,
                  color: needsAttention ? c.gold : c.green
                }}>
                  {needsAttention ? '⚠️ Needs Info' : '✅ Ready'}
                </div>

                {/* Expand Arrow */}
                <div style={{ color: c.textMuted }}>{isExpanded ? '▼' : '▶'}</div>
              </div>

           {/* Expanded Edit Form */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px', background: 'rgba(255,255,255,0.02)', borderTop: `1px solid ${c.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: marketDataCache[item.styleCode] ? '1fr 310px' : '1fr', gap: 16 }}>
                  <div>
                  {/* Photos Section */}
                  <div style={{ marginTop: 16, marginBottom: 16 }}>
                    <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 8 }}>
                      PHOTOS ({item.photos.length}/12)
                      <span style={{ marginLeft: 8, color: item.photosSource === 'ebay' ? '#3b82f6' : c.textMuted }}>
                        Source: {item.photosSource === 'ebay' ? 'eBay Catalog' : item.photosSource === 'stockx' ? 'StockX' : 'Uploaded'}
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {item.photos.map((photo, photoIdx) => (
                        <div key={photoIdx} style={{ position: 'relative' }}>
                          <img src={photo} alt="" style={{
                            width: 80, height: 80, objectFit: 'cover', borderRadius: 8,
                            border: `1px solid ${c.border}`
                          }} />
                          <button
                            onClick={(e) => { e.stopPropagation(); removePhoto(item.id, photoIdx); }}
                            style={{
                              position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                              borderRadius: '50%', background: c.red, border: 'none',
                              color: '#fff', fontSize: 12, cursor: 'pointer'
                            }}
                          >×</button>
                          {photoIdx === 0 && (
                            <div style={{
                              position: 'absolute', bottom: 4, left: 4, fontSize: 8,
                              background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: 4
                            }}>Main</div>
                          )}
                        </div>
                      ))}
                      {item.photos.length < 12 && (
                        <label style={{
                          width: 80, height: 80, border: `2px dashed ${c.border}`, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: c.textMuted, fontSize: 24
                        }}>
                          +
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handlePhotoUpload(item.id, e.target.files)}
                            style={{ display: 'none' }}
                          />
                        </label>
                      )}
                    </div>
                    {item.photos.length === 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: c.gold }}>
                        {'⚠️'} At least 1 photo required. Upload photos above.
                      </div>
                    )}
                  </div>

                  {/* Form Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {/* Title */}
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>
                        TITLE
                        {item.titleSource === 'ebay' && <span style={{ color: '#3b82f6', marginLeft: 6 }}>from eBay</span>}
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, 'title', e.target.value.slice(0, 80))}
                        style={input}
                        maxLength={80}
                      />
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{item.title.length}/80</div>
                    </div>

                    {/* Price */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>PRICE</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: c.textMuted }}>$</span>
                     <input
                        type="text"
                        inputMode="decimal"
                        value={item.price}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateItem(item.id, 'price', val);
                          }
                        }}
                        
                        style={{ ...input, paddingLeft: 28 }}
                      />
                      </div>
                    </div>

                    {/* Size */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>SIZE</label>
                      <input
                        type="text"
                        value={item.shoeSize}
                        onChange={(e) => updateItem(item.id, 'shoeSize', e.target.value)}
                        style={input}
                      />
                    </div>

                    {/* Condition */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>CONDITION</label>
                      <select
                        value={item.condition}
                        onChange={(e) => updateItem(item.id, 'condition', e.target.value)}
                        style={{ ...input, cursor: 'pointer' }}
                      >
                        {CONDITIONS.map(cond => (
                          <option key={cond.value} value={cond.value}>{cond.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Color */}
                    <div>
                      <label style={{ fontSize: 11, color: item.color ? c.textMuted : c.gold, display: 'block', marginBottom: 6 }}>
                        COLOR {!item.color && '⚠️ REQUIRED'}
                      </label>
                      <select
                        value={item.color || ''}
                        onChange={(e) => updateItem(item.id, 'color', e.target.value)}
                        style={{ ...input, borderColor: item.color ? c.border : c.gold, cursor: 'pointer' }}
                      >
                        <option value="">Select Color...</option>
                        {COLORS.map(color => (
                          <option key={color} value={color}>{color}</option>
                        ))}
                      </select>
                    </div>

                    {/* Brand */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>BRAND</label>
                      <input
                        type="text"
                        value={item.brand}
                        onChange={(e) => updateItem(item.id, 'brand', e.target.value)}
                        style={input}
                      />
                    </div>

                    {/* Department */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>DEPARTMENT</label>
                      <select
                        value={item.department}
                        onChange={(e) => updateItem(item.id, 'department', e.target.value)}
                        style={{ ...input, cursor: 'pointer' }}
                      >
                        {DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>

                    {/* Style Code */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>STYLE CODE</label>
                      <input
                        type="text"
                        value={item.styleCode}
                        onChange={(e) => updateItem(item.id, 'styleCode', e.target.value)}
                        style={input}
                      />
                    </div>

                    {/* Silhouette */}
                    <div>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>SILHOUETTE</label>
                      <input
                        type="text"
                        value={item.silhouette}
                        onChange={(e) => updateItem(item.id, 'silhouette', e.target.value)}
                        style={input}
                        placeholder="e.g., Air Jordan 1"
                      />
                    </div>

                    {/* Description */}
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>DESCRIPTION</label>
                      <textarea
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        rows={5}
                        style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{item.description.length}/4000</div>
                    </div>
                  </div>

                  {/* Promoted Listing Toggle */}
                  <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${c.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Promoted Listing</div>
                        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 2 }}>Only pay when it sells</div>
                      </div>
                      <div onClick={() => updateItem(item.id, 'promotedOn', !item.promotedOn)}
                        style={{ width: 42, height: 22, borderRadius: 11, background: item.promotedOn ? c.green : '#333', cursor: 'pointer', position: 'relative' }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: item.promotedOn ? 22 : 2, transition: 'left 0.2s' }} />
                      </div>
                    </div>
                    {item.promotedOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600 }}>Ad Rate</span>
                        <div style={{ position: 'relative', width: 60 }}>
                          <input type="text" inputMode="decimal" value={item.adRate}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d{0,1}$/.test(val)) {
                                updateItem(item.id, 'adRate', val);
                              }
                            }}
                            style={{ width: '100%', padding: '7px 22px 7px 8px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`, borderRadius: 6, color: c.text, fontSize: 13, fontWeight: 700 }} />
                          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: c.textMuted }}>%</span>
                        </div>
                        {['2', '4', '5', '8'].map(r => (
                          <button key={r} onClick={() => updateItem(item.id, 'adRate', r)}
                            style={{
                              padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                              border: item.adRate === r ? `1px solid ${c.green}` : `1px solid ${c.border}`,
                              background: item.adRate === r ? 'rgba(34,197,94,0.1)' : 'transparent',
                              color: item.adRate === r ? c.green : c.textMuted
                            }}>{r}%</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Remove Button */}
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                      style={{
                        padding: '8px 16px', background: 'rgba(239,68,68,0.1)',
                        border: 'none', borderRadius: 6, color: c.red,
                        fontSize: 12, cursor: 'pointer'
                      }}
                    >
                      {'🗑️'} Remove from batch
                    </button>
                  </div>
                  </div>{/* end left column */}

                  {/* ═══ RIGHT: PRICING INTELLIGENCE ═══ */}
                  {marketDataCache[item.styleCode] && (
                    <PricingIntelligence
                      price={String(item.price)}
                      setPrice={v => updateItem(item.id, 'price', v)}
                      promotedOn={item.promotedOn}
                      adRate={item.adRate}
                      stockxAsk={item.yourAsk || item.price}
                      marketData={marketDataCache[item.styleCode]}
                      size={item.shoeSize}
                      cost={item.cost || 0}
                      ebaySellerLevel={ebaySellerLevel}
                      ebayStoreType={ebayStoreType}
                      c={c}
                    />
                  )}
                  </div>{/* end grid */}
                </div>
              )}
            </div>
          );
        })}

        {enrichedItems.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: c.textMuted }}>
            No items to review
          </div>
        )}
      </div>

      {/* Action Bar */}
      {enrichedItems.length > 0 && (
        <div style={{ ...card, padding: 16, display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px', background: 'transparent',
              border: `1px solid ${c.border}`, borderRadius: 8,
              color: c.textMuted, fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          {needsAttentionCount > 0 && readyCount > 0 && (
            <button
              onClick={() => publishItems(getReadyItems())}
              disabled={publishing}
              style={{
                padding: '12px 24px', background: c.gold,
                border: 'none', borderRadius: 8,
                color: '#000', fontSize: 14, fontWeight: 700,
                cursor: publishing ? 'wait' : 'pointer'
              }}
            >
              {publishing ? '⏳ Publishing...' : `Publish ${readyCount} Ready (Skip ${needsAttentionCount})`}
            </button>
          )}

          <button
            onClick={() => publishItems(getReadyItems())}
            disabled={publishing || readyCount === 0}
            style={{
              padding: '12px 24px',
              background: readyCount === 0 ? '#333' : c.green,
              border: 'none', borderRadius: 8,
              color: readyCount === 0 ? '#666' : '#fff',
              fontSize: 14, fontWeight: 700,
              cursor: readyCount === 0 ? 'not-allowed' : publishing ? 'wait' : 'pointer'
            }}
          >
            {publishing ? '⏳ Publishing...' : `🚀 Publish ${readyCount > 0 ? readyCount : 'All'} to eBay`}
          </button>
        </div>
      )}

      {/* Tip */}
      <div style={{
        marginTop: 16, padding: 12,
        background: 'rgba(201,169,98,0.1)',
        border: `1px solid ${c.gold}30`,
        borderRadius: 8
      }}>
        <div style={{ fontSize: 12, color: c.gold, fontWeight: 600, marginBottom: 4 }}>{'💡'} Tips</div>
        <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5 }}>
          • Items with <span style={{ color: '#3b82f6' }}>✨ EPID</span> have auto-filled data from eBay's catalog<br />
          • Click any item to expand and edit all fields<br />
          • Fill in missing Color to mark items as "Ready"<br />
          • Upload photos if none were found automatically
        </div>
      </div>
    </div>
  );
}
