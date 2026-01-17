/**
 * FLIPLEDGER SAFE DATABASE MODULE v2.0
 * =====================================
 * This is the ONLY way data should be written to the database.
 * All sync functions, imports, and manual entries MUST use these functions.
 * 
 * SAFETY RULES ENFORCED:
 * 1. Duplicate orders are rejected (checked before insert + DB constraint backup)
 * 2. Zero/negative prices are rejected
 * 3. Negative costs are rejected
 * 4. Missing required fields throw clear errors
 * 5. All order IDs are tracked for idempotent re-imports
 * 
 * v2.0 CHANGES:
 * - Full sale details saved: price, fees, cost, payout, order_id
 * - Inventory auto-matching when confirming sales
 * - Enhanced duplicate detection across pending_costs AND sales tables
 */

import { supabase } from './supabase';

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validates a sale record before saving
 * @throws {Error} with clear message if validation fails
 */
const validateSale = (data) => {
  const errors = [];
  
  if (!data.name || data.name.trim() === '') {
    errors.push('Product name is required');
  }
  
  if (data.sale_price === undefined || data.sale_price === null) {
    errors.push('Sale price is required');
  } else if (typeof data.sale_price !== 'number' || isNaN(data.sale_price)) {
    errors.push('Sale price must be a valid number');
  } else if (data.sale_price <= 0) {
    errors.push('Sale price must be greater than zero');
  }
  
  if (data.cost !== undefined && data.cost !== null) {
    if (typeof data.cost !== 'number' || isNaN(data.cost)) {
      errors.push('Cost must be a valid number');
    } else if (data.cost < 0) {
      errors.push('Cost cannot be negative');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
};

/**
 * Validates a pending cost record before saving
 * @throws {Error} with clear message if validation fails
 */
const validatePendingCost = (data) => {
  const errors = [];
  
  if (!data.name || data.name.trim() === '') {
    errors.push('Product name is required');
  }
  
  if (data.sale_price === undefined || data.sale_price === null) {
    errors.push('Sale price is required');
  } else if (typeof data.sale_price !== 'number' || isNaN(data.sale_price)) {
    errors.push('Sale price must be a valid number');
  } else if (data.sale_price <= 0) {
    errors.push('Sale price must be greater than zero');
  }
  
  if (!data.platform || data.platform.trim() === '') {
    errors.push('Platform is required');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
};

/**
 * Validates an inventory record before saving
 * @throws {Error} with clear message if validation fails
 */
const validateInventory = (data) => {
  const errors = [];
  
  if (!data.name || data.name.trim() === '') {
    errors.push('Product name is required');
  }
  
  if (data.cost === undefined || data.cost === null) {
    errors.push('Cost is required');
  } else if (typeof data.cost !== 'number' || isNaN(data.cost)) {
    errors.push('Cost must be a valid number');
  } else if (data.cost < 0) {
    errors.push('Cost cannot be negative');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
};

// ============================================================
// DUPLICATE CHECK HELPERS
// ============================================================

/**
 * Check if an order already exists in pending_costs
 * @returns {Object|null} existing record if found, null otherwise
 */
const checkPendingDuplicate = async (userId, orderId) => {
  if (!orderId) return null;
  
  const { data, error } = await supabase
    .from('pending_costs')
    .select('id, name, order_id')
    .eq('user_id', userId)
    .eq('order_id', orderId)
    .maybeSingle();
  
  if (error) {
    console.error('Error checking pending duplicate:', error);
    return null;
  }
  
  return data;
};

/**
 * Check if an order already exists in sales
 * @returns {Object|null} existing record if found, null otherwise
 */
const checkSalesDuplicate = async (userId, orderId) => {
  if (!orderId) return null;
  
  const { data, error } = await supabase
    .from('sales')
    .select('id, name, order_id')
    .eq('user_id', userId)
    .eq('order_id', orderId)
    .maybeSingle();
  
  if (error) {
    console.error('Error checking sales duplicate:', error);
    return null;
  }
  
  return data;
};

/**
 * Check if an order exists in EITHER pending_costs OR sales
 * @returns {Object} { exists: boolean, location: 'pending'|'sales'|null, record: Object|null }
 */
const checkOrderExists = async (userId, orderId) => {
  if (!orderId) {
    return { exists: false, location: null, record: null };
  }
  
  // Check pending_costs first
  const pendingRecord = await checkPendingDuplicate(userId, orderId);
  if (pendingRecord) {
    return { exists: true, location: 'pending', record: pendingRecord };
  }
  
  // Check sales
  const salesRecord = await checkSalesDuplicate(userId, orderId);
  if (salesRecord) {
    return { exists: true, location: 'sales', record: salesRecord };
  }
  
  return { exists: false, location: null, record: null };
};

/**
 * Batch check for duplicates - more efficient for bulk operations
 * @returns {Set} Set of order_ids that already exist
 */
const batchCheckDuplicates = async (userId, orderIds) => {
  const existingIds = new Set();
  
  if (!orderIds || orderIds.length === 0) return existingIds;
  
  // Filter out null/undefined
  const validIds = orderIds.filter(id => id);
  if (validIds.length === 0) return existingIds;
  
  try {
    // Check pending_costs
    const { data: pendingData } = await supabase
      .from('pending_costs')
      .select('order_id')
      .eq('user_id', userId)
      .in('order_id', validIds);
    
    if (pendingData) {
      pendingData.forEach(r => existingIds.add(r.order_id));
    }
    
    // Check sales
    const { data: salesData } = await supabase
      .from('sales')
      .select('order_id')
      .eq('user_id', userId)
      .in('order_id', validIds);
    
    if (salesData) {
      salesData.forEach(r => existingIds.add(r.order_id));
    }
  } catch (error) {
    console.error('[SafeDB] Batch duplicate check error:', error);
  }
  
  return existingIds;
};

// ============================================================
// SAFE WRITE FUNCTIONS
// ============================================================

/**
 * SAFE: Add a pending cost (from StockX/eBay sync)
 * 
 * @param {string} userId - User's UUID
 * @param {Object} data - Pending cost data
 * @param {string} data.name - Product name (required)
 * @param {number} data.sale_price - Sale price (required, must be > 0)
 * @param {string} data.platform - Platform name (required)
 * @param {string} data.order_id - External order ID for duplicate prevention (CRITICAL)
 * @param {string} [data.sku] - Product SKU
 * @param {string} [data.size] - Product size
 * @param {number} [data.fees] - Platform fees
 * @param {number} [data.payout] - Net payout
 * @param {string} [data.sale_date] - Sale date (YYYY-MM-DD)
 * @param {string} [data.image] - Product image URL
 * @param {string} [data.buyer] - Buyer username (eBay)
 * @param {number} [data.ad_fee] - Ad fee (eBay)
 * 
 * @returns {Object} { success: boolean, data?: Object, duplicate?: boolean, error?: string }
 */
export const safeSavePendingCost = async (userId, data) => {
  try {
    // 1. Validate required fields
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    
    validatePendingCost(data);
    
    // 2. Check for duplicate (if order_id provided)
    if (data.order_id) {
      const existing = await checkOrderExists(userId, data.order_id);
      if (existing.exists) {
        console.log(`[SafeDB] Duplicate order rejected: ${data.order_id} (already in ${existing.location})`);
        return { 
          success: false, 
          duplicate: true, 
          location: existing.location,
          error: `Order ${data.order_id} already exists in ${existing.location}` 
        };
      }
    }
    
    // 3. Prepare record with ALL fields
    const record = {
      user_id: userId,
      name: data.name.trim(),
      sku: data.sku || '',
      size: data.size || '',
      sale_price: data.sale_price,
      platform: data.platform,
      fees: data.fees || 0,
      payout: data.payout || null,
      sale_date: data.sale_date || null,
      order_id: data.order_id || null,
      order_number: data.order_number || data.order_id || null,
      image: data.image || null,
      // New fields for complete tracking
      buyer: data.buyer || null,
      ad_fee: data.ad_fee || null,
      note: data.note || null
    };
    
    // 4. Insert with conflict handling
    const { data: result, error } = await supabase
      .from('pending_costs')
      .insert(record)
      .select()
      .single();
    
    if (error) {
      // Check if it's a duplicate constraint violation
      if (error.code === '23505') {
        console.log(`[SafeDB] DB constraint caught duplicate: ${data.order_id}`);
        return { success: false, duplicate: true, error: 'Duplicate order (caught by database)' };
      }
      throw error;
    }
    
    console.log(`[SafeDB] Pending cost saved: ${result.id} (${data.name}) [Order: ${data.order_id}]`);
    return { success: true, data: result };
    
  } catch (error) {
    console.error('[SafeDB] Error saving pending cost:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Add a completed sale with full details
 * 
 * @param {string} userId - User's UUID
 * @param {Object} data - Sale data
 * @param {string} data.name - Product name (required)
 * @param {number} data.sale_price - Sale price (required, must be > 0)
 * @param {number} data.cost - Cost basis (required, must be >= 0)
 * @param {string} data.platform - Platform name (required)
 * @param {string} [data.order_id] - External order ID for duplicate prevention
 * @param {string} [data.sku] - Product SKU
 * @param {string} [data.size] - Product size
 * @param {number} [data.fees] - Platform fees
 * @param {number} [data.payout] - Net payout from platform
 * @param {number} [data.profit] - Calculated profit (auto-calculated if not provided)
 * @param {string} [data.sale_date] - Sale date (YYYY-MM-DD)
 * @param {string} [data.image] - Product image URL
 * @param {string} [data.buyer] - Buyer username
 * @param {number} [data.ad_fee] - Advertising fee
 * @param {number} [data.inventory_id] - Link to inventory item
 * 
 * @returns {Object} { success: boolean, data?: Object, duplicate?: boolean, error?: string }
 */
export const safeSaveSale = async (userId, data) => {
  try {
    // 1. Validate required fields
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    
    validateSale(data);
    
    // 2. Check for duplicate (if order_id provided)
    if (data.order_id) {
      const existing = await checkSalesDuplicate(userId, data.order_id);
      if (existing) {
        console.log(`[SafeDB] Duplicate sale rejected: ${data.order_id}`);
        return { 
          success: false, 
          duplicate: true, 
          error: `Sale with order ${data.order_id} already exists` 
        };
      }
    }
    
    // 3. Calculate profit if not provided
    // Profit = Payout - Cost (if payout available)
    // Otherwise: Profit = SalePrice - Cost - Fees
    const fees = data.fees || 0;
    let profit;
    if (data.profit !== undefined) {
      profit = data.profit;
    } else if (data.payout) {
      profit = data.payout - data.cost;
    } else {
      profit = data.sale_price - data.cost - fees;
    }
    
    // 4. Prepare record with ALL fields
    const record = {
      user_id: userId,
      name: data.name.trim(),
      sku: data.sku || '',
      size: data.size || '',
      cost: data.cost,
      sale_price: data.sale_price,
      platform: data.platform || 'Other',
      fees: fees,
      payout: data.payout || null,
      profit: profit,
      sale_date: data.sale_date || new Date().toISOString().split('T')[0],
      order_id: data.order_id || null,
      image: data.image || null,
      buyer: data.buyer || null,
      ad_fee: data.ad_fee || null,
      note: data.note || null,
      inventory_id: data.inventory_id || null
    };
    
    // 5. Insert
    const { data: result, error } = await supabase
      .from('sales')
      .insert(record)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        console.log(`[SafeDB] DB constraint caught duplicate sale: ${data.order_id}`);
        return { success: false, duplicate: true, error: 'Duplicate sale (caught by database)' };
      }
      throw error;
    }
    
    console.log(`[SafeDB] Sale saved: ${result.id} (${data.name}) [Order: ${data.order_id}] Profit: $${profit.toFixed(2)}`);
    return { success: true, data: result };
    
  } catch (error) {
    console.error('[SafeDB] Error saving sale:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Add an inventory item
 * 
 * @param {string} userId - User's UUID
 * @param {Object} data - Inventory data
 * @param {string} data.name - Product name (required)
 * @param {number} data.cost - Purchase cost (required, must be >= 0)
 * @param {string} [data.sku] - Product SKU
 * @param {string} [data.size] - Product size
 * @param {string} [data.date] - Purchase date (YYYY-MM-DD)
 * @param {number} [data.quantity] - Quantity (default 1)
 * @param {string} [data.image] - Product image URL
 * @param {string} [data.source] - Where purchased (Nike, Finish Line, etc)
 * 
 * @returns {Object} { success: boolean, data?: Object, error?: string }
 */
export const safeSaveInventory = async (userId, data) => {
  try {
    // 1. Validate required fields
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    
    validateInventory(data);
    
    // 2. Prepare record
    const record = {
      user_id: userId,
      name: data.name.trim(),
      sku: data.sku || '',
      size: data.size || '',
      cost: data.cost,
      quantity: data.quantity || 1,
      date: data.date || new Date().toISOString().split('T')[0],
      sold: false,
      image: data.image || null,
      source: data.source || null
    };
    
    // 3. Insert
    const { data: result, error } = await supabase
      .from('inventory')
      .insert(record)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log(`[SafeDB] Inventory saved: ${result.id} (${data.name})`);
    return { success: true, data: result };
    
  } catch (error) {
    console.error('[SafeDB] Error saving inventory:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// OPTIMIZED BULK OPERATIONS
// ============================================================

/**
 * SAFE: Bulk save pending costs with pre-flight duplicate check
 * Uses batch duplicate checking for better performance
 * 
 * @param {string} userId - User's UUID
 * @param {Array} items - Array of pending cost objects
 * @returns {Object} { saved: Array, duplicates: Array, errors: Array }
 */
export const safeBulkSavePendingCosts = async (userId, items) => {
  const results = {
    saved: [],
    duplicates: [],
    errors: []
  };
  
  if (!userId || !items || items.length === 0) {
    return results;
  }
  
  console.log(`[SafeDB] Bulk saving ${items.length} pending costs...`);
  
  // Pre-flight: batch check for existing order_ids
  const orderIds = items.map(i => i.order_id).filter(Boolean);
  const existingOrderIds = await batchCheckDuplicates(userId, orderIds);
  console.log(`[SafeDB] Pre-flight found ${existingOrderIds.size} existing orders`);
  
  // Process items
  for (const item of items) {
    // Quick duplicate check using pre-fetched set
    if (item.order_id && existingOrderIds.has(item.order_id)) {
      results.duplicates.push({ item, reason: `Order ${item.order_id} already exists` });
      continue;
    }
    
    const result = await safeSavePendingCost(userId, item);
    
    if (result.success) {
      results.saved.push(result.data);
      // Add to set to catch duplicates within the same batch
      if (item.order_id) existingOrderIds.add(item.order_id);
    } else if (result.duplicate) {
      results.duplicates.push({ item, reason: result.error });
    } else {
      results.errors.push({ item, error: result.error });
    }
  }
  
  console.log(`[SafeDB] Bulk save complete: ${results.saved.length} saved, ${results.duplicates.length} duplicates, ${results.errors.length} errors`);
  
  return results;
};

/**
 * SAFE: Bulk save inventory items
 * 
 * @param {string} userId - User's UUID
 * @param {Array} items - Array of inventory objects
 * @returns {Object} { saved: Array, errors: Array }
 */
export const safeBulkSaveInventory = async (userId, items) => {
  const results = {
    saved: [],
    errors: []
  };
  
  if (!userId || !items || items.length === 0) {
    return results;
  }
  
  console.log(`[SafeDB] Bulk saving ${items.length} inventory items...`);
  
  for (const item of items) {
    const result = await safeSaveInventory(userId, item);
    
    if (result.success) {
      results.saved.push(result.data);
    } else {
      results.errors.push({ item, error: result.error });
    }
  }
  
  console.log(`[SafeDB] Bulk inventory save complete: ${results.saved.length} saved, ${results.errors.length} errors`);
  
  return results;
};

// ============================================================
// SAFE DELETE OPERATIONS
// ============================================================

/**
 * SAFE: Delete a pending cost
 */
export const safeDeletePendingCost = async (userId, id) => {
  try {
    const { error } = await supabase
      .from('pending_costs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    console.log(`[SafeDB] Pending cost deleted: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('[SafeDB] Error deleting pending cost:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Delete a sale
 */
export const safeDeleteSale = async (userId, id) => {
  try {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    console.log(`[SafeDB] Sale deleted: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('[SafeDB] Error deleting sale:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Delete an inventory item
 */
export const safeDeleteInventory = async (userId, id) => {
  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    console.log(`[SafeDB] Inventory item deleted: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('[SafeDB] Error deleting inventory:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// SAFE UPDATE OPERATIONS
// ============================================================

/**
 * SAFE: Update a sale (e.g., when confirming cost)
 */
export const safeUpdateSale = async (userId, id, updates) => {
  try {
    // Validate any price/cost updates
    if (updates.sale_price !== undefined && updates.sale_price <= 0) {
      return { success: false, error: 'Sale price must be greater than zero' };
    }
    if (updates.cost !== undefined && updates.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' };
    }
    
    const { data, error } = await supabase
      .from('sales')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`[SafeDB] Sale updated: ${id}`);
    return { success: true, data };
  } catch (error) {
    console.error('[SafeDB] Error updating sale:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Update an inventory item
 */
export const safeUpdateInventory = async (userId, id, updates) => {
  try {
    // Validate any cost updates
    if (updates.cost !== undefined && updates.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' };
    }
    
    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`[SafeDB] Inventory updated: ${id}`);
    return { success: true, data };
  } catch (error) {
    console.error('[SafeDB] Error updating inventory:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// INVENTORY MATCHING HELPER
// ============================================================

/**
 * Find matching inventory item for a pending sale
 * Matches by SKU + Size (exact match)
 * 
 * @param {string} userId - User's UUID
 * @param {string} sku - Product SKU
 * @param {string} size - Product size
 * @returns {Object|null} Matching inventory item or null
 */
export const findMatchingInventory = async (userId, sku, size) => {
  if (!userId || !sku) return null;
  
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('sku', sku)
      .eq('size', size || '')
      .eq('sold', false)
      .order('date', { ascending: true }) // FIFO: oldest first
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[SafeDB] Error finding matching inventory:', error);
    return null;
  }
};

// ============================================================
// TRANSITION HELPER: Move pending cost to confirmed sale
// ============================================================

/**
 * SAFE: Convert a pending cost to a confirmed sale
 * This is used when user enters the cost basis for a synced sale
 * 
 * @param {string} userId - User's UUID
 * @param {string} pendingId - ID of the pending_costs record
 * @param {number} cost - Cost basis entered by user
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.autoMatchInventory] - Try to match and mark inventory as sold
 * @param {string} [options.inventoryId] - Specific inventory ID to link
 * 
 * @returns {Object} { success: boolean, sale?: Object, inventory?: Object, error?: string }
 */
export const safeConfirmSale = async (userId, pendingId, cost, options = {}) => {
  try {
    // 1. Validate cost
    if (cost === undefined || cost === null) {
      return { success: false, error: 'Cost is required' };
    }
    if (typeof cost !== 'number' || isNaN(cost) || cost < 0) {
      return { success: false, error: 'Cost must be a valid non-negative number' };
    }
    
    // 2. Get the pending record
    const { data: pending, error: fetchError } = await supabase
      .from('pending_costs')
      .select('*')
      .eq('id', pendingId)
      .eq('user_id', userId)
      .single();
    
    if (fetchError || !pending) {
      return { success: false, error: 'Pending sale not found' };
    }
    
    // 3. Check if this order already exists in sales (double-check)
    if (pending.order_id) {
      const existingSale = await checkSalesDuplicate(userId, pending.order_id);
      if (existingSale) {
        // Already confirmed - just delete from pending
        await safeDeletePendingCost(userId, pendingId);
        return { success: false, duplicate: true, error: 'This sale was already confirmed' };
      }
    }
    
    // 4. Try to match inventory if requested
    let matchedInventory = null;
    let inventoryId = options.inventoryId || null;
    
    if (options.autoMatchInventory && pending.sku) {
      matchedInventory = await findMatchingInventory(userId, pending.sku, pending.size);
      if (matchedInventory) {
        inventoryId = matchedInventory.id;
        // Use inventory cost if no cost provided
        if (cost === 0 && matchedInventory.cost > 0) {
          cost = matchedInventory.cost;
        }
      }
    }
    
    // 5. Calculate profit
    // If payout is available, profit = payout - cost
    // Otherwise, profit = sale_price - fees - cost
    const fees = pending.fees || 0;
    const payout = pending.payout || (pending.sale_price - fees);
    const profit = payout - cost;
    
    // 6. Create the sale with ALL details preserved
    const saleResult = await safeSaveSale(userId, {
      name: pending.name,
      sku: pending.sku,
      size: pending.size,
      cost: cost,
      sale_price: pending.sale_price,
      platform: pending.platform,
      fees: fees,
      payout: pending.payout || payout,
      profit: profit,
      sale_date: pending.sale_date,
      order_id: pending.order_id,
      image: pending.image,
      buyer: pending.buyer,
      ad_fee: pending.ad_fee,
      note: pending.note,
      inventory_id: inventoryId
    });
    
    if (!saleResult.success) {
      return saleResult;
    }
    
    // 7. Mark inventory as sold if matched
    if (matchedInventory) {
      await safeUpdateInventory(userId, matchedInventory.id, { sold: true });
    }
    
    // 8. Delete from pending
    await safeDeletePendingCost(userId, pendingId);
    
    console.log(`[SafeDB] Sale confirmed: ${pending.order_id} -> ${saleResult.data.id} (Profit: $${profit.toFixed(2)})`);
    return { 
      success: true, 
      sale: saleResult.data,
      inventory: matchedInventory
    };
    
  } catch (error) {
    console.error('[SafeDB] Error confirming sale:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// EXPENSE OPERATIONS
// ============================================================

/**
 * Validates an expense record before saving
 * @throws {Error} with clear message if validation fails
 */
const validateExpense = (data) => {
  const errors = [];
  
  if (data.amount === undefined || data.amount === null) {
    errors.push('Amount is required');
  } else if (typeof data.amount !== 'number' || isNaN(data.amount)) {
    errors.push('Amount must be a valid number');
  } else if (data.amount <= 0) {
    errors.push('Amount must be greater than zero');
  }
  
  if (!data.category || data.category.trim() === '') {
    errors.push('Category is required');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
};

/**
 * SAFE: Save an expense (create or update)
 * 
 * @param {string} userId - User's UUID
 * @param {Object} data - Expense data
 * @param {number} data.amount - Expense amount (required, must be > 0)
 * @param {string} data.category - Expense category (required)
 * @param {string} [data.description] - Optional description
 * @param {string} [data.date] - Expense date (YYYY-MM-DD)
 * @param {string} [data.id] - If provided, updates existing expense
 * 
 * @returns {Object} { success: boolean, data?: Object, error?: string }
 */
export const safeSaveExpense = async (userId, data) => {
  try {
    // 1. Validate required fields
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    
    validateExpense(data);
    
    // 2. Prepare record
    const record = {
      user_id: userId,
      amount: data.amount,
      category: data.category.trim(),
      description: data.description?.trim() || '',
      date: data.date || new Date().toISOString().split('T')[0]
    };
    
    // 3. Insert or Update
    if (data.id) {
      // UPDATE existing expense
      const { data: updated, error } = await supabase
        .from('expenses')
        .update(record)
        .eq('id', data.id)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`[SafeDB] Expense updated: ${data.id}`);
      return { success: true, data: updated };
    } else {
      // INSERT new expense
      const { data: inserted, error } = await supabase
        .from('expenses')
        .insert(record)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`[SafeDB] Expense created: ${inserted.id}`);
      return { success: true, data: inserted };
    }
  } catch (error) {
    console.error('[SafeDB] Error saving expense:', error);
    return { success: false, error: error.message };
  }
};

/**
 * SAFE: Delete an expense
 * 
 * @param {string} userId - User's UUID
 * @param {string} id - Expense ID to delete
 * 
 * @returns {Object} { success: boolean, error?: string }
 */
export const safeDeleteExpense = async (userId, id) => {
  try {
    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }
    if (!id) {
      return { success: false, error: 'Expense ID is required' };
    }
    
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
    
    console.log(`[SafeDB] Expense deleted: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('[SafeDB] Error deleting expense:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// UTILITY: Check order existence (for UI display)
// ============================================================

export { checkOrderExists, batchCheckDuplicates };
