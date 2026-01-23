/**
 * AUTO-MATCH STANDALONE MODULE
 * ============================
 * Location: src/autoMatch.js
 * 
 * This is completely separate from your existing code.
 * If anything goes wrong, just delete this file.
 * 
 * Usage:
 * import { AutoMatchButton } from './autoMatch';
 * 
 * // In your JSX (e.g., Import page):
 * <AutoMatchButton userId={user.id} onComplete={() => loadPendingCosts()} />
 */

import React, { useState } from 'react';
import { supabase } from './supabase';

/**
 * Extract SKU/Style Code from a product name/title
 * Looks for patterns like: FZ3929-114, 305381-100, DV3853-001
 */
const extractSkuFromName = (name) => {
  if (!name) return null;
  const match = name.match(/[A-Z]{2,3}\d{4,5}-\d{3}/i);
  return match ? match[0].toUpperCase() : null;
};

/**
 * Extract size from a product name/title
 */
const extractSizeFromName = (name) => {
  if (!name) return null;
  let match = name.match(/Size\s+(\d+\.?\d*Y?)/i);
  if (match) return match[1];
  match = name.match(/US\s+(\d+\.?\d*)/i);
  if (match) return match[1];
  match = name.match(/\b(\d+\.?\d*Y)\b/i);
  if (match) return match[1];
  return null;
};

/**
 * Normalize size for comparison
 */
const normalizeSize = (size) => {
  if (!size) return '';
  const s = String(size).toUpperCase().trim();
  return s.replace(/\.0$/, '');
};

/**
 * Auto-match all pending costs to inventory and confirm them
 * 
 * @param {string} userId - User's UUID
 * @returns {Object} { success, matched, unmatched, errors, details }
 */
export const autoMatchPendingCosts = async (userId) => {
  const results = {
    success: true,
    matched: 0,
    unmatched: 0,
    errors: [],
    details: { matchedItems: [], unmatchedItems: [] }
  };
  
  if (!userId) {
    return { success: false, error: 'User ID is required', ...results };
  }
  
  try {
    console.log('[AutoMatch] Starting...');
    
    // 1. Get all pending costs
    const { data: pendingCosts, error: fetchError } = await supabase
      .from('pending_costs')
      .select('*')
      .eq('user_id', userId);
    
    if (fetchError) throw fetchError;
    if (!pendingCosts || pendingCosts.length === 0) {
      console.log('[AutoMatch] No pending costs found');
      return results;
    }
    
    console.log(`[AutoMatch] Found ${pendingCosts.length} pending costs`);
    
    // 2. Get unsold inventory (FIFO order)
    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('sold', false)
      .order('date', { ascending: true });
    
    if (invError) throw invError;
    if (!inventory || inventory.length === 0) {
      console.log('[AutoMatch] No unsold inventory');
      results.unmatched = pendingCosts.length;
      return results;
    }
    
    console.log(`[AutoMatch] Found ${inventory.length} unsold inventory`);
    
    // 3. Build lookup map (SKU|SIZE -> items[])
    const inventoryMap = new Map();
    for (const item of inventory) {
      const sku = (item.sku || '').toUpperCase().trim();
      const size = normalizeSize(item.size);
      if (sku) {
        const key = `${sku}|${size}`;
        if (!inventoryMap.has(key)) inventoryMap.set(key, []);
        inventoryMap.get(key).push(item);
      }
    }
    
    // Track used inventory
    const usedInventoryIds = new Set();
    
    // 4. Match each pending cost
    for (const pending of pendingCosts) {
      // Get SKU - from field or extract from name
      let sku = (pending.sku || '').toUpperCase().trim();
      let size = normalizeSize(pending.size);
      
      if (!sku) {
        sku = extractSkuFromName(pending.name) || '';
      }
      if (!size) {
        size = normalizeSize(extractSizeFromName(pending.name));
      }
      
      // Find match
      let invItem = null;
      if (sku) {
        const key = `${sku}|${size}`;
        const matches = inventoryMap.get(key) || [];
        invItem = matches.find(i => !usedInventoryIds.has(i.id));
      }
      
      if (!invItem) {
        results.unmatched++;
        results.details.unmatchedItems.push({
          id: pending.id,
          name: pending.name,
          sku: pending.sku || sku || '(none)',
          size: pending.size || size || '(none)'
        });
        continue;
      }
      
      // Mark as used
      usedInventoryIds.add(invItem.id);
      
      // 5. Confirm sale
      try {
        const cost = invItem.cost || 0;
        const fees = pending.fees || 0;
        const payout = pending.payout || (pending.sale_price - fees);
        const profit = payout - cost;
        
        // Create sale
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            user_id: userId,
            name: pending.name,
            sku: pending.sku || invItem.sku,
            size: pending.size || invItem.size,
            cost: cost,
            sale_price: pending.sale_price,
            platform: pending.platform,
            fees: fees,
            payout: pending.payout || payout,
            profit: profit,
            sale_date: pending.sale_date,
            order_id: pending.order_id,
            image: pending.image || invItem.image,
            buyer: pending.buyer,
            ad_fee: pending.ad_fee,
            note: pending.note,
            inventory_id: invItem.id
          })
          .select()
          .single();
        
        if (saleError) {
          if (saleError.code === '23505') {
            // Duplicate - just delete from pending
            await supabase.from('pending_costs').delete().eq('id', pending.id).eq('user_id', userId);
            usedInventoryIds.delete(invItem.id);
            continue;
          }
          throw saleError;
        }
        
        // Mark inventory sold
        await supabase.from('inventory').update({ sold: true }).eq('id', invItem.id).eq('user_id', userId);
        
        // Delete from pending
        await supabase.from('pending_costs').delete().eq('id', pending.id).eq('user_id', userId);
        
        results.matched++;
        results.details.matchedItems.push({
          name: pending.name,
          sku: invItem.sku,
          size: invItem.size,
          cost: cost,
          profit: profit
        });
        
        console.log(`[AutoMatch] ✓ ${pending.name} -> $${cost} cost, $${profit.toFixed(2)} profit`);
        
      } catch (err) {
        console.error('[AutoMatch] Error:', err.message);
        results.errors.push({ name: pending.name, error: err.message });
        usedInventoryIds.delete(invItem.id);
      }
    }
    
    console.log(`[AutoMatch] Done: ${results.matched} matched, ${results.unmatched} unmatched`);
    return results;
    
  } catch (error) {
    console.error('[AutoMatch] Fatal:', error);
    return { success: false, error: error.message, ...results };
  }
};


/**
 * AUTO-MATCH BUTTON COMPONENT
 * ===========================
 * Drop this anywhere in your app.
 * 
 * Props:
 * - userId: User's UUID (required)
 * - onComplete: Callback after matching is done (optional) - use to refresh your data
 */
export const AutoMatchButton = ({ userId, onComplete }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!userId) {
      alert('No user ID');
      return;
    }

    setLoading(true);

    try {
      const res = await autoMatchPendingCosts(userId);

      if (res.success) {
        alert(`✓ Matched: ${res.matched}\n⏳ Need manual cost: ${res.unmatched}${res.errors.length > 0 ? `\n⚠ Errors: ${res.errors.length}` : ''}`);
      } else {
        alert('Error: ' + res.error);
      }

      // Callback to refresh data
      if (onComplete) {
        onComplete(res);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        backgroundColor: loading ? '#666' : '#f59e0b',
        color: '#000',
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        fontWeight: '600',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      {loading ? '⏳ Matching...' : '⚡ Auto-Match'}
    </button>
  );
};
