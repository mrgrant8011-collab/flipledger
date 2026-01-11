# FlipLedger State Machine Documentation

## Overview
This document maps all state flows in FlipLedger to ensure production-ready architecture.

---

## 1. APP NAVIGATION STATE

```
States: dashboard | inventory | sales | expenses | cpa | import | settings

                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
┌─────────────┐  click   ┌───────────┐  click   ┌───────────┐     │
│  DASHBOARD  │ ──────▶  │ INVENTORY │ ──────▶  │   SALES   │ ────┘
└─────────────┘          └───────────┘          └───────────┘
       │                       │                      │
       │ click                 │ click                │ click
       ▼                       ▼                      ▼
┌─────────────┐          ┌───────────┐          ┌───────────┐
│  EXPENSES   │          │    CPA    │          │  IMPORT   │
└─────────────┘          └───────────┘          └───────────┘
                               │
                               │ click
                               ▼
                         ┌───────────┐
                         │ SETTINGS  │
                         └───────────┘

Stored in: useState('dashboard')
Transitions: setPage('pageName')
```

---

## 2. STOCKX CSV IMPORT STATE

```
States: idle | preview | importing | done | error

┌────────┐  upload file   ┌─────────────┐  click import  ┌────────────┐
│  IDLE  │ ─────────────▶ │   PREVIEW   │ ─────────────▶ │ IMPORTING  │
└────────┘                └─────────────┘                └────────────┘
     ▲                          │                              │
     │                          │ cancel                       │ success
     │                          ▼                              ▼
     │                    ┌────────────┐                 ┌──────────┐
     └────────────────────│   IDLE     │◀────────────────│   DONE   │
                          └────────────┘   auto-reset    └──────────┘

Stored in: stockxImport = { show: false, data: [], year: 'all', month: 'all', headers: [] }

State mapping:
- show: false, data: []     → IDLE
- show: true, data: [...]   → PREVIEW
- (importing happens synchronously)
- show: false after import  → DONE/IDLE
```

---

## 3. EBAY CSV IMPORT STATE

```
(Same flow as StockX)

┌────────┐  upload file   ┌─────────────┐  click import  ┌────────────┐
│  IDLE  │ ─────────────▶ │   PREVIEW   │ ─────────────▶ │ IMPORTING  │
└────────┘                └─────────────┘                └────────────┘
     ▲                          │                              │
     │                          │ cancel                       │ success
     │                          ▼                              ▼
     │                    ┌────────────┐                 ┌──────────┐
     └────────────────────│   IDLE     │◀────────────────│   DONE   │
                          └────────────┘                 └──────────┘

Additional eBay-specific logic:
- Skips metadata rows (finds header by searching for "Transaction creation date")
- Only imports Type="Order" rows (skips Refunds, Payouts, Fees)
- Parses date format "Dec 27, 2025" → "2025-12-27"

Stored in: ebayImport = { show: false, data: [], year: 'all', month: 'all', headers: [] }
```

---

## 4. SALE LIFECYCLE STATE

```
States: (not exists) | pending | confirmed | deleted

                         CSV Import / API Sync
                                 │
                                 ▼
┌───────────────┐  add cost  ┌─────────────┐  delete  ┌─────────────┐
│    PENDING    │ ─────────▶ │  CONFIRMED  │ ───────▶ │   DELETED   │
│ (pendingCosts)│            │   (sales)   │          │  (removed)  │
└───────────────┘            └─────────────┘          └─────────────┘
       │                            │
       │ delete                     │ edit
       ▼                            ▼
┌───────────────┐            ┌─────────────┐
│   DELETED     │            │  CONFIRMED  │
│   (removed)   │            │  (updated)  │
└───────────────┘            └─────────────┘

Key function: confirmSaleWithCost(saleId, cost, channel)
- Finds sale in pendingCosts
- Checks for duplicates (by orderId)
- Creates new sale with unique ID
- Preserves original platform (sale.platform || channel)
- Removes from pendingCosts
- Adds to sales

Data flow:
1. Import CSV → pendingCosts[]
2. User adds cost → sales[]
3. pendingCosts item removed
```

---

## 5. INVENTORY ITEM LIFECYCLE STATE

```
States: (not exists) | in_stock | sold | deleted

┌───────────────┐  mark sold  ┌─────────────┐
│   IN_STOCK    │ ──────────▶ │    SOLD     │
│  (sold:false) │             │ (sold:true) │
└───────────────┘             └─────────────┘
       │                            │
       │ delete                     │ delete
       ▼                            ▼
┌───────────────┐             ┌─────────────┐
│   DELETED     │             │   DELETED   │
│   (removed)   │             │  (removed)  │
└───────────────┘             └─────────────┘

Stored in: purchases[] array
Each item: { id, name, sku, size, cost, date, sold: boolean }
```

