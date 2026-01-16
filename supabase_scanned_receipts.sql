-- Run this in Supabase SQL Editor to create the scanned_receipts table

CREATE TABLE scanned_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE scanned_receipts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own receipts
CREATE POLICY "Users can view own receipts" ON scanned_receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own receipts
CREATE POLICY "Users can insert own receipts" ON scanned_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own receipts
CREATE POLICY "Users can delete own receipts" ON scanned_receipts
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_scanned_receipts_user_transaction 
  ON scanned_receipts(user_id, transaction_id);
