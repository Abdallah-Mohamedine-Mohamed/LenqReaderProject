/*
  # Transformation du système en plateforme d'abonnement journal quotidien

  1. Modifications Tables Existantes
    - `users` : Ajout champs WhatsApp, statut abonné, numéro d'abonné
    - `pdfs` : Ajout date_publication, numéro édition, statut publication
    - `tokens` : Ajout tracking accès (first_access, last_access, access_count, device_info)
    - `logs` : Ajout device_fingerprint, session_id, geo_data

  2. Nouvelles Tables
    - `abonnements` : Gestion des abonnements avec formules et statuts
    - `formules` : Définition des formules d'abonnement (gratuit, hebdo, mensuel, annuel)
    - `paiements` : Historique des paiements reçus
    - `acces_suspects` : Détection et tracking des accès suspects
    - `sessions_lecture` : Tracking des sessions actives de lecture
    - `notifications` : Queue de notifications WhatsApp à envoyer

  3. Security
    - Maintien RLS sur toutes les tables
    - Politiques adaptées au modèle abonné/admin
    - Protection des données sensibles

  4. Indexes
    - Optimisation pour requêtes fréquentes
    - Index sur statuts, dates, relations
*/

-- Extension pour générer des codes d'abonné uniques
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- MODIFICATION TABLE USERS : Transformation en table abonnés
-- ============================================================

-- Ajout colonnes pour système d'abonnement
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'numero_whatsapp') THEN
    ALTER TABLE users ADD COLUMN numero_whatsapp text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'whatsapp_verifie') THEN
    ALTER TABLE users ADD COLUMN whatsapp_verifie boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'numero_abonne') THEN
    ALTER TABLE users ADD COLUMN numero_abonne text UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'statut_abonnement') THEN
    ALTER TABLE users ADD COLUMN statut_abonnement text DEFAULT 'inactif' CHECK (statut_abonnement IN ('actif', 'inactif', 'suspendu', 'essai', 'expire'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'date_fin_abonnement') THEN
    ALTER TABLE users ADD COLUMN date_fin_abonnement timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'score_confiance') THEN
    ALTER TABLE users ADD COLUMN score_confiance integer DEFAULT 100;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'devices_autorises') THEN
    ALTER TABLE users ADD COLUMN devices_autorises integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'code_parrainage') THEN
    ALTER TABLE users ADD COLUMN code_parrainage text UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'parraine_par') THEN
    ALTER TABLE users ADD COLUMN parraine_par uuid REFERENCES users(id);
  END IF;
END $$;

-- Index pour recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_users_statut_abonnement ON users(statut_abonnement);
CREATE INDEX IF NOT EXISTS idx_users_numero_whatsapp ON users(numero_whatsapp);
CREATE INDEX IF NOT EXISTS idx_users_numero_abonne ON users(numero_abonne);
CREATE INDEX IF NOT EXISTS idx_users_date_fin_abonnement ON users(date_fin_abonnement);

-- ============================================================
-- MODIFICATION TABLE PDFS : Ajout gestion éditions quotidiennes
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'date_edition') THEN
    ALTER TABLE pdfs ADD COLUMN date_edition date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'numero_edition') THEN
    ALTER TABLE pdfs ADD COLUMN numero_edition integer;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'statut_publication') THEN
    ALTER TABLE pdfs ADD COLUMN statut_publication text DEFAULT 'brouillon' CHECK (statut_publication IN ('brouillon', 'planifie', 'publie', 'archive'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'date_publication_prevue') THEN
    ALTER TABLE pdfs ADD COLUMN date_publication_prevue timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'date_publication_reelle') THEN
    ALTER TABLE pdfs ADD COLUMN date_publication_reelle timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'nb_lectures') THEN
    ALTER TABLE pdfs ADD COLUMN nb_lectures integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pdfs' AND column_name = 'nb_envois') THEN
    ALTER TABLE pdfs ADD COLUMN nb_envois integer DEFAULT 0;
  END IF;
END $$;

-- Index pour éditions
CREATE INDEX IF NOT EXISTS idx_pdfs_date_edition ON pdfs(date_edition DESC);
CREATE INDEX IF NOT EXISTS idx_pdfs_statut_publication ON pdfs(statut_publication);
CREATE INDEX IF NOT EXISTS idx_pdfs_numero_edition ON pdfs(numero_edition);

