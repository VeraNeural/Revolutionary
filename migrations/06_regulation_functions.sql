-- ==================== REGULATION HELPER FUNCTIONS ====================

-- Function to record new regulation evidence with type-specific validation
CREATE OR REPLACE FUNCTION record_regulation_evidence(
    p_user_id VARCHAR(255),
    p_evidence_type VARCHAR(50),
    p_description TEXT,
    p_context TEXT DEFAULT NULL,
    p_conversation_id INTEGER DEFAULT NULL,
    -- Type-specific parameters
    p_duration_seconds INTEGER DEFAULT NULL,
    p_difficulty_level INTEGER DEFAULT NULL,
    p_trigger_intensity INTEGER DEFAULT NULL,
    p_body_location TEXT DEFAULT NULL,
    p_emotional_state_before TEXT DEFAULT NULL,
    p_emotional_state_after TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Validate evidence type
    IF p_evidence_type NOT IN ('voluntary_exhale', 'presence_over_pattern', 'pfc_regulation', 'somatic_safety_proof') THEN
        RAISE EXCEPTION 'Invalid evidence type: %', p_evidence_type;
    END IF;
    
    -- Type-specific validation
    CASE p_evidence_type
        WHEN 'voluntary_exhale' THEN
            IF p_duration_seconds IS NULL THEN
                RAISE EXCEPTION 'Duration required for voluntary exhale';
            END IF;
        WHEN 'presence_over_pattern' THEN
            IF p_difficulty_level IS NULL THEN
                RAISE EXCEPTION 'Difficulty level required for presence over pattern';
            END IF;
        WHEN 'pfc_regulation' THEN
            IF p_trigger_intensity IS NULL THEN
                RAISE EXCEPTION 'Trigger intensity required for PFC regulation';
            END IF;
    END CASE;

    -- Insert the evidence
    INSERT INTO regulation_evidence (
        user_id,
        evidence_type,
        description,
        context,
        conversation_id,
        exhale_duration_seconds,
        difficulty_level,
        trigger_intensity,
        body_location,
        emotional_state_before,
        emotional_state_after
    ) VALUES (
        p_user_id,
        p_evidence_type,
        p_description,
        p_context,
        p_conversation_id,
        p_duration_seconds,
        p_difficulty_level,
        p_trigger_intensity,
        p_body_location,
        p_emotional_state_before,
        p_emotional_state_after
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to analyze regulation progress
CREATE OR REPLACE FUNCTION analyze_regulation_progress(
    p_user_id VARCHAR(255),
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NOW()
) RETURNS TABLE (
    evidence_type VARCHAR(50),
    total_count BIGINT,
    avg_success NUMERIC,
    progress_trend TEXT,
    window_impact TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH weekly_stats AS (
        SELECT 
            evidence_type,
            date_trunc('week', timestamp) as week,
            COUNT(*) as weekly_count,
            AVG(CASE 
                WHEN evidence_type = 'pfc_regulation' THEN regulation_success_level
                WHEN evidence_type = 'presence_over_pattern' THEN difficulty_level
                WHEN evidence_type = 'somatic_safety_proof' THEN resonance_level
                ELSE NULL
            END) as avg_success_level
        FROM regulation_evidence
        WHERE user_id = p_user_id
        AND (p_start_date IS NULL OR timestamp >= p_start_date)
        AND timestamp <= p_end_date
        GROUP BY evidence_type, date_trunc('week', timestamp)
    )
    SELECT 
        ws.evidence_type,
        SUM(ws.weekly_count),
        AVG(ws.avg_success_level),
        CASE 
            WHEN COVAR_POP(EXTRACT(EPOCH FROM week), avg_success_level) > 0 THEN 'Improving'
            WHEN COVAR_POP(EXTRACT(EPOCH FROM week), avg_success_level) < 0 THEN 'Declining'
            ELSE 'Stable'
        END as progress_trend,
        (
            SELECT window_of_tolerance_impact 
            FROM regulation_evidence re
            WHERE re.user_id = p_user_id
            AND re.evidence_type = ws.evidence_type
            ORDER BY re.timestamp DESC
            LIMIT 1
        ) as latest_window_impact
    FROM weekly_stats ws
    GROUP BY ws.evidence_type;
END;
$$ LANGUAGE plpgsql;

-- Function to identify regulation patterns
CREATE OR REPLACE FUNCTION identify_regulation_patterns(
    p_user_id VARCHAR(255),
    p_days INTEGER DEFAULT 30
) RETURNS TABLE (
    pattern_type TEXT,
    pattern_description TEXT,
    supporting_evidence INTEGER,
    confidence_level NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_evidence AS (
        SELECT *
        FROM regulation_evidence
        WHERE user_id = p_user_id
        AND timestamp >= NOW() - (p_days || ' days')::INTERVAL
    ),
    success_patterns AS (
        SELECT 
            evidence_type,
            context,
            COUNT(*) as occurrence_count,
            AVG(CASE 
                WHEN evidence_type = 'pfc_regulation' THEN regulation_success_level
                WHEN evidence_type = 'presence_over_pattern' THEN difficulty_level
                WHEN evidence_type = 'somatic_safety_proof' THEN resonance_level
                ELSE NULL
            END) as avg_success
        FROM recent_evidence
        GROUP BY evidence_type, context
        HAVING COUNT(*) >= 3
    )
    SELECT 
        'Context Success' as pattern_type,
        'High success rate in context: ' || context as pattern_description,
        occurrence_count as supporting_evidence,
        avg_success as confidence_level
    FROM success_patterns
    WHERE avg_success >= 7
    
    UNION ALL
    
    SELECT 
        'Time of Day' as pattern_type,
        'Higher regulation success during ' || 
        CASE 
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 5 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 12 AND 17 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 18 AND 21 THEN 'evening'
            ELSE 'night'
        END as pattern_description,
        COUNT(*) as supporting_evidence,
        AVG(CASE 
            WHEN evidence_type = 'pfc_regulation' THEN regulation_success_level
            WHEN evidence_type = 'presence_over_pattern' THEN difficulty_level
            WHEN evidence_type = 'somatic_safety_proof' THEN resonance_level
            ELSE NULL
        END) as confidence_level
    FROM recent_evidence
    GROUP BY 
        CASE 
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 5 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 12 AND 17 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 18 AND 21 THEN 'evening'
            ELSE 'night'
        END
    HAVING AVG(CASE 
        WHEN evidence_type = 'pfc_regulation' THEN regulation_success_level
        WHEN evidence_type = 'presence_over_pattern' THEN difficulty_level
        WHEN evidence_type = 'somatic_safety_proof' THEN resonance_level
        ELSE NULL
    END) >= 7;
END;
$$ LANGUAGE plpgsql;

-- Function to track window of tolerance evolution
CREATE OR REPLACE FUNCTION analyze_window_of_tolerance(
    p_user_id VARCHAR(255),
    p_weeks INTEGER DEFAULT 12
) RETURNS TABLE (
    time_period TEXT,
    expansion_evidence TEXT[],
    regulation_tools TEXT[],
    baseline_shifts TEXT,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH time_periods AS (
        SELECT 
            date_trunc('week', dd)::date as week_start,
            (date_trunc('week', dd) + '6 days'::interval)::date as week_end
        FROM generate_series(
            NOW() - (p_weeks || ' weeks')::interval,
            NOW(),
            '1 week'::interval
        ) as dd
    ),
    weekly_evidence AS (
        SELECT 
            date_trunc('week', re.timestamp) as week,
            array_agg(DISTINCT re.description) as evidence,
            array_agg(DISTINCT rcp.regulation_tools) as tools,
            string_agg(DISTINCT rcp.baseline_state, '; ') as baseline_changes,
            COUNT(*) FILTER (WHERE 
                CASE 
                    WHEN re.evidence_type = 'pfc_regulation' THEN re.regulation_success_level >= 7
                    WHEN re.evidence_type = 'presence_over_pattern' THEN re.difficulty_level >= 7
                    WHEN re.evidence_type = 'somatic_safety_proof' THEN re.resonance_level >= 7
                    ELSE FALSE
                END
            )::NUMERIC / COUNT(*)::NUMERIC as success_rate
        FROM regulation_evidence re
        LEFT JOIN regulation_capacity rcp 
            ON re.user_id = rcp.user_id 
            AND date_trunc('week', re.timestamp) = date_trunc('week', rcp.timestamp)
        WHERE re.user_id = p_user_id
        GROUP BY date_trunc('week', re.timestamp)
    )
    SELECT 
        tp.week_start::TEXT || ' to ' || tp.week_end::TEXT,
        COALESCE(we.evidence, ARRAY[]::TEXT[]),
        COALESCE(we.tools, ARRAY[]::TEXT[]),
        COALESCE(we.baseline_changes, 'No changes recorded'),
        COALESCE(we.success_rate, 0)
    FROM time_periods tp
    LEFT JOIN weekly_evidence we ON tp.week_start = we.week::date
    ORDER BY tp.week_start DESC;
END;
$$ LANGUAGE plpgsql;