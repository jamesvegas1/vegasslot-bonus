-- =============================================
-- PERSONAL TEMPLATES FEATURE
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Add created_by column to note_templates
-- NULL = global template (everyone sees)
-- UUID = personal template (only creator sees)
ALTER TABLE note_templates 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id) ON DELETE CASCADE;

-- Step 2: Add template_preference column to admins
-- 'global' = show only global templates
-- 'personal' = show only personal templates  
-- 'both' = show both
ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS template_preference TEXT DEFAULT 'global';

-- Step 3: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_note_templates_created_by ON note_templates(created_by);

-- Verify changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'note_templates' AND column_name = 'created_by';

SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'admins' AND column_name = 'template_preference';
