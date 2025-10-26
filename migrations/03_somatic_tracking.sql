-- ==================== NERVOUS SYSTEM STATES TABLE ====================
CREATE TABLE IF NOT EXISTS nervous_system_states (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    detected_state VARCHAR(50) NOT NULL CHECK (detected_state IN ('mobilized', 'immobilized', 'mixed', 'integrated')),
    confidence_score DECIMAL(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    context TEXT,
    body_language_markers TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_ns_states_user_timestamp ON nervous_system_states(user_id, timestamp);
CREATE INDEX idx_ns_states_detected ON nervous_system_states(detected_state);

-- ==================== SOMATIC PATTERNS TABLE ====================
CREATE TABLE IF NOT EXISTS somatic_patterns (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,
    first_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    frequency INTEGER DEFAULT 1,
    associated_topics TEXT[],
    evolution_notes TEXT,
    last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX idx_somatic_patterns_user ON somatic_patterns(user_id);
CREATE INDEX idx_somatic_patterns_type ON somatic_patterns(pattern_type);

-- ==================== BREAKTHROUGH MOMENTS TABLE ====================
CREATE TABLE IF NOT EXISTS breakthrough_moments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL,
    nervous_system_state_before VARCHAR(50) NOT NULL,
    nervous_system_state_after VARCHAR(50) NOT NULL,
    integration_status VARCHAR(50) NOT NULL DEFAULT 'fresh' 
        CHECK (integration_status IN ('fresh', 'integrating', 'integrated')),
    conversation_id INTEGER,
    message_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(email) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

CREATE INDEX idx_breakthrough_user_timestamp ON breakthrough_moments(user_id, timestamp);
CREATE INDEX idx_breakthrough_integration ON breakthrough_moments(integration_status);

-- ==================== UPDATE TRIGGERS ====================
-- Trigger to update updated_at timestamp for somatic_patterns
CREATE OR REPLACE FUNCTION update_somatic_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_somatic_patterns_timestamp
    BEFORE UPDATE ON somatic_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_somatic_patterns_timestamp();

-- Trigger to update updated_at timestamp for breakthrough_moments
CREATE OR REPLACE FUNCTION update_breakthrough_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_breakthrough_timestamp
    BEFORE UPDATE ON breakthrough_moments
    FOR EACH ROW
    EXECUTE FUNCTION update_breakthrough_timestamp();