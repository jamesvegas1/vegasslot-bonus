-- ============================================
-- ADMIN_NOTE SÜTUNUNU EKLE
-- VegasSlot Bonus Request System
-- ============================================
-- Bu SQL'i Supabase Dashboard > SQL Editor'da çalıştır

-- admin_note sütununu bonus_requests tablosuna ekle
ALTER TABLE bonus_requests 
ADD COLUMN IF NOT EXISTS admin_note TEXT DEFAULT '';

-- Opsiyonel: Mevcut kayıtları null yerine boş string yap
UPDATE bonus_requests 
SET admin_note = '' 
WHERE admin_note IS NULL;

-- Kontrol et
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bonus_requests'
ORDER BY ordinal_position;
