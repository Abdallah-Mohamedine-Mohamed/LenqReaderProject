/*
  # Correction du conflit entre auth.users et public.users

  1. Problème identifié
    - La table public.users entre en conflit avec auth.users de Supabase
    - Supabase Auth essaie d'insérer dans public.users mais échoue

  2. Solution
    - Supprimer le trigger problématique temporairement
    - Créer une fonction qui s'exécute APRÈS l'insertion dans auth.users
    - Synchroniser les données avec notre table public.users via trigger ou fonction

  3. Approche
    - Utiliser un trigger sur auth.users qui copie dans public.users
    - Ou créer les users manuellement après signup
*/

-- Supprimer l'ancien trigger qui cause le problème
DROP TRIGGER IF EXISTS trigger_auto_generate_user_codes ON users;

-- Modifier le trigger pour qu'il ne s'exécute que sur UPDATE ou lorsque les colonnes sont NULL
CREATE OR REPLACE FUNCTION auto_generate_user_codes()
RETURNS TRIGGER AS $$
BEGIN
  -- Générer numéro abonné seulement s'il est NULL
  IF NEW.numero_abonne IS NULL THEN
    NEW.numero_abonne := generate_numero_abonne();
  END IF;
  
  -- Générer code parrainage seulement s'il est NULL
  IF NEW.code_parrainage IS NULL THEN
    NEW.code_parrainage := generate_code_parrainage();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recréer le trigger pour INSERT et UPDATE
CREATE TRIGGER trigger_auto_generate_user_codes
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_user_codes();

-- S'assurer que les colonnes nom et email peuvent être NULL temporairement lors de la création
DO $$
BEGIN
  -- Modifier la contrainte NOT NULL sur nom pour permettre la création initiale
  ALTER TABLE users ALTER COLUMN nom DROP NOT NULL;
  
EXCEPTION
  WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
END $$;

-- Fonction pour créer un utilisateur dans public.users après inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, nom, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'lecteur'),
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nom = COALESCE(public.users.nom, EXCLUDED.nom);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Créer le trigger sur auth.users pour synchroniser avec public.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
