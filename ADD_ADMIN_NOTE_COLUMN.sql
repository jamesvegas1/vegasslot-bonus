-- ============================================
-- BONUS_REQUESTS EK SÜTUNLARI
-- VegasSlot Bonus Request System
-- ============================================
-- Bu SQL'i Supabase Dashboard > SQL Editor'da çalıştır

-- 1. Admin note sütunu
ALTER TABLE bonus_requests 
ADD COLUMN IF NOT EXISTS admin_note TEXT DEFAULT '';

-- 2. İşlemi yapan admin (kim onayladı/reddetti)
ALTER TABLE bonus_requests 
ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES admins(id);

-- 3. İşlem zamanı
ALTER TABLE bonus_requests 
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Kontrol et
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bonus_requests'
ORDER BY ordinal_position;
