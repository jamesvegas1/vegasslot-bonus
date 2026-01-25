-- =============================================
-- ANALYTICS FUNCTIONS FOR DASHBOARD
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Get Top Bonuses Today (grouped by bonus type)
CREATE OR REPLACE FUNCTION get_top_bonuses_today()
RETURNS TABLE (
    bonus_type TEXT,
    bonus_label TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.bonus_type::TEXT,
        br.bonus_type_label::TEXT as bonus_label,
        COUNT(*)::BIGINT as count
    FROM bonus_requests br
    WHERE br.created_at >= CURRENT_DATE
    GROUP BY br.bonus_type, br.bonus_type_label
    ORDER BY count DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- 2. Get Hourly Distribution (last 7 days)
CREATE OR REPLACE FUNCTION get_hourly_distribution()
RETURNS TABLE (
    hour INT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXTRACT(HOUR FROM br.created_at)::INT as hour,
        COUNT(*)::BIGINT as count
    FROM bonus_requests br
    WHERE br.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY EXTRACT(HOUR FROM br.created_at)
    ORDER BY hour;
END;
$$ LANGUAGE plpgsql;

-- 3. Get Top Users Today (most requests)
CREATE OR REPLACE FUNCTION get_top_users_today()
RETURNS TABLE (
    username TEXT,
    request_count BIGINT,
    approved_count BIGINT,
    rejected_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.username::TEXT,
        COUNT(*)::BIGINT as request_count,
        COUNT(*) FILTER (WHERE br.status = 'approved')::BIGINT as approved_count,
        COUNT(*) FILTER (WHERE br.status = 'rejected')::BIGINT as rejected_count
    FROM bonus_requests br
    WHERE br.created_at >= CURRENT_DATE
    GROUP BY br.username
    ORDER BY request_count DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- 4. Get Top Bonuses for any period
CREATE OR REPLACE FUNCTION get_top_bonuses(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
    bonus_type TEXT,
    bonus_label TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.bonus_type::TEXT,
        br.bonus_type_label::TEXT as bonus_label,
        COUNT(*)::BIGINT as count
    FROM bonus_requests br
    WHERE br.created_at >= start_date AND br.created_at <= end_date
    GROUP BY br.bonus_type, br.bonus_type_label
    ORDER BY count DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;
