-- ============================================================
-- FLIPLEDGER DATABASE MIGRATION v2.0
-- ============================================================
-- Run this in your Supabase SQL Editor before deploying
-- This adds missing columns for full sale tracking
-- ============================================================

-- ============================================================
-- 1. PENDING_COSTS TABLE - Add missing columns
-- ============================================================

-- Add order_id column if not exists (CRITICAL for duplicate prevention)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN order_id TEXT;
  END IF;
END $$;

-- Add order_number column (backup for order_id)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'order_number'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN order_number TEXT;
  END IF;
END $$;

-- Add payout column (net payout from platform)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'payout'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN payout NUMERIC(10,2);
  END IF;
END $$;

-- Add fees column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'fees'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN fees NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add buyer column (for eBay)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'buyer'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN buyer TEXT;
  END IF;
END $$;

-- Add ad_fee column (for eBay ad fees)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'ad_fee'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN ad_fee NUMERIC(10,2);
  END IF;
END $$;

-- Add note column (for tracking payout source, etc)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'note'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN note TEXT;
  END IF;
END $$;

-- Add image column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pending_costs' AND column_name = 'image'
  ) THEN
    ALTER TABLE pending_costs ADD COLUMN image TEXT;
  END IF;
END $$;


-- ============================================================
-- 2. SALES TABLE - Add missing columns
-- ============================================================

-- Add order_id column (CRITICAL for duplicate prevention)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN order_id TEXT;
  END IF;
END $$;

-- Add payout column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'payout'
  ) THEN
    ALTER TABLE sales ADD COLUMN payout NUMERIC(10,2);
  END IF;
END $$;

-- Add buyer column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'buyer'
  ) THEN
    ALTER TABLE sales ADD COLUMN buyer TEXT;
  END IF;
END $$;

-- Add ad_fee column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'ad_fee'
  ) THEN
    ALTER TABLE sales ADD COLUMN ad_fee NUMERIC(10,2);
  END IF;
END $$;

-- Add note column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'note'
  ) THEN
    ALTER TABLE sales ADD COLUMN note TEXT;
  END IF;
END $$;

-- Add image column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'image'
  ) THEN
    ALTER TABLE sales ADD COLUMN image TEXT;
  END IF;
END $$;

-- Add inventory_id column (to link sale back to inventory item)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'inventory_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN inventory_id UUID;
  END IF;
END $$;


-- ============================================================
-- 3. INVENTORY TABLE - Add missing columns
-- ============================================================

-- Add image column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'image'
  ) THEN
    ALTER TABLE inventory ADD COLUMN image TEXT;
  END IF;
END $$;

-- Add source column (Nike, Finish Line, etc)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'source'
  ) THEN
    ALTER TABLE inventory ADD COLUMN source TEXT;
  END IF;
END $$;


-- ============================================================
-- 4. UNIQUE CONSTRAINTS (Duplicate Prevention)
-- ============================================================

-- Unique constraint on pending_costs (user_id, order_id)
-- This prevents duplicate orders in pending
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_pending_order_per_user'
  ) THEN
    ALTER TABLE pending_costs 
    ADD CONSTRAINT unique_pending_order_per_user 
    UNIQUE (user_id, order_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Unique constraint on sales (user_id, order_id)
-- This prevents duplicate orders in sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_sale_order_per_user'
  ) THEN
    ALTER TABLE sales 
    ADD CONSTRAINT unique_sale_order_per_user 
    UNIQUE (user_id, order_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 5. CHECK CONSTRAINTS (Data Validation)
-- ============================================================

-- Pending price must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'pending_price_must_be_positive'
  ) THEN
    ALTER TABLE pending_costs 
    ADD CONSTRAINT pending_price_must_be_positive 
    CHECK (sale_price > 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Sale price must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sale_price_must_be_positive'
  ) THEN
    ALTER TABLE sales 
    ADD CONSTRAINT sale_price_must_be_positive 
    CHECK (sale_price > 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Sale cost cannot be negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sale_cost_not_negative'
  ) THEN
    ALTER TABLE sales 
    ADD CONSTRAINT sale_cost_not_negative 
    CHECK (cost >= 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Inventory cost cannot be negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'inventory_cost_not_negative'
  ) THEN
    ALTER TABLE inventory 
    ADD CONSTRAINT inventory_cost_not_negative 
    CHECK (cost >= 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 6. INDEXES (Performance)
-- ============================================================

-- Index for fast order_id lookups in pending_costs
CREATE INDEX IF NOT EXISTS idx_pending_costs_order_id 
ON pending_costs(user_id, order_id);

-- Index for fast order_id lookups in sales
CREATE INDEX IF NOT EXISTS idx_sales_order_id 
ON sales(user_id, order_id);

-- Index for inventory matching by SKU
CREATE INDEX IF NOT EXISTS idx_inventory_sku_size 
ON inventory(user_id, sku, size, sold);


-- ============================================================
-- DONE! Your database is now ready for v2.0
-- ============================================================