---

## 6. PLATFORM CONNECTION STATE

```
States: disconnected | connecting | connected | syncing | error

┌──────────────┐  click connect  ┌────────────┐  OAuth success  ┌───────────┐
│ DISCONNECTED │ ──────────────▶ │ CONNECTING │ ──────────────▶ │ CONNECTED │
└──────────────┘                 └────────────┘                 └───────────┘
       ▲                               │                              │
       │                               │ OAuth fail                   │ click sync
       │                               ▼                              ▼
       │                         ┌───────────┐                  ┌───────────┐
       │                         │   ERROR   │                  │  SYNCING  │
       │                         └───────────┘                  └───────────┘
       │                                                              │
       │  disconnect                                                  │ done
       └──────────────────────────────────────────────────────────────┘

StockX:
- stockxConnected: boolean
- stockxToken: string | null
- syncing: boolean

eBay:
- ebayConnected: boolean (UI only currently)
- API integration pending
```

---

## 7. MODAL STATE

```
States: null | addPurchase | addSale | editSale | addExpense | addStorage | addMileage

┌────────┐  open modal   ┌─────────────────┐
│  NULL  │ ────────────▶ │  MODAL_ACTIVE   │
└────────┘               │ (modal = 'xxx') │
     ▲                   └─────────────────┘
     │                          │
     │  submit/cancel           │
     └──────────────────────────┘

Stored in: modal = null | 'addPurchase' | 'addSale' | etc.
Form data: formData = {} (shared object for all forms)
```

---

## 8. SELECTION STATE (Bulk Operations)

```
Sales Selection:
- selectedSales: Set<id>
- Select all: new Set(allVisibleIds)
- Clear: new Set()
- Toggle: add/delete from Set

Inventory Selection:
- selectedInventory: Set<id>
- Same operations

Pending Selection:
- selectedPending: Set<id>
- Same operations

State transitions:
┌─────────┐  click checkbox  ┌──────────┐  click delete  ┌─────────┐
│  NONE   │ ───────────────▶ │ SELECTED │ ─────────────▶ │ DELETED │
│ Set([]) │                  │ Set([x]) │                │ Set([]) │
└─────────┘                  └──────────┘                └─────────┘
```

---

## 9. PAGINATION STATE

```
Sales:
- salesPage: number (starts at 1)
- ITEMS_PER_PAGE: 50
- Calculated: start = (page-1) * 50, end = start + 50

Inventory:
- inventoryPage: number (starts at 1)
- Same calculation

Transitions:
- Click page number → setPage(n)
- Click prev → setPage(p => Math.max(1, p-1))
- Click next → setPage(p => Math.min(maxPages, p+1))
- Sort/filter change → setPage(1) (reset to page 1)
```

---

## 10. DATA PERSISTENCE

```
localStorage keys:
- flipledger_purchases    → Inventory items
- flipledger_sales        → Confirmed sales
- flipledger_expenses     → Expenses
- flipledger_storage      → Storage fees
- flipledger_mileage      → Mileage records
- flipledger_settings     → User settings (fee rates, etc)
- flipledger_goals        → Monthly/yearly goals
- flipledger_pending      → Pending sales (needs cost)
- flipledger_stockx_token → StockX OAuth token

Save triggers: useEffect hooks watching each state array
Load: useState(() => localStorage.getItem(...))
```

---

## AUDIT FINDINGS

### ✅ CORRECT
1. Duplicate ID prevention on sales import
2. Platform preservation from CSV import
3. Pagination resets on filter/sort change
4. localStorage persistence on all data changes
5. Bulk delete with confirmation
6. Selection state properly cleared after operations

### ⚠️ POTENTIAL ISSUES
1. No error boundaries - app crash = white screen
2. No loading states during sync
3. localStorage has 5MB limit - heavy users could hit it
4. No data validation on CSV import
5. No offline detection

### 🔧 RECOMMENDATIONS FOR PRODUCTION
1. Add error boundaries around main components
2. Add loading spinners during async operations
3. Add data validation on all inputs
4. Add export reminder / auto-backup prompt
5. Add localStorage usage monitoring
6. Consider IndexedDB for larger storage needs

---

## NEXT STEPS FOR PHASE 2
1. Replace localStorage with Supabase/Firebase
2. Add user authentication
3. Add cloud backup
4. Add error reporting (Sentry)
5. Add analytics (what features are used)
