# FlipLedger v2.0 - Refactored Sync System

## 🎯 What's New

This refactored version ensures:

1. ✅ **Every sale saves ALL details**: price, fees, cost, payout, and order_id
2. ✅ **All writes go through `safeDatabase.js`** - single source of truth
3. ✅ **Duplicates are impossible** - double-checked at code AND database level
4. ✅ **Inventory updates correctly** - auto-matching by SKU+Size
5. ✅ **Plug-and-play sync** - just import and use

---

## 📁 Files Included

```
flipledger-refactored/
├── src/
│   ├── safeDatabase.js      ← NEW: Centralized safe write functions
│   └── syncModule.js        ← NEW: Plug-and-play sync functions
├── api/
│   ├── stockx-sales.js      ← UPDATED: Returns complete sale data
│   └── ebay-sales.js        ← UPDATED: Returns complete sale data
├── database/
│   └── migration_v2.sql     ← NEW: Database updates (run first!)
└── README.md                ← This file
```

---

## 🚀 Step-by-Step Implementation

### STEP 1: Run Database Migration (REQUIRED)

Before deploying any code, run the migration in Supabase:

1. Go to your Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy/paste the ENTIRE contents of `database/migration_v2.sql`
5. Click **Run** (or press Cmd/Ctrl+Enter)
6. Verify you see "Success" with no errors

**What this does:**
- Adds `order_id` column to `pending_costs` and `sales` tables
- Adds `payout`, `fees`, `buyer`, `ad_fee`, `note`, `image` columns
- Creates unique constraints to prevent duplicate orders at DB level
- Adds indexes for fast lookups

---

### STEP 2: Replace API Files

Copy these files to your `api/` folder, replacing the old versions:

| File | What it does |
|------|--------------|
| `api/stockx-sales.js` | Fetches StockX sales with ALL financial details |
| `api/ebay-sales.js` | Fetches eBay sales with ALL financial details |

---

### STEP 3: Add Source Files

Copy these files to your `src/` folder:

| File | What it does |
|------|--------------|
| `src/safeDatabase.js` | Replace your existing one - handles ALL writes safely |
| `src/syncModule.js` | NEW - provides easy-to-use sync functions |

---

### STEP 4: Update Your App.jsx

Replace your current sync code with the new module. Here's how:

#### 4a. Add the import at the top of App.jsx:

```javascript
import { 
  syncStockXSales, 
  syncEbaySales,
  transformPendingForDisplay 
} from './syncModule';
```

#### 4b. Replace your `fetchStockXSales` function with:

