-- =============================================
-- BLOCKED USERS TABLE
-- Users who spam requests get temporarily blocked
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    blocked_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ NOT NULL,
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_username ON blocked_users(username);
CREATE INDEX IF NOT EXISTS idx_blocked_users_active ON blocked_users(is_active, blocked_until);

-- Step 3: Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public read blocked_users" ON blocked_users;
DROP POLICY IF EXISTS "Allow insert blocked_users" ON blocked_users;
DROP POLICY IF EXISTS "Allow update blocked_users" ON blocked_users;
DROP POLICY IF EXISTS "Allow delete blocked_users" ON blocked_users;

-- Step 5: Create RLS Policies
CREATE POLICY "Allow public read blocked_users"
ON blocked_users FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow insert blocked_users"
ON blocked_users FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow update blocked_users"
ON blocked_users FOR UPDATE
TO public
USING (true);

CREATE POLICY "Allow delete blocked_users"
ON blocked_users FOR DELETE
TO public
USING (true);
