# FlipLedger State Machine Diagram

## Overview
This document maps ALL data flows and state changes in FlipLedger.
Every operation that modifies data must sync to Supabase.

---

## DATA ENTITIES

### 1. INVENTORY (purchases)
```
Fields: id, name, sku, size, cost, quantity, date, sold
Supabase Table: inventory
```

### 2. SALES
```
Fields: id, name, sku, size, cost, salePrice, platform, fees, profit, saleDate, orderId
Supabase Table: sales
```

### 3. EXPENSES
```
Fields: id, category, amount, description, date
Supabase Table: expenses
```

### 4. PENDING COSTS
```
Fields: id, name, sku, size, salePrice, platform, fees, saleDate, payout
Supabase Table: pending_costs
```

### 5. SETTINGS (localStorage per user)
```
Fields: stockxLevel, stockxProcessing, stockxQuickShip, stockxDirectFee, 
        stockxDirectProcessing, stockxFlexFee, stockxFlexProcessing, 
        stockxFlexFulfillment, goatFee, goatProcessing, ebayFee, mileageRate
Storage: localStorage (flipledger_settings_{user_id})
```

### 6. GOALS (localStorage per user)
```
Fields: monthly, yearly
Storage: localStorage (flipledger_goals_{user_id})
```

### 7. STORAGE FEES (localStorage - not critical)
```
Fields: id, month, amount, notes
Storage: localStorage only (low priority)
```

### 8. MILEAGE (localStorage - not critical)
```
Fields: id, date, miles, purpose, from, to
Storage: localStorage only (low priority)
```

### 9. SAVED RECEIPTS (localStorage - not critical)
```
Fields: id, date, orderNum, items, image
Storage: localStorage only (low priority)
```

---

## STATE TRANSITIONS - INVENTORY

### CREATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~1513 | addPurchase() | ✅ Syncs to Supabase |
| Line ~2033 | Nike receipt bulk add | ❌ NEEDS SUPABASE |
| Line ~2119 | Receipt items confirm | ❌ NEEDS SUPABASE |
| Line ~2184 | CSV import | ❌ NEEDS SUPABASE |
| Line ~5361 | Bulk add modal | ❌ NEEDS SUPABASE |

### UPDATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~3440 | Toggle sold status | ❌ NEEDS SUPABASE |
| Line ~4663 | Bulk mark as sold (lookup) | ❌ NEEDS SUPABASE |
| Line ~4761 | Single mark as sold (lookup) | ❌ NEEDS SUPABASE |
| Line ~5389 | Edit inventory modal save | ❌ NEEDS SUPABASE |

### DELETE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~3383 | Bulk delete selected | ✅ Syncs to Supabase |
| Line ~3446 | Single delete button | ✅ Syncs to Supabase |

### RESTORE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~5054 | Restore from backup | ❌ NEEDS SUPABASE |

---

## STATE TRANSITIONS - SALES

### CREATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~1555 | addSale() | ✅ Syncs to Supabase |
| Line ~1514 | confirmSaleWithCost() | ✅ Syncs to Supabase |

### UPDATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~5371 | Edit sale modal save | ❌ NEEDS SUPABASE |

### DELETE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~675 | Bulk delete selected | ✅ Syncs to Supabase |
| Line ~724 | Single delete button | ✅ Syncs to Supabase |

### RESTORE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~5055 | Restore from backup | ❌ NEEDS SUPABASE |

---

## STATE TRANSITIONS - EXPENSES

### CREATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~1573 | addExpense() | ✅ Syncs to Supabase |

### UPDATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| (none found) | Edit expense | N/A |

### DELETE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| (need to find) | Delete expense | ❌ NEEDS CHECK |

### RESTORE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| (backup restore) | Restore expenses | ❌ NEEDS SUPABASE |

---

## STATE TRANSITIONS - PENDING COSTS

### CREATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~1352 | StockX sync import | ✅ Syncs to Supabase |
| Line ~1452 | Mock/test data | ❌ LOCAL ONLY (OK) |
| Line ~2462 | eBay CSV import | ❌ NEEDS SUPABASE |
| Line ~2559 | eBay API import | ❌ NEEDS SUPABASE |
| Line ~4502 | eBay sync button | ❌ NEEDS SUPABASE |

### UPDATE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| (none) | N/A | N/A |

### DELETE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~1495 | After confirm sale | ✅ Syncs to Supabase |
| Line ~4074 | Clear all pending | ❌ NEEDS SUPABASE |
| Line ~4092 | Clear pending button | ❌ NEEDS SUPABASE |
| Line ~4249 | Single pending delete | ❌ NEEDS SUPABASE |
| Line ~4584 | Another clear all | ❌ NEEDS SUPABASE |

