# FlipLedger - Safe Version

## What's Changed

This version includes a **centralized safe database module** that prevents:
- ✅ Duplicate orders (StockX and eBay)
- ✅ Zero or negative sale prices
- ✅ Negative costs
- ✅ Missing required fields

## Files Included

```
flipledger-safe/
├── src/
│   ├── App.jsx          (Updated - uses safe database functions)
│   ├── safeDatabase.js  (NEW - centralized write protection)
│   ├── supabase.js      (Unchanged)
│   ├── main.jsx         (Unchanged)
│   └── nike-examples.js (Unchanged)
├── api/
│   ├── stockx-sales.js
│   ├── stockx-auth.js
│   ├── stockx-lookup.js
│   ├── callback.js
│   ├── ebay-sales.js
│   ├── ebay-auth.js
│   ├── ebay-callback.js
│   ├── ebay-refresh.js
│   ├── google-ocr.js
│   └── scan-receipt.js
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## How to Deploy

### Option A: Replace files in your existing project
1. Replace your `src/App.jsx` with the new one
2. Add `src/safeDatabase.js` (new file)
3. Deploy as normal

### Option B: Fresh deployment
1. Upload this entire folder to Vercel/your hosting
2. Set your environment variables
3. Deploy

## Database Constraints Required

Before using this code, make sure you ran these SQL commands in Supabase:

```sql
-- Already confirmed as existing in your database:
-- unique_pending_order_per_user
-- unique_sale_order_per_user  
-- pending_price_must_be_positive
-- sale_price_must_be_positive
-- sale_cost_not_negative
```

## What's Protected Now

| Action | Before | After |
|--------|--------|-------|
| StockX API Sync | Could create duplicates | ✅ Duplicates blocked |
| StockX CSV Import | Could create duplicates | ✅ Duplicates blocked |
| eBay CSV Import | Could create duplicates | ✅ Duplicates blocked |
| Manual sale entry | Could have $0 price | ✅ Validated |
| Confirm pending sale | Race condition possible | ✅ Double-checked |

## Testing After Deployment

1. **Test duplicate prevention:**
   - Sync StockX twice
   - Second sync should show "X duplicates skipped"

2. **Test price validation:**
   - Try adding a manual sale with $0 price
   - Should show error "Sale price must be greater than zero"

3. **Test cost validation:**
   - Try confirming a sale with negative cost
   - Should show error "Cost cannot be negative"

## Need Help?

If something doesn't work, check:
1. Browser console (F12) for error messages
2. Supabase logs for database errors
3. Make sure `safeDatabase.js` is in the `src/` folder
