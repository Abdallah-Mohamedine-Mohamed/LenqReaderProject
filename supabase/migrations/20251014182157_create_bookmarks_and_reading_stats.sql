/*
  # Création des tables pour marque-pages et statistiques de lecture

  1. Nouvelles Tables
    - `bookmarks` : Stockage des marque-pages des utilisateurs
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key vers users)
      - `pdf_id` (uuid, foreign key vers pdfs)
      - `token_id` (uuid, foreign key vers tokens)
      - `page_number` (integer) - Numéro de la page marquée
      - `note` (text, optionnel) - Note personnelle sur le marque-page
      - `created_at` (timestamptz)
    
    - `reading_sessions` : Tracking détaillé des sessions de lecture
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key vers users)
      - `pdf_id` (uuid, foreign key vers pdfs)
      - `token_id` (uuid, foreign key vers tokens)
      - `page_stats` (jsonb) - Stats détaillées par page (temps passé, etc.)
      - `total_time_seconds` (integer) - Temps total de lecture
      - `pages_read` (integer[]) - Liste des pages lues
      - `last_page` (integer) - Dernière page consultée
      - `completed` (boolean) - Si tout le document a été lu
      - `started_at` (timestamptz)
      - `ended_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `screenshot_attempts` : Détection des tentatives de capture d'écran
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key vers users)
      - `pdf_id` (uuid, foreign key vers pdfs)
      - `token_id` (uuid, foreign key vers tokens)
      - `detection_type` (text) - Type de détection (screenshot, print, devtools, etc.)
      - `page_number` (integer) - Page lors de la tentative
      - `device_info` (jsonb) - Infos sur le device
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS sur toutes les nouvelles tables
    - Politiques pour lecture/écriture par utilisateur propriétaire
    - Politiques admin pour tout voir

  3. Indexes
    - Index sur user_id, pdf_id, token_id pour performances
    - Index sur created_at pour tri chronologique
*/

-- ============================================================
-- TABLE: BOOKMARKS (Marque-pages)
-- ============================================================

CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  token_id uuid REFERENCES tokens(id) ON DELETE SET NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  note text,
  created_at timestamptz DEFAULT now()
);

-- Index pour recherches rapides
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_pdf_id ON bookmarks(pdf_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_token_id ON bookmarks(token_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC);

-- Contrainte d'unicité : un user ne peut avoir qu'un seul bookmark par page par PDF
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_unique_user_pdf_page 
  ON bookmarks(user_id, pdf_id, page_number);

-- ============================================================
-- TABLE: READING_SESSIONS (Sessions de lecture détaillées)
-- ============================================================

CREATE TABLE IF NOT EXISTS reading_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  page_stats jsonb DEFAULT '{}'::jsonb,
  total_time_seconds integer DEFAULT 0,
  pages_read integer[] DEFAULT ARRAY[]::integer[],
  last_page integer DEFAULT 1,
  completed boolean DEFAULT false,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Index pour analyses et recherches
CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_id ON reading_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_pdf_id ON reading_sessions(pdf_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_token_id ON reading_sessions(token_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_started_at ON reading_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_completed ON reading_sessions(completed);

-- ============================================================
-- TABLE: SCREENSHOT_ATTEMPTS (Tentatives de capture)
-- ============================================================

CREATE TABLE IF NOT EXISTS screenshot_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  detection_type text NOT NULL CHECK (detection_type IN ('screenshot', 'print', 'devtools', 'copy', 'rightclick')),
  page_number integer NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Index pour alertes de sécurité
CREATE INDEX IF NOT EXISTS idx_screenshot_attempts_user_id ON screenshot_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_attempts_pdf_id ON screenshot_attempts(pdf_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_attempts_created_at ON screenshot_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_attempts_detection_type ON screenshot_attempts(detection_type);

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshot_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: BOOKMARKS
-- ============================================================

CREATE POLICY "Users can view their own bookmarks"
  ON bookmarks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bookmarks"
  ON bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks"
  ON bookmarks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
  ON bookmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all bookmarks"
  ON bookmarks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES: READING_SESSIONS
-- ============================================================

CREATE POLICY "Users can view their own reading sessions"
  ON reading_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reading sessions"
  ON reading_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading sessions"
  ON reading_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all reading sessions"
  ON reading_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES: SCREENSHOT_ATTEMPTS
-- ============================================================

CREATE POLICY "Users can log screenshot attempts"
  ON screenshot_attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all screenshot attempts"
  ON screenshot_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- FUNCTIONS: Auto-create alert on screenshot
-- ============================================================

CREATE OR REPLACE FUNCTION create_alert_on_screenshot()
RETURNS TRIGGER AS $$
DECLARE
  attempt_count integer;
BEGIN
  -- Compter les tentatives récentes (dernières 24h)
  SELECT COUNT(*) INTO attempt_count
  FROM screenshot_attempts
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Si plus de 3 tentatives, créer une alerte de sécurité
  IF attempt_count >= 3 THEN
    INSERT INTO acces_suspects (
      user_id,
      token_id,
      type_alerte,
      description,
      severity,
      data
    ) VALUES (
      NEW.user_id,
      NEW.token_id,
      'vitesse_lecture_anormale',
      format('Multiple tentatives de capture détectées: %s tentatives en 24h', attempt_count),
      CASE 
        WHEN attempt_count >= 10 THEN 'critical'
        WHEN attempt_count >= 6 THEN 'high'
        ELSE 'medium'
      END,
      jsonb_build_object(
        'attempt_count', attempt_count,
        'detection_type', NEW.detection_type,
        'pdf_id', NEW.pdf_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour créer automatiquement des alertes
DROP TRIGGER IF EXISTS trigger_alert_on_screenshot ON screenshot_attempts;
CREATE TRIGGER trigger_alert_on_screenshot
  AFTER INSERT ON screenshot_attempts
  FOR EACH ROW
  EXECUTE FUNCTION create_alert_on_screenshot();