```javascript
const fetchStockXSales = async () => {
  if (!stockxToken) return;
  setStockxSyncing(true);
  
  try {
    const result = await syncStockXSales(user.id, stockxToken, {
      year: stockxApiFilter.year,
      month: stockxApiFilter.month,
      onProgress: (p) => console.log(p.message)
    });
    
    if (result.success) {
      // Update local state with saved items
      if (result.saved.length > 0) {
        setPendingCosts(prev => [
          ...prev, 
          ...result.saved.map(transformPendingForDisplay)
        ]);
      }
      
      // Show result message
      const msg = [];
      if (result.saved.length > 0) msg.push(`✓ ${result.saved.length} new sales synced`);
      if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} already existed`);
      if (result.errors.length > 0) msg.push(`${result.errors.length} errors`);
      alert(msg.join('\n') || 'Sync complete - no new sales');
    } else {
      alert('Sync failed: ' + result.error);
    }
  } catch (error) {
    alert('Sync failed: ' + error.message);
  }
  
  setStockxSyncing(false);
};
```

#### 4c. Replace your eBay sync (the onClick handler) with:

```javascript
const syncEbay = async () => {
  setEbaySyncing(true);
  
  try {
    const result = await syncEbaySales(user.id, ebayToken, {
      year: ebayApiFilter.year,
      month: ebayApiFilter.month,
      refreshToken: localStorage.getItem('flipledger_ebay_refresh'),
      onTokenRefresh: (newToken) => {
        localStorage.setItem('flipledger_ebay_token', newToken);
        setEbayToken(newToken);
      },
      onProgress: (p) => console.log(p.message)
    });
    
    if (result.success) {
      // Update local state with saved items
      if (result.saved.length > 0) {
        setPendingCosts(prev => [
          ...prev, 
          ...result.saved.map(transformPendingForDisplay)
        ]);
      }
      
      // Show result message
      const msg = [];
      if (result.saved.length > 0) {
        const withImages = result.saved.filter(s => s.image).length;
        msg.push(`✓ ${result.saved.length} eBay sales synced (${withImages} with images)`);
      }
      if (result.duplicates.length > 0) msg.push(`${result.duplicates.length} already existed`);
      alert(msg.join('\n') || 'All caught up - no new sales');
    } else {
      alert('Sync failed: ' + result.error);
    }
  } catch (error) {
    alert('Sync failed: ' + error.message);
  }
  
  setEbaySyncing(false);
};
```

Then update your eBay sync button's `onClick` to just call `syncEbay()`.

---

### STEP 5: Deploy

Deploy to Vercel as normal:

```bash
vercel --prod
```

---

## 🧪 Testing Checklist

After deployment, test these scenarios:

### Test 1: Duplicate Prevention
1. Sync StockX sales
2. Note how many were imported
3. Sync again immediately
4. **Expected**: "X already existed" message, 0 new imports

### Test 2: eBay Sync
1. Connect eBay if not already
2. Select a year with sales
3. Sync eBay sales
4. **Expected**: Sales appear in Pending Costs with images

### Test 3: Confirm a Sale
1. Click a pending sale
2. Enter a cost (e.g., $50)
3. Click Confirm
4. **Expected**: Sale moves to completed sales with correct profit calculation

### Test 4: Check Database
1. Go to Supabase → Table Editor → `pending_costs`
2. Verify `order_id` column has values like `12345678` (StockX) or `ebay_12-12345-12345` (eBay)
3. Check `sales` table has the same structure

---

## 📊 What Gets Saved

### Pending Costs (from sync)
| Field | Source |
|-------|--------|
| `name` | Product name |
| `sku` | Style ID / Item ID |
| `size` | Product size |
| `sale_price` | Gross sale price |
| `fees` | Total platform fees |
| `payout` | Net payout to you |
| `platform` | StockX / eBay |
| `sale_date` | When sold |
| `order_id` | **UNIQUE** - prevents duplicates |
| `image` | Product image URL |
| `buyer` | Buyer username (eBay) |
| `ad_fee` | Advertising fee (eBay) |

### Confirmed Sales (after entering cost)
All fields above, PLUS:
| Field | Source |
|-------|--------|
| `cost` | What you paid for item |
| `profit` | `payout - cost` |
| `inventory_id` | Link to inventory (if matched) |

---

## 🔧 How Duplicate Prevention Works

**Level 1: Code Check (Fast)**
```javascript
// Before saving, we batch-check all order_ids
const existingIds = await batchCheckDuplicates(userId, orderIds);
// Skip any that already exist
```

**Level 2: Database Constraint (Bulletproof)**
```sql
UNIQUE (user_id, order_id)
```
Even if code check fails, database will reject duplicates.

**Level 3: Cross-Table Check**
We check BOTH `pending_costs` AND `sales` tables. An order synced to pending, then confirmed to sales, won't be re-synced.

---

## 🆘 Troubleshooting

### "Column order_id does not exist"
You forgot to run the migration. Go to Step 1.

### Duplicates still appearing
1. Check that `order_id` is being passed (not null)
2. Verify the unique constraint exists in Supabase
3. Check browser console for `[SafeDB] Duplicate` logs

### eBay sync fails with 401
Your token expired. The sync module will auto-refresh if you have a refresh token stored. Make sure:
```javascript
localStorage.getItem('flipledger_ebay_refresh')
```
returns a value.

### StockX images not loading
StockX image URLs are constructed from product names. Some special characters may cause issues. The image will just show a placeholder.

---

## 💡 Pro Tips

### Inventory Auto-Match
When confirming a sale, enable auto-matching:
```javascript
const result = await safeConfirmSale(userId, pendingId, cost, {
  autoMatchInventory: true  // Will find matching SKU+Size in inventory
});
```

### Bulk Import from CSV
Use the CSV import functions:
```javascript
import { importStockXCSV, importEbayCSV } from './syncModule';

const result = await importStockXCSV(userId, parsedRows, { year: '2024' });
```

---

## 🎉 Done!

Your FlipLedger now has bulletproof sync that:
- Never creates duplicates
- Saves every financial detail
- Works immediately on click
- Validates all data before saving

Questions? Check the console logs - everything is logged with `[SafeDB]` prefix.
