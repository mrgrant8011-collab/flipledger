-- ============================================================
-- FLIPLEDGER DATABASE MIGRATION - Storage Fees & Mileage
-- ============================================================
-- Run this in your Supabase SQL Editor
-- Creates tables for storage fees and mileage tracking
-- ============================================================

-- ============================================================
-- 1. STORAGE_FEES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS storage_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month TEXT NOT NULL,           -- Format: '2025-01'
  amount NUMERIC(10,2) NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE storage_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own storage_fees" ON storage_fees
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage_fees" ON storage_fees
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own storage_fees" ON storage_fees
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage_fees" ON storage_fees
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_storage_fees_user_id ON storage_fees(user_id);


-- ============================================================
-- 2. MILEAGE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS mileage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  miles NUMERIC(10,2) NOT NULL,
  purpose TEXT DEFAULT 'Pickup/Dropoff',
  from_location TEXT DEFAULT '',
  to_location TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE mileage ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own mileage" ON mileage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mileage" ON mileage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mileage" ON mileage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mileage" ON mileage
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_mileage_user_id ON mileage(user_id);


-- ============================================================
-- DONE! Your storage_fees and mileage tables are ready.
-- ============================================================
