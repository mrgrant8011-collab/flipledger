# FlipLedger v2.0 - Complete Package

## How to Deploy

### Step 1: Run Database Migration (ALREADY DONE ✅)
You already ran the SQL migration in Supabase.

### Step 2: Upload to GitHub
1. Download this zip
2. Unzip it
3. Go to your GitHub repo
4. Delete the old `api/` and `src/` folders
5. Drag in the new `api/` and `src/` folders from this zip
6. Also upload `index.html`, `package.json`, `vite.config.js`
7. Commit changes

### Step 3: Deploy
Vercel will auto-deploy, or run:
```bash
vercel --prod
```

### Step 4: Test
1. Sync StockX → sales should import
2. Sync StockX again → should say "X already existed" (no duplicates!)
3. Same for eBay

## What's Fixed
- ✅ No more duplicate orders
- ✅ All sale details saved (price, fees, payout, order_id)
- ✅ All writes go through safe database module
- ✅ Inventory updates correctly