-- ============================================================
-- MODIFICATION TABLE TOKENS : Ajout tracking détaillé
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'first_access_at') THEN
    ALTER TABLE tokens ADD COLUMN first_access_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'last_access_at') THEN
    ALTER TABLE tokens ADD COLUMN last_access_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'access_count') THEN
    ALTER TABLE tokens ADD COLUMN access_count integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'max_access_count') THEN
    ALTER TABLE tokens ADD COLUMN max_access_count integer DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'device_fingerprint') THEN
    ALTER TABLE tokens ADD COLUMN device_fingerprint text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'ip_addresses') THEN
    ALTER TABLE tokens ADD COLUMN ip_addresses jsonb DEFAULT '[]'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'revoked') THEN
    ALTER TABLE tokens ADD COLUMN revoked boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'revoked_reason') THEN
    ALTER TABLE tokens ADD COLUMN revoked_reason text;
  END IF;
END $$;

-- Index pour tracking
CREATE INDEX IF NOT EXISTS idx_tokens_access_count ON tokens(access_count);
CREATE INDEX IF NOT EXISTS idx_tokens_revoked ON tokens(revoked);

-- ============================================================
-- MODIFICATION TABLE LOGS : Ajout tracking avancé
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'device_fingerprint') THEN
    ALTER TABLE logs ADD COLUMN device_fingerprint text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'session_id') THEN
    ALTER TABLE logs ADD COLUMN session_id text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'duree_lecture_secondes') THEN
    ALTER TABLE logs ADD COLUMN duree_lecture_secondes integer;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'pages_vues') THEN
    ALTER TABLE logs ADD COLUMN pages_vues jsonb DEFAULT '[]'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'geo_data') THEN
    ALTER TABLE logs ADD COLUMN geo_data jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logs' AND column_name = 'suspect') THEN
    ALTER TABLE logs ADD COLUMN suspect boolean DEFAULT false;
  END IF;
END $$;

-- Index pour analyse
CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_device_fingerprint ON logs(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_logs_suspect ON logs(suspect) WHERE suspect = true;

-- ============================================================
-- NOUVELLE TABLE : FORMULES D'ABONNEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS formules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL UNIQUE,
  description text,
  duree_jours integer NOT NULL,
  prix_fcfa integer NOT NULL,
  actif boolean DEFAULT true,
  essai_gratuit boolean DEFAULT false,
  priorite integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Insertion des formules par défaut
INSERT INTO formules (nom, description, duree_jours, prix_fcfa, essai_gratuit, priorite) 
VALUES 
  ('Essai Gratuit', 'Essai gratuit de 3 jours', 3, 0, true, 1),
  ('Hebdomadaire', 'Abonnement hebdomadaire', 7, 1500, false, 2),
  ('Mensuel', 'Abonnement mensuel', 30, 5000, false, 3),
  ('Trimestriel', 'Abonnement trimestriel', 90, 12000, false, 4),
  ('Annuel', 'Abonnement annuel avec reduction', 365, 40000, false, 5)
ON CONFLICT (nom) DO NOTHING;

-- ============================================================
-- NOUVELLE TABLE : ABONNEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS abonnements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  formule_id uuid NOT NULL REFERENCES formules(id),
  date_debut timestamptz NOT NULL DEFAULT now(),
  date_fin timestamptz NOT NULL,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'expire', 'suspendu', 'annule')),
  renouvellement_auto boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_abonnements_user_id ON abonnements(user_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_statut ON abonnements(statut);
CREATE INDEX IF NOT EXISTS idx_abonnements_date_fin ON abonnements(date_fin);

-- ============================================================
-- NOUVELLE TABLE : PAIEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  abonnement_id uuid REFERENCES abonnements(id) ON DELETE SET NULL,
  montant_fcfa integer NOT NULL,
  methode_paiement text NOT NULL,
  reference_transaction text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'confirme', 'echoue', 'rembourse')),
  notes text,
  date_paiement timestamptz DEFAULT now(),
  confirme_par uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_paiements_user_id ON paiements(user_id);
CREATE INDEX IF NOT EXISTS idx_paiements_statut ON paiements(statut);
CREATE INDEX IF NOT EXISTS idx_paiements_date ON paiements(date_paiement DESC);
CREATE INDEX IF NOT EXISTS idx_paiements_reference ON paiements(reference_transaction);

-- ============================================================
-- NOUVELLE TABLE : ACCÈS SUSPECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS acces_suspects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id uuid REFERENCES tokens(id) ON DELETE SET NULL,
  type_alerte text NOT NULL CHECK (type_alerte IN ('acces_multiple', 'ip_differente', 'device_multiple', 'geo_suspect', 'vitesse_lecture_anormale')),
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  data jsonb,
  action_prise text,
  resolu boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_acces_suspects_user_id ON acces_suspects(user_id);
CREATE INDEX IF NOT EXISTS idx_acces_suspects_resolu ON acces_suspects(resolu) WHERE resolu = false;
CREATE INDEX IF NOT EXISTS idx_acces_suspects_severity ON acces_suspects(severity);
CREATE INDEX IF NOT EXISTS idx_acces_suspects_type ON acces_suspects(type_alerte);

