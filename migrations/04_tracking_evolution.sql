-- ==================== OUTDATED THREAT PATTERNS TABLE ====================
CREATE TABLE IF NOT EXISTS outdated_threat_patterns (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    threat_description TEXT NOT NULL,
    historical_timestamp TIMESTAMP,
    original_context TEXT,
    current_reality_evidence TEXT[],
    pattern_update_status VARCHAR(50) DEFAULT 'recognizing'
        CHECK (pattern_update_status IN ('recognizing', 'questioning', 'updating', 'integrating', 'resolved')),
    protective_patterns TEXT[],
    activation_contexts TEXT[],
    healing_indicators TEXT[],
    current_relationship VARCHAR(50) DEFAULT 'avoiding'
        CHECK (current_relationship IN ('avoiding', 'aware', 'touching', 'integrating')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_threat_patterns_user ON outdated_threat_patterns(user_id);
CREATE INDEX idx_threat_patterns_status ON outdated_threat_patterns(pattern_update_status);

-- ==================== REGULATION CAPACITY TABLE ====================
CREATE TABLE IF NOT EXISTS regulation_capacity (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    regulation_tools TEXT[],
    self_regulation_moments JSONB[],
    co_regulation_quality TEXT,
    window_of_tolerance_status VARCHAR(50) 
        CHECK (window_of_tolerance_status IN ('expanding', 'contracting', 'stabilizing', 'fluctuating')),
    window_of_tolerance_notes TEXT,
    baseline_state TEXT,
    baseline_shift_evidence TEXT[],
    last_assessment TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_regulation_user_time ON regulation_capacity(user_id, timestamp);
CREATE INDEX idx_regulation_window ON regulation_capacity(window_of_tolerance_status);

-- ==================== ASCENSION MARKERS TABLE ====================
CREATE TABLE IF NOT EXISTS ascension_markers (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expansion_type VARCHAR(100)[] NOT NULL,
    energy_quality TEXT,
    sustainability_score INTEGER CHECK (sustainability_score BETWEEN 1 AND 10),
    sustainability_notes TEXT,
    integration_practices TEXT[],
    duration_minutes INTEGER,
    trigger_context TEXT,
    follow_up_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_ascension_user_time ON ascension_markers(user_id, timestamp);

-- ==================== UPDATE TRIGGERS ====================
-- Trigger for outdated_threat_patterns
CREATE OR REPLACE FUNCTION update_threat_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_threat_patterns_timestamp
    BEFORE UPDATE ON outdated_threat_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_threat_patterns_timestamp();

-- Trigger for regulation_capacity
CREATE OR REPLACE FUNCTION update_regulation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_regulation_timestamp
    BEFORE UPDATE ON regulation_capacity
    FOR EACH ROW
    EXECUTE FUNCTION update_regulation_timestamp();

-- Trigger for ascension_markers
CREATE OR REPLACE FUNCTION update_ascension_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ascension_timestamp
    BEFORE UPDATE ON ascension_markers
    FOR EACH ROW
    EXECUTE FUNCTION update_ascension_timestamp();

-- Add helpful comments
COMMENT ON TABLE outdated_threat_patterns IS 'Tracks historical threat patterns and their current update status';
COMMENT ON TABLE regulation_capacity IS 'Tracks user''s nervous system regulation capacity and tools';
COMMENT ON TABLE ascension_markers IS 'Records moments of expansion and elevated states';