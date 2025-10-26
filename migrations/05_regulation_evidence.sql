-- ==================== REGULATION EVIDENCE TABLE ====================
CREATE TABLE IF NOT EXISTS regulation_evidence (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    evidence_type VARCHAR(50) NOT NULL CHECK (
        evidence_type IN (
            'voluntary_exhale',
            'presence_over_pattern',
            'pfc_regulation',
            'somatic_safety_proof'
        )
    ),
    description TEXT NOT NULL,
    context TEXT,
    conversation_id INTEGER,
    message_id INTEGER,
    
    -- For voluntary exhales
    breath_quality TEXT,
    exhale_duration_seconds INTEGER,
    
    -- For presence over pattern choices
    old_pattern_avoided TEXT,
    new_choice_made TEXT,
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 10),
    
    -- For PFC regulation
    trigger_intensity INTEGER CHECK (trigger_intensity BETWEEN 1 AND 10),
    reasoning_process TEXT,
    regulation_success_level INTEGER CHECK (regulation_success_level BETWEEN 1 AND 10),
    
    -- For somatic safety markers
    body_location TEXT,
    sensation_quality TEXT,
    resonance_level INTEGER CHECK (resonance_level BETWEEN 1 AND 10),
    
    -- Common fields for all types
    emotional_state_before TEXT,
    emotional_state_after TEXT,
    window_of_tolerance_impact TEXT,
    integration_notes TEXT,
    follow_up_date TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX idx_reg_evidence_user_time ON regulation_evidence(user_id, timestamp);
CREATE INDEX idx_reg_evidence_type ON regulation_evidence(evidence_type);
CREATE INDEX idx_reg_evidence_success ON regulation_evidence(regulation_success_level)
    WHERE evidence_type = 'pfc_regulation';

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_regulation_evidence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_regulation_evidence_timestamp
    BEFORE UPDATE ON regulation_evidence
    FOR EACH ROW
    EXECUTE FUNCTION update_regulation_evidence_timestamp();

-- Add helpful views for analysis

-- View for tracking progress over time
CREATE OR REPLACE VIEW regulation_progress_view AS
SELECT 
    user_id,
    date_trunc('week', timestamp) as week,
    evidence_type,
    COUNT(*) as evidence_count,
    AVG(CASE 
        WHEN evidence_type = 'pfc_regulation' THEN regulation_success_level
        WHEN evidence_type = 'presence_over_pattern' THEN difficulty_level
        WHEN evidence_type = 'somatic_safety_proof' THEN resonance_level
        ELSE NULL
    END) as average_success_level
FROM regulation_evidence
GROUP BY user_id, date_trunc('week', timestamp), evidence_type;

-- View for recent breakthroughs
CREATE OR REPLACE VIEW recent_regulation_breakthroughs AS
SELECT *
FROM regulation_evidence
WHERE 
    (evidence_type = 'pfc_regulation' AND regulation_success_level >= 8)
    OR (evidence_type = 'presence_over_pattern' AND difficulty_level >= 8)
    OR (evidence_type = 'somatic_safety_proof' AND resonance_level >= 8)
ORDER BY timestamp DESC;

-- Comments for documentation
COMMENT ON TABLE regulation_evidence IS 'Tracks specific instances of successful regulation across different modalities';
COMMENT ON COLUMN regulation_evidence.evidence_type IS 'Type of regulation evidence: voluntary_exhale, presence_over_pattern, pfc_regulation, or somatic_safety_proof';
COMMENT ON COLUMN regulation_evidence.difficulty_level IS 'How challenging was it to choose presence over pattern (1-10)';
COMMENT ON COLUMN regulation_evidence.regulation_success_level IS 'How successfully did the PFC regulate the alarm response (1-10)';
COMMENT ON COLUMN regulation_evidence.resonance_level IS 'How strongly did this somatic marker resonate as proof of safety (1-10)';