### RESTORE Operations
| Location | Action | Current Status |
|----------|--------|----------------|
| Line ~5032 | Restore from backup | ❌ NEEDS SUPABASE |

---

## COMPLETE TODO LIST

### HIGH PRIORITY (Core Functionality) - ALL COMPLETE ✅
1. [x] Line ~2033: Nike receipt bulk add → bulkSaveInventoryToSupabase
2. [x] Line ~2119: Receipt items confirm → bulkSaveInventoryToSupabase
3. [x] Line ~2184: CSV import → bulkSaveInventoryToSupabase (bulk)
4. [x] Line ~3440: Toggle sold status → updateInventoryInSupabase
5. [x] Line ~4663: Bulk mark as sold → updateInventoryInSupabase
6. [x] Line ~4761: Single mark as sold → updateInventoryInSupabase
7. [x] Line ~5361: Bulk add modal → bulkSaveInventoryToSupabase (bulk)
8. [x] Line ~5389: Edit inventory save → updateInventoryInSupabase
9. [x] Line ~5371: Edit sale save → updateSaleInSupabase
10. [x] Line ~2462: eBay CSV pending import → bulkSavePendingToSupabase
11. [x] Line ~2559: eBay API pending import → bulkSavePendingToSupabase
12. [x] Line ~4502: eBay sync pending → bulkSavePendingToSupabase
13. [x] Line ~4074: Clear all pending → deleteAllPendingFromSupabase
14. [x] Line ~4092: Clear pending button → deleteAllPendingFromSupabase
15. [x] Line ~4249: Single pending delete → deletePendingFromSupabase
16. [x] Line ~4584: Clear all pending → deleteAllPendingFromSupabase

### MEDIUM PRIORITY (Backup/Restore) - ALL COMPLETE ✅
17. [x] Line ~5054: Restore inventory from backup → bulk sync
18. [x] Line ~5055: Restore sales from backup → bulk sync
19. [x] Line ~5032: Restore pending from backup → bulk sync

### LOW PRIORITY (Local-only OK for now)
20. [ ] Storage fees - localStorage only
21. [ ] Mileage - localStorage only
22. [ ] Saved receipts - localStorage only

---

## FUNCTIONS NEEDED

### Already Created ✅
- saveInventoryToSupabase(item, isNew)
- deleteInventoryFromSupabase(id)
- saveSaleToSupabase(item, isNew)
- deleteSaleFromSupabase(id)
- saveExpenseToSupabase(item, isNew)
- deleteExpenseFromSupabase(id)
- savePendingToSupabase(item, isNew)
- deletePendingFromSupabase(id)
- bulkSavePendingToSupabase(items)

### Need to Create ❌
- updateInventoryInSupabase(item) - for updates without creating new
- updateSaleInSupabase(item) - for updates without creating new
- bulkSaveInventoryToSupabase(items) - for bulk imports
- bulkDeletePendingFromSupabase(ids) - for clear all
- syncBackupToSupabase(backup) - for restore operations

---

## COMPONENT FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                         APP STARTUP                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Check Auth Session   │
                    └───────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼                                   ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │  Show AuthPage  │                 │  Load User Data │
    │  (Login/Signup) │                 │  from Supabase  │
    └─────────────────┘                 └─────────────────┘
              │                                   │
              │                                   ▼
              │                         ┌─────────────────┐
              └────────────────────────▶│   Main App UI   │
                                        └─────────────────┘
                                                  │
        ┌──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │Dashboard│   │Inventory│   │  Sales  │   │ Pending │   │Settings │
   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
```

---

## DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTION                               │
│  (Add, Edit, Delete, Import, Toggle Sold, etc.)                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE OPERATION                           │
│  (insert, update, delete)                                        │
│  - Returns new ID for inserts                                    │
│  - Confirms success/failure                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
           ┌───────────────┐       ┌───────────────┐
           │    SUCCESS    │       │    FAILURE    │
           │ Update React  │       │  Show Error   │
           │    State      │       │  Keep State   │
           └───────────────┘       └───────────────┘
```

---

## PAGES AND MODALS

### Pages (setPage)
1. dashboard
2. inventory
3. sales
4. pending
5. expenses
6. analytics
7. settings
8. cpa

### Modals (setModal)
1. addPurchase
2. editInventory
3. addSale
4. editSale
5. addExpense
6. addStorage
7. addMileage
8. bulkAdd
9. scanReceipt
10. confirmReceipt
11. savedReceipts
12. stockxImport
13. ebayImport
14. invCsvImport
15. invLookup
16. pendingDetail
17. feeCalculator
18. goals

---

## TOTAL CHANGES REQUIRED: 19

All must be completed before deployment.
