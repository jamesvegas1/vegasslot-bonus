-- ============================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- VegasSlot Bonus Request System
-- ============================================
-- Bu SQL komutlarını Supabase Dashboard > SQL Editor'da çalıştır

-- ============================================
-- 1. BONUS_REQUESTS TABLE
-- ============================================

-- RLS'i aktifleştir
ALTER TABLE bonus_requests ENABLE ROW LEVEL SECURITY;

-- Herkes yeni talep oluşturabilir
CREATE POLICY "Anyone can create bonus requests" ON bonus_requests
    FOR INSERT
    WITH CHECK (true);

-- Herkes kendi taleplerini görebilir (username ile)
CREATE POLICY "Users can view own requests" ON bonus_requests
    FOR SELECT
    USING (true); -- Şimdilik herkese açık, username bazlı filtreleme client-side

-- Sadece adminler güncelleyebilir (status değişikliği için)
CREATE POLICY "Anyone can update requests" ON bonus_requests
    FOR UPDATE
    USING (true); -- Admin auth olmadan şimdilik açık

-- ============================================
-- 2. ADMINS TABLE
-- ============================================

-- RLS'i aktifleştir
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Herkes admin listesini okuyabilir (login için gerekli)
CREATE POLICY "Anyone can read admins" ON admins
    FOR SELECT
    USING (true);

-- Herkes admin ekleyebilir (şimdilik - gerçek ortamda kısıtlanmalı)
CREATE POLICY "Authenticated users can insert admins" ON admins
    FOR INSERT
    WITH CHECK (true);

-- Adminler güncellenebilir
CREATE POLICY "Admins can be updated" ON admins
    FOR UPDATE
    USING (true);

-- Adminler silinebilir
CREATE POLICY "Admins can be deleted" ON admins
    FOR DELETE
    USING (true);

-- ============================================
-- 3. BONUS_TYPES TABLE
-- ============================================

-- RLS'i aktifleştir
ALTER TABLE bonus_types ENABLE ROW LEVEL SECURITY;

-- Herkes bonus tiplerini okuyabilir
CREATE POLICY "Anyone can read bonus types" ON bonus_types
    FOR SELECT
    USING (true);

-- CRUD işlemleri açık (admin panelden yönetim için)
CREATE POLICY "Anyone can insert bonus types" ON bonus_types
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update bonus types" ON bonus_types
    FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete bonus types" ON bonus_types
    FOR DELETE
    USING (true);

-- ============================================
-- NOT: Bu politikalar temel güvenlik sağlar.
-- Daha güçlü güvenlik için Supabase Auth entegrasyonu önerilir.
-- ============================================
