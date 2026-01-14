-- =============================================
-- BLOCKED USERS TABLE
-- Users who spam requests get temporarily blocked
-- =============================================

-- Create the blocked_users table
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_username ON blocked_users(username);
CREATE INDEX IF NOT EXISTS idx_blocked_users_active ON blocked_users(is_active, blocked_until);

-- Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public to read (to check if blocked)
CREATE POLICY "Allow public read blocked_users"
ON blocked_users FOR SELECT
TO public
USING (true);

-- Policy: Allow authenticated inserts/updates (admins)
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

-- =============================================
-- CLEANUP FUNCTION: Auto-deactivate expired blocks
-- =============================================
CREATE OR REPLACE FUNCTION cleanup_expired_blocks()
RETURNS void AS $$
BEGIN
    UPDATE blocked_users
    SET is_active = false
    WHERE is_active = true AND blocked_until < NOW();
END;
$$ LANGUAGE plpgsql;