-- ============================================================
-- NOUVELLE TABLE : SESSIONS DE LECTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions_lecture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  device_fingerprint text,
  ip_address text,
  user_agent text,
  debut_session timestamptz DEFAULT now(),
  fin_session timestamptz,
  derniere_activite timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  pages_consultees jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions_lecture(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_id ON sessions_lecture(token_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions_lecture(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions_lecture(session_id);

-- ============================================================
-- NOUVELLE TABLE : NOTIFICATIONS WHATSAPP
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pdf_id uuid REFERENCES pdfs(id) ON DELETE SET NULL,
  type_notification text NOT NULL CHECK (type_notification IN ('nouvelle_edition', 'rappel_paiement', 'expiration_proche', 'suspension', 'bienvenue', 'autre')),
  numero_destinataire text NOT NULL,
  message text NOT NULL,
  lien_lecture text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'envoye', 'echoue', 'annule')),
  date_envoi_prevue timestamptz,
  date_envoi_reelle timestamptz,
  tentatives integer DEFAULT 0,
  erreur text,
  created_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_statut ON notifications(statut);
CREATE INDEX IF NOT EXISTS idx_notifications_date_envoi_prevue ON notifications(date_envoi_prevue);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type_notification);

-- ============================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================

ALTER TABLE formules ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE acces_suspects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions_lecture ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES : FORMULES (lecture publique pour inscription)
-- ============================================================

CREATE POLICY "Tout le monde peut voir les formules actives"
  ON formules FOR SELECT
  TO authenticated, anon
  USING (actif = true);

CREATE POLICY "Admins peuvent gérer les formules"
  ON formules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES : ABONNEMENTS
-- ============================================================

CREATE POLICY "Utilisateurs voient leurs abonnements"
  ON abonnements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins voient tous les abonnements"
  ON abonnements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins gèrent tous les abonnements"
  ON abonnements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES : PAIEMENTS
-- ============================================================

CREATE POLICY "Utilisateurs voient leurs paiements"
  ON paiements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins gèrent tous les paiements"
  ON paiements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES : ACCÈS SUSPECTS
-- ============================================================

CREATE POLICY "Admins voient tous les accès suspects"
  ON acces_suspects FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- RLS POLICIES : SESSIONS DE LECTURE
-- ============================================================

CREATE POLICY "Utilisateurs voient leurs sessions"
  ON sessions_lecture FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins voient toutes les sessions"
  ON sessions_lecture FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Système peut créer et modifier sessions"
  ON sessions_lecture FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Système peut mettre à jour sessions"
  ON sessions_lecture FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES : NOTIFICATIONS
-- ============================================================

CREATE POLICY "Utilisateurs voient leurs notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins gèrent toutes les notifications"
  ON notifications FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- FUNCTIONS : Génération numéro d'abonné unique
-- ============================================================

CREATE OR REPLACE FUNCTION generate_numero_abonne()
RETURNS TEXT AS $$
DECLARE
  prefix TEXT := 'ENQ';
  numero TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    numero := prefix || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
    SELECT EXISTS(SELECT 1 FROM users WHERE numero_abonne = numero) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN numero;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTIONS : Génération code de parrainage
-- ============================================================

CREATE OR REPLACE FUNCTION generate_code_parrainage()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM users WHERE code_parrainage = code) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER : Auto-génération numéro abonné et code parrainage
-- ============================================================

CREATE OR REPLACE FUNCTION auto_generate_user_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_abonne IS NULL THEN
    NEW.numero_abonne := generate_numero_abonne();
  END IF;
  
  IF NEW.code_parrainage IS NULL THEN
    NEW.code_parrainage := generate_code_parrainage();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_user_codes ON users;
CREATE TRIGGER trigger_auto_generate_user_codes
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_user_codes();

-- ============================================================
-- FUNCTION : Vérifier si un abonné a accès à une édition
-- ============================================================

CREATE OR REPLACE FUNCTION user_has_access_to_edition(
  p_user_id UUID,
  p_pdf_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_status TEXT;
  user_end_date TIMESTAMPTZ;
  pdf_date DATE;
BEGIN
  SELECT statut_abonnement, date_fin_abonnement
  INTO user_status, user_end_date
  FROM users
  WHERE id = p_user_id;
  
  SELECT role INTO user_status FROM users WHERE id = p_user_id;
  IF user_status = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  SELECT date_edition INTO pdf_date FROM pdfs WHERE id = p_pdf_id;
  
  IF user_status IN ('actif', 'essai') AND user_end_date >= NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
