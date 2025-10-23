/*
  # Correction finale du trigger d'authentification

  1. Problème
    - Le trigger on_auth_user_created est sur public.users au lieu de auth.users
    - Cela cause l'erreur "Database error saving new user"

  2. Solution
    - Supprimer le trigger de public.users
    - Créer le trigger sur auth.users dans le schéma auth
    - La fonction handle_new_user doit être accessible depuis le schéma auth

  3. Important
    - Le trigger doit être AFTER INSERT sur auth.users
    - La fonction doit avoir SECURITY DEFINER pour accéder à public.users
*/

-- Supprimer l'ancien trigger mal placé
DROP TRIGGER IF EXISTS on_auth_user_created ON public.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- S'assurer que la fonction handle_new_user existe et a les bonnes permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insérer dans public.users avec les données de auth.users
  INSERT INTO public.users (id, email, nom, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'lecteur'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nom = COALESCE(public.users.nom, EXCLUDED.nom),
    role = COALESCE(public.users.role, EXCLUDED.role);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger sur auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Vérifier que la fonction auto_generate_user_codes fonctionne correctement
CREATE OR REPLACE FUNCTION public.auto_generate_user_codes()
RETURNS TRIGGER AS $$
BEGIN
  -- Générer numéro abonné seulement s'il est NULL
  IF NEW.numero_abonne IS NULL THEN
    NEW.numero_abonne := public.generate_numero_abonne();
  END IF;
  
  -- Générer code parrainage seulement s'il est NULL
  IF NEW.code_parrainage IS NULL THEN
    NEW.code_parrainage := public.generate_code_parrainage();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- S'assurer que le trigger sur public.users existe pour la génération des codes
DROP TRIGGER IF EXISTS trigger_auto_generate_user_codes ON public.users;
CREATE TRIGGER trigger_auto_generate_user_codes
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_user_codes();
