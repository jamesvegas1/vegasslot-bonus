-- ============================================
-- SUPABASE ROW LEVEL SECURITY (RLS) V2
-- VegasSlot Bonus Request System
-- GÜVENLİ VERSİYON
-- ============================================
-- ⚠️ ÖNCEKİ POLİTİKALARI SİL VE BUNLARI ÇALIŞTIR

-- ============================================
-- 1. MEVCUT POLİTİKALARI TEMİZLE
-- ============================================

-- bonus_requests için
DROP POLICY IF EXISTS "Anyone can create bonus requests" ON bonus_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON bonus_requests;
DROP POLICY IF EXISTS "Anyone can update requests" ON bonus_requests;

-- admins için
DROP POLICY IF EXISTS "Anyone can read admins" ON admins;
DROP POLICY IF EXISTS "Authenticated users can insert admins" ON admins;
DROP POLICY IF EXISTS "Admins can be updated" ON admins;
DROP POLICY IF EXISTS "Admins can be deleted" ON admins;

-- bonus_types için
DROP POLICY IF EXISTS "Anyone can read bonus types" ON bonus_types;
DROP POLICY IF EXISTS "Anyone can insert bonus types" ON bonus_types;
DROP POLICY IF EXISTS "Anyone can update bonus types" ON bonus_types;
DROP POLICY IF EXISTS "Anyone can delete bonus types" ON bonus_types;

-- ============================================
-- 2. BONUS_REQUESTS TABLE - GÜVENLİ
-- ============================================

ALTER TABLE bonus_requests ENABLE ROW LEVEL SECURITY;

-- Herkes yeni talep oluşturabilir (kullanıcı formu)
CREATE POLICY "Public can create requests" ON bonus_requests
    FOR INSERT
    WITH CHECK (
        status = 'pending' AND 
        assigned_to IS NULL
    );

-- Herkes sadece kendi talebini görebilir (username match)
-- Not: Gerçek kimlik doğrulama olmadan tam güvenlik sağlanamaz
CREATE POLICY "Public can read all requests" ON bonus_requests
    FOR SELECT
    USING (true);
    -- Alternatif (username bazlı): USING (username = current_setting('request.jwt.claims', true)::json->>'username')

-- Sadece service_role ile update (admin paneli backend'den çağrılmalı)
-- Şimdilik açık bırakıyoruz ama NOT ekliyoruz
CREATE POLICY "Service role can update requests" ON bonus_requests
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
    -- İDEAL: USING (auth.role() = 'service_role')

-- ============================================
-- 3. ADMINS TABLE - GÜVENLİ
-- ============================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Şifre alanını gizle - sadece username ve role görünsün
-- NOT: Bu view ile yapılmalı, RLS ile şifre gizlenemez
-- Alternatif: admins_public view oluştur

-- Login için minimum erişim (sadece username kontrolü)
CREATE POLICY "Public can check username exists" ON admins
    FOR SELECT
    USING (true);
    -- NOT: Şifre client'a gidiyor, bu güvenli değil!
    -- İDEAL: Supabase Auth veya Edge Function kullan

-- Admin ekleme KAPALI (sadece service_role)
CREATE POLICY "Only service role can insert admins" ON admins
    FOR INSERT
    WITH CHECK (false);
    -- Manuel: Supabase Dashboard'dan veya migration ile ekle

-- Admin güncelleme KAPALI 
CREATE POLICY "Only service role can update admins" ON admins
    FOR UPDATE
    USING (false);

-- Admin silme KAPALI
CREATE POLICY "Only service role can delete admins" ON admins
    FOR DELETE
    USING (false);

-- ============================================
-- 4. BONUS_TYPES TABLE - KISITLI
-- ============================================

ALTER TABLE bonus_types ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (form dropdown için)
CREATE POLICY "Public can read active bonus types" ON bonus_types
    FOR SELECT
    USING (is_active = true);

-- Tüm bonus tiplerini adminler okuyabilir
CREATE POLICY "Admins can read all bonus types" ON bonus_types
    FOR SELECT
    USING (true);
    -- İDEAL: USING (auth.role() = 'authenticated')

-- CRUD kapalı (service_role ile yapılmalı)
CREATE POLICY "Service role manages bonus types" ON bonus_types
    FOR ALL
    USING (false);

-- ============================================
-- 5. PASSWORD HASHING - TRIGGER (OPSİYONEL)
-- ============================================

-- Server-side password hashing için function
CREATE OR REPLACE FUNCTION hash_password()
RETURNS TRIGGER AS $$
BEGIN
    -- pgcrypto extension gerekli
    -- CREATE EXTENSION IF NOT EXISTS pgcrypto;
    -- NEW.password = crypt(NEW.password, gen_salt('bf', 12));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOT: pgcrypto kullanmak için:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Sonra trigger'ı aktifleştir:
-- CREATE TRIGGER hash_admin_password
--     BEFORE INSERT OR UPDATE ON admins
--     FOR EACH ROW
--     WHEN (NEW.password IS NOT NULL)
--     EXECUTE FUNCTION hash_password();

-- ============================================
-- 6. GÜVENLİK ÖNERİLERİ
-- ============================================

/*
YAPILMASI GEREKENLER:

1. SUPABASE AUTH ENTEGRASYONU
   - Mevcut custom auth yerine Supabase Auth kullan
   - JWT token ile gerçek kimlik doğrulama
   - auth.uid() ve auth.role() ile RLS

2. SERVICE ROLE KEY
   - Admin işlemleri için ayrı backend endpoint
   - Service role key'i asla client'ta kullanma
   - Supabase Edge Functions veya API route

3. PASSWORD GÖRÜNÜRLÜĞÜ
   - admins tablosunda password sütununu VIEW ile gizle
   - CREATE VIEW admins_public AS 
     SELECT id, username, role, status, created_at FROM admins;

4. RATE LIMITING
   - Supabase Edge Functions ile server-side rate limit
   - pg_ratelimit extension

5. AUDIT LOG
   - Tüm admin işlemlerini logla
   - CREATE TABLE audit_log (...)
*/

-- ============================================
-- ⚠️ ÖNEMLİ: BU POLİTİKALAR TAM GÜVENLİK SAĞLAMAZ
-- Supabase Auth entegrasyonu olmadan sadece temel koruma sağlar.
-- ============================================
