-- ============================================
-- HASHTAG TEMPLATES SYSTEM
-- Admin notları için hazır şablonlar
-- ============================================

-- Hashtag şablonları tablosu
CREATE TABLE IF NOT EXISTS note_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tag VARCHAR(50) NOT NULL UNIQUE,           -- #eksik-belge gibi
    text TEXT NOT NULL,                         -- Tam not metni
    category VARCHAR(20) DEFAULT 'general',     -- approved, rejected, general
    icon VARCHAR(10) DEFAULT '📝',              -- Emoji
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES admins(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Varsayılan şablonları ekle (RED notları)
INSERT INTO note_templates (tag, text, category, icon, sort_order) VALUES
-- RED nedenleri
('#eksik-belge', 'Yatırım belgesi eksik veya okunamıyor. Lütfen tekrar yükleyiniz.', 'rejected', '📄', 1),
('#yanlis-kullanici', 'Kullanıcı adı hatalı girilmiş. Lütfen doğru kullanıcı adınızla tekrar deneyiniz.', 'rejected', '❌', 2),
('#bonus-kullanildi', 'Bu bonus daha önce hesabınıza tanımlanmıştır.', 'rejected', '🔄', 3),
('#limit-asildi', 'Günlük/haftalık bonus limitinize ulaştınız.', 'rejected', '⚠️', 4),
('#yatirim-yok', 'Son 24 saat içinde yatırım tespit edilemedi.', 'rejected', '💳', 5),
('#sartlar-saglanmadi', 'Bonus şartları sağlanmadı. Detaylar için destek ile iletişime geçiniz.', 'rejected', '📋', 6),
('#hesap-dogrulama', 'Hesap doğrulaması gerekiyor. Lütfen destek ile iletişime geçin.', 'rejected', '🔐', 7),

-- ONAY notları
('#onaylandi', 'Bonus hesabınıza başarıyla tanımlandı. İyi oyunlar!', 'approved', '✅', 10),
('#freespin-eklendi', 'Freespinler hesabınıza eklendi. Slot oyunlarında kullanabilirsiniz.', 'approved', '🎰', 11),
('#hosgeldin-aktif', 'Hoş geldin bonusunuz aktif edildi. Koşulları kontrol ediniz.', 'approved', '🎁', 12),

-- Genel notlar
('#tesekkurler', 'Talebiniz için teşekkür ederiz.', 'general', '🙏', 20),
('#destek-iletisim', 'Sorularınız için 7/24 canlı destek hattımızdan bize ulaşabilirsiniz.', 'general', '💬', 21)
ON CONFLICT (tag) DO NOTHING;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_note_templates_category ON note_templates(category);
CREATE INDEX IF NOT EXISTS idx_note_templates_active ON note_templates(is_active);

-- RLS politikaları
ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "note_templates_select" ON note_templates
    FOR SELECT USING (true);

-- Sadece adminler ekleyebilir/güncelleyebilir/silebilir
CREATE POLICY "note_templates_insert" ON note_templates
    FOR INSERT WITH CHECK (true);

CREATE POLICY "note_templates_update" ON note_templates
    FOR UPDATE USING (true);

CREATE POLICY "note_templates_delete" ON note_templates
    FOR DELETE USING (true);
