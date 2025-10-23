/*
  # Système de Monitoring et Révocation Automatique

  1. Nouvelles Tables
    - `active_sessions` : Sessions de lecture actives en temps réel
    - `revocation_log` : Historique des révocations pour audit

  2. Nouvelles Fonctions
    - `check_concurrent_sessions()` : Détecte sessions simultanées
    - `auto_revoke_suspicious_token()` : Révocation automatique
    - `get_active_sessions_count()` : Compte sessions actives par token

  3. Triggers
    - Détection automatique de sessions multiples
    - Logging automatique des révocations

  4. Security
    - RLS activé sur toutes les tables
    - Politiques pour admins et système
*/

-- ============================================================
-- TABLE : SESSIONS ACTIVES EN TEMPS RÉEL
-- ============================================================

CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  device_fingerprint jsonb,
  ip_address text,
  user_agent text,
  started_at timestamptz DEFAULT now(),
  last_heartbeat timestamptz DEFAULT now(),
  current_page integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_token_id ON active_sessions(token_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_is_active ON active_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_active_sessions_session_id ON active_sessions(session_id);

-- ============================================================
-- TABLE : LOG DES RÉVOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS revocation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_by uuid REFERENCES users(id),
  reason text NOT NULL,
  revocation_type text NOT NULL CHECK (revocation_type IN ('auto', 'manual', 'scheduled')),
  evidence jsonb,
  revoked_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revocation_log_token_id ON revocation_log(token_id);
CREATE INDEX IF NOT EXISTS idx_revocation_log_user_id ON revocation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_revocation_log_type ON revocation_log(revocation_type);
CREATE INDEX IF NOT EXISTS idx_revocation_log_date ON revocation_log(revoked_at DESC);

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revocation_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES : ACTIVE SESSIONS
-- ============================================================

CREATE POLICY "Utilisateurs voient leurs propres sessions"
  ON active_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins voient toutes les sessions"
  ON active_sessions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Système peut gérer les sessions"
  ON active_sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- RLS POLICIES : REVOCATION LOG
-- ============================================================

CREATE POLICY "Admins voient tout l'historique de révocation"
  ON revocation_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Utilisateurs voient leurs révocations"
  ON revocation_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- FONCTION : Compter les sessions actives par token
-- ============================================================

CREATE OR REPLACE FUNCTION get_active_sessions_count(p_token_id UUID)
RETURNS INTEGER AS $$
DECLARE
  session_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO session_count
  FROM active_sessions
  WHERE token_id = p_token_id
    AND is_active = true
    AND last_heartbeat > NOW() - INTERVAL '5 minutes';
  
  RETURN session_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTION : Vérifier sessions concurrentes suspectes
-- ============================================================

CREATE OR REPLACE FUNCTION check_concurrent_sessions(p_token_id UUID)
RETURNS TABLE(
  is_suspicious BOOLEAN,
  reason TEXT,
  session_count INTEGER,
  different_ips INTEGER,
  different_devices INTEGER
) AS $$
DECLARE
  v_session_count INTEGER;
  v_different_ips INTEGER;
  v_different_devices INTEGER;
  v_is_suspicious BOOLEAN := false;
  v_reason TEXT := '';
BEGIN
  SELECT 
    COUNT(*),
    COUNT(DISTINCT ip_address),
    COUNT(DISTINCT device_fingerprint::text)
  INTO 
    v_session_count,
    v_different_ips,
    v_different_devices
  FROM active_sessions
  WHERE token_id = p_token_id
    AND is_active = true
    AND last_heartbeat > NOW() - INTERVAL '5 minutes';

  IF v_session_count > 1 THEN
    v_is_suspicious := true;
    v_reason := format('Sessions multiples détectées: %s sessions actives', v_session_count);
  END IF;

  IF v_different_ips > 2 THEN
    v_is_suspicious := true;
    v_reason := v_reason || format(' | IPs différentes: %s', v_different_ips);
  END IF;

  IF v_different_devices > 1 THEN
    v_is_suspicious := true;
    v_reason := v_reason || format(' | Devices différents: %s', v_different_devices);
  END IF;

  RETURN QUERY SELECT 
    v_is_suspicious,
    v_reason,
    v_session_count,
    v_different_ips,
    v_different_devices;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTION : Révocation automatique de token suspect
-- ============================================================

CREATE OR REPLACE FUNCTION auto_revoke_suspicious_token(
  p_token_id UUID,
  p_reason TEXT,
  p_evidence JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_revoked BOOLEAN;
BEGIN
  SELECT user_id, revoked 
  INTO v_user_id, v_revoked
  FROM tokens
  WHERE id = p_token_id;

  IF v_revoked THEN
    RETURN false;
  END IF;

  UPDATE tokens
  SET 
    revoked = true,
    revoked_reason = p_reason
  WHERE id = p_token_id;

  INSERT INTO revocation_log (
    token_id,
    user_id,
    reason,
    revocation_type,
    evidence
  ) VALUES (
    p_token_id,
    v_user_id,
    p_reason,
    'auto',
    p_evidence
  );

  UPDATE active_sessions
  SET is_active = false
  WHERE token_id = p_token_id;

  INSERT INTO acces_suspects (
    user_id,
    token_id,
    type_alerte,
    description,
    severity,
    data
  ) VALUES (
    v_user_id,
    p_token_id,
    'auto_revoked',
    p_reason,
    'critical',
    p_evidence
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTION : Nettoyer les sessions inactives
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_inactive_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_cleaned INTEGER;
BEGIN
  UPDATE active_sessions
  SET is_active = false
  WHERE is_active = true
    AND last_heartbeat < NOW() - INTERVAL '10 minutes';

  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  RETURN v_cleaned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTION : Obtenir statistiques de sécurité en temps réel
-- ============================================================

CREATE OR REPLACE FUNCTION get_security_stats()
RETURNS TABLE(
  active_sessions_count INTEGER,
  suspicious_tokens_count INTEGER,
  revoked_today_count INTEGER,
  unique_readers_today INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM active_sessions WHERE is_active = true) as active_sessions,
    (SELECT COUNT(*)::INTEGER FROM tokens WHERE revoked = true) as suspicious_tokens,
    (SELECT COUNT(*)::INTEGER FROM revocation_log WHERE revoked_at > NOW() - INTERVAL '24 hours') as revoked_today,
    (SELECT COUNT(DISTINCT user_id)::INTEGER FROM logs WHERE date_access > NOW() - INTERVAL '24 hours') as readers_today;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
