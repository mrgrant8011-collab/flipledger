/**
 * AUTO-MATCH STANDALONE MODULE
 * ============================
 * Location: src/autoMatch.jsx
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
 * STEP 1: Scan pending costs and find matches WITHOUT executing
 */
export const scanAutoMatch = async (userId) => {
  if (!userId) return { success: false, error: 'User ID is required' };

  try {
    const { data: pendingCosts, error: fetchError } = await supabase
      .from('pending_costs')
      .select('*')
      .eq('user_id', userId).range(0, 999999);

    if (fetchError) throw fetchError;
    if (!pendingCosts || pendingCosts.length === 0) {
      return { success: true, totalPending: 0, matchCount: 0, unmatchCount: 0, matches: [] };
    }

    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('sold', false)
      .order('date', { ascending: true }).range(0, 999999);

    if (invError) throw invError;
    if (!inventory || inventory.length === 0) {
      return { success: true, totalPending: pendingCosts.length, matchCount: 0, unmatchCount: pendingCosts.length, matches: [] };
    }

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

    const usedInventoryIds = new Set();
    const matches = [];
    let unmatchCount = 0;
    let totalProfit = 0;

    for (const pending of pendingCosts) {
      let sku = (pending.sku || '').toUpperCase().trim();
      let size = normalizeSize(pending.size);
      if (!sku) sku = extractSkuFromName(pending.name) || '';
      if (!size) size = normalizeSize(extractSizeFromName(pending.name));

      let invItem = null;
      if (sku) {
        const key = `${sku}|${size}`;
        const candidates = inventoryMap.get(key) || [];
        invItem = candidates.find(i => !usedInventoryIds.has(i.id));
      }

      if (!invItem) {
        unmatchCount++;
        continue;
      }

      usedInventoryIds.add(invItem.id);
      const cost = invItem.cost || 0;
      const payout = pending.payout || (pending.sale_price - (pending.fees || 0));
      const profit = payout - cost;
      totalProfit += profit;

      matches.push({
        pendingId: pending.id,
        inventoryId: invItem.id,
        pending: pending,
        invItem: invItem,
        name: pending.name,
        sku: sku,
        size: pending.size || invItem.size,
        cost: cost,
        payout: payout,
        profit: profit
      });
    }

    return {
      success: true,
      totalPending: pendingCosts.length,
      matchCount: matches.length,
      unmatchCount: unmatchCount,
      totalProfit: totalProfit,
      matches: matches
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
};


/**
 * STEP 2: Execute the matches (only called after user confirms)
 * Uses the data already fetched during scan — no re-fetching
 */
export const executeAutoMatch = async (userId, matches) => {
  const results = { success: true, matched: 0, errors: [] };

  try {
    for (const m of matches) {
      try {
        const pending = m.pending;
        const invItem = m.invItem;
        const cost = invItem.cost || 0;
        const fees = pending.fees || 0;
        const payout = pending.payout || (pending.sale_price - fees);
        const profit = payout - cost;

        // Create sale
        const { error: saleError } = await supabase
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
          });

        if (saleError) {
          if (saleError.code === '23505') {
            await supabase.from('pending_costs').delete().eq('id', pending.id).eq('user_id', userId);
            continue;
          }
          throw saleError;
        }

        // Mark inventory sold
        await supabase.from('inventory').update({ sold: true }).eq('id', invItem.id).eq('user_id', userId);

        // Delete from pending
        await supabase.from('pending_costs').delete().eq('id', pending.id).eq('user_id', userId);

        results.matched++;
      } catch (err) {
        results.errors.push({ name: m.name, error: err.message });
      }
    }

    return results;

  } catch (error) {
    return { success: false, error: error.message, ...results };
  }
};


/**
 * AUTO-MATCH BUTTON COMPONENT
 * ===========================
 * Two-step flow:
 * 1. Click Auto-Match → Scans and shows preview
 * 2. Click Confirm All → Executes matches
 * 3. Click Cancel → Nothing happens
 */
export const AutoMatchButton = ({ userId, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleClick = async () => {
    if (!userId) { alert('No user ID'); return; }

    // If preview is showing, user is confirming
    if (preview) {
      setLoading(true);
      try {
        const res = await executeAutoMatch(userId, preview.matches);
        setPreview(null);
        alert(`✓ ${res.matched} sales confirmed${res.errors.length > 0 ? `\n⚠ ${res.errors.length} errors` : ''}`);
        if (onComplete) onComplete(res);
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // First click — scan only
    setLoading(true);
    try {
      const scan = await scanAutoMatch(userId);
      if (!scan.success) { alert('Error: ' + scan.error); return; }
      if (scan.matchCount === 0) {
        alert(`No matches found. ${scan.totalPending} pending costs have no matching inventory (SKU + size).`);
        return;
      }
      setPreview(scan);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
  };

  if (preview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#C9A962', fontWeight: 600 }}>
          {preview.matchCount} matches · ${preview.totalProfit.toFixed(0)} profit
        </div>
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            backgroundColor: loading ? '#666' : '#10B981',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13
          }}
        >
          {loading ? '⏳ Confirming...' : '✓ Confirm All'}
        </button>
        <button
          onClick={handleCancel}
          style={{
            backgroundColor: 'transparent',
            color: '#ef4444',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

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
      {loading ? '⏳ Scanning...' : '⚡ Auto-Match'}
    </button>
  );
};
