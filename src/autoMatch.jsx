/**
 * AUTO-MATCH STANDALONE MODULE
 * ============================
 * Location: src/autoMatch.jsx
 * 
 * Click Auto-Match → fills cost inputs with matched inventory costs
 * User reviews → confirms individually with ✓ or dismisses with ✕
 * 
 * Usage:
 * import { AutoMatchButton } from './autoMatch';
 * <AutoMatchButton userId={user.id} onComplete={() => loadPendingCosts()} />
 */

import React, { useState } from 'react';
import { supabase } from './supabase';

const extractSkuFromName = (name) => {
  if (!name) return null;
  const match = name.match(/[A-Z]{2,3}\d{4,5}-\d{3}/i);
  return match ? match[0].toUpperCase() : null;
};

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

const normalizeSize = (size) => {
  if (!size) return '';
  const s = String(size).toUpperCase().trim();
  return s.replace(/\.0$/, '');
};

/**
 * AUTO-MATCH BUTTON COMPONENT
 * ===========================
 * Scans inventory, fills cost inputs on matching pending cards.
 * User reviews the filled costs, then confirms or dismisses each one.
 */
export const AutoMatchButton = ({ userId, onComplete }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!userId) { alert('No user ID'); return; }

    setLoading(true);

    try {
      // Fetch pending costs
      const { data: pendingCosts, error: fetchError } = await supabase
        .from('pending_costs')
        .select('*')
        .eq('user_id', userId).range(0, 999999);

      if (fetchError) throw fetchError;
      if (!pendingCosts || pendingCosts.length === 0) {
        alert('No pending costs found.');
        return;
      }

      // Fetch unsold inventory (FIFO)
      const { data: inventory, error: invError } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', userId)
        .eq('sold', false)
        .order('date', { ascending: true }).range(0, 999999);

      if (invError) throw invError;
      if (!inventory || inventory.length === 0) {
        alert(`No unsold inventory found. ${pendingCosts.length} pending costs need manual entry.`);
        return;
      }

      // Build lookup map
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
      let filled = 0;
      let noMatch = 0;

      // Match and fill inputs
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
          noMatch++;
          continue;
        }

        usedInventoryIds.add(invItem.id);

        // Fill the cost input on the card
        const input = document.getElementById(`cost-${pending.id}`);
        if (input) {
          input.value = invItem.cost || '';
          input.style.background = 'rgba(201,169,98,0.15)';
          input.style.borderColor = 'rgba(201,169,98,0.4)';
          filled++;
        }
      }

      alert(`⚡ Filled ${filled} costs from inventory.\n${noMatch} items had no match.\n\nReview the costs, then tap ✓ to confirm or ✕ to dismiss each one.`);

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
      {loading ? '⏳ Scanning...' : '⚡ Auto-Match'}
    </button>
  );
};
