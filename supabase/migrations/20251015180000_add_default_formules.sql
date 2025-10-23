/*
  # Ajout des formules d'abonnement par défaut

  1. Insère les formules standard:
    - Essai gratuit (7 jours)
    - Hebdomadaire (7 jours, 1000 FCFA)
    - Mensuel (30 jours, 3500 FCFA)
    - Trimestriel (90 jours, 9000 FCFA)
    - Annuel (365 jours, 30000 FCFA)

  2. Configuration:
    - Toutes actives par défaut
    - Priorités définies pour affichage
    - Descriptions claires

  3. Note: Utilise ON CONFLICT pour éviter doublons
*/

-- Insert default formules if they don't exist
INSERT INTO formules (nom, description, duree_jours, prix_fcfa, actif, essai_gratuit, priorite)
VALUES
  (
    'Essai Gratuit',
    'Découvrez L''Enquêteur gratuitement pendant 7 jours. Aucune carte bancaire requise.',
    7,
    0,
    true,
    true,
    1
  ),
  (
    'Hebdomadaire',
    'Accès complet pendant 7 jours. Idéal pour découvrir notre contenu.',
    7,
    1000,
    true,
    false,
    2
  ),
  (
    'Mensuel',
    'Un mois complet d''investigation de qualité. Le meilleur rapport qualité-prix.',
    30,
    3500,
    true,
    false,
    3
  ),
  (
    'Trimestriel',
    'Économisez 10% avec notre formule 3 mois. Engagement optimal.',
    90,
    9000,
    true,
    false,
    4
  ),
  (
    'Annuel',
    'Meilleure offre : 1 an d''accès complet. Économisez plus de 15% !',
    365,
    30000,
    true,
    false,
    5
  )
ON CONFLICT (nom) DO UPDATE
  SET
    description = EXCLUDED.description,
    duree_jours = EXCLUDED.duree_jours,
    prix_fcfa = EXCLUDED.prix_fcfa,
    actif = EXCLUDED.actif,
    essai_gratuit = EXCLUDED.essai_gratuit,
    priorite = EXCLUDED.priorite,
    created_at = formules.created_at;

-- Add unique constraint on nom if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'formules_nom_key'
  ) THEN
    ALTER TABLE formules ADD CONSTRAINT formules_nom_key UNIQUE (nom);
  END IF;
END $$;

-- Create index for active formules
CREATE INDEX IF NOT EXISTS idx_formules_actif_priorite ON formules(actif, priorite);

-- Update abonnements table to allow NULL abonnement_id temporarily
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'abonnements' AND column_name = 'statut' AND data_type = 'text'
  ) THEN
    ALTER TABLE abonnements
    ALTER COLUMN statut TYPE text;

    ALTER TABLE abonnements
    ADD CONSTRAINT abonnements_statut_check
    CHECK (statut IN ('actif', 'expire', 'suspendu', 'annule', 'en_attente'));
  END IF;
END $$